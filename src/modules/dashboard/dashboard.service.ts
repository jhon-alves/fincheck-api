import { prisma } from '../../lib/prisma';
import {
  addDaysToApiDate,
  startOfMonthUTC,
  startOfNextMonthUTC,
  toApiDate,
  toDateOnly,
} from '../../lib/dates';
import * as bankAccountsService from '../bank-accounts/bank-accounts.service';
import * as cardsService from '../cards/cards.service';
import { dueDatesBetween, invoicePeriodForDueDate } from '../cards/invoice';
import { transactionInclude } from '../transactions/transaction-include';
import { ensureRecurringOccurrences } from '../recurring/recurring.service';
import type { SummaryFilters } from './dashboard.schemas';

const HISTORY_MONTHS = 6;
const TOP_CATEGORIES = 5;
const UPCOMING_DAYS = 7;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

interface MonthTotals {
  income: number;
  expense: number;
  savings: number;
  openInvoices: number;
}

type SummaryTransaction = {
  date: Date;
  value: number;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  paid: boolean;
  paymentMethod: string;
  categoryId: string | null;
};

function totalsFor(transactions: SummaryTransaction[]): MonthTotals {
  let income = 0;
  let expense = 0;
  let openInvoices = 0;

  for (const transaction of transactions) {
    if (transaction.type === 'INCOME') income += transaction.value;
    if (transaction.type === 'EXPENSE') {
      expense += transaction.value;

      if (transaction.paymentMethod === 'CREDIT_CARD' && !transaction.paid) {
        openInvoices += transaction.value;
      }
    }
  }

  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    savings: roundMoney(income - expense),
    openInvoices: roundMoney(openInvoices),
  };
}

const isInMonth = (date: Date, year: number, month: number) =>
  date >= startOfMonthUTC(year, month) &&
  date < startOfNextMonthUTC(year, month);

/** Início do dia (UTC) de uma data da API. */
const startOfDayUTC = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

export async function getSummary(userId: string, filters: SummaryFilters) {
  const { month, year } = filters;
  const today = toApiDate(filters.today ?? toDateOnly(new Date()));
  const todayStart = startOfDayUTC(today);
  const tomorrowStart = startOfDayUTC(addDaysToApiDate(today, 1));
  const upcomingEnd = addDaysToApiDate(today, UPCOMING_DAYS);
  const upcomingLimit = startOfDayUTC(addDaysToApiDate(upcomingEnd, 1));

  const historyStart = startOfMonthUTC(year, month - (HISTORY_MONTHS - 1));
  const monthEnd = startOfNextMonthUTC(year, month);

  await ensureRecurringOccurrences(userId, monthEnd);

  const [accounts, cards, categories, periodTransactions, upcoming, recent, fixed] =
    await Promise.all([
      bankAccountsService.findAllByUserId(userId),
      cardsService.findAllByUserId(userId, {}),
      prisma.category.findMany({ where: { userId } }),
      prisma.transaction.findMany({
        where: {
          userId,
          type: { in: ['INCOME', 'EXPENSE'] },
          date: { gte: historyStart, lt: monthEnd },
        },
        select: {
          date: true,
          value: true,
          type: true,
          paid: true,
          paymentMethod: true,
          categoryId: true,
        },
      }),
      // Pendentes dos próximos dias. Compras no crédito ficam de fora: elas
      // são cobradas pela fatura, que entra como um item próprio.
      prisma.transaction.findMany({
        where: {
          userId,
          paid: false,
          paymentMethod: { not: 'CREDIT_CARD' },
          date: { gte: todayStart, lt: upcomingLimit },
        },
        include: transactionInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      // Últimos lançamentos até hoje (parcelas futuras e previstos não contam).
      prisma.transaction.findMany({
        where: {
          userId,
          date: { lt: tomorrowStart },
          OR: [{ recurringRuleId: null }, { paid: true }],
        },
        include: transactionInclude,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      // Fixos do mês: ocorrências de lançamentos recorrentes.
      prisma.transaction.findMany({
        where: {
          userId,
          recurringRuleId: { not: null },
          date: { gte: startOfMonthUTC(year, month), lt: monthEnd },
        },
        include: transactionInclude,
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

  // KPIs do mês e do mês anterior (para a variação %).
  const previousMonthDate = startOfMonthUTC(year, month - 1);
  const current = totalsFor(
    periodTransactions.filter((t) => isInMonth(t.date, year, month)),
  );
  const previous = totalsFor(
    periodTransactions.filter((t) =>
      isInMonth(
        t.date,
        previousMonthDate.getUTCFullYear(),
        previousMonthDate.getUTCMonth(),
      ),
    ),
  );

  // Evolução dos últimos 6 meses (entradas × saídas).
  const history = Array.from({ length: HISTORY_MONTHS }, (_, index) => {
    const reference = startOfMonthUTC(
      year,
      month - (HISTORY_MONTHS - 1) + index,
    );
    const refYear = reference.getUTCFullYear();
    const refMonth = reference.getUTCMonth();
    const totals = totalsFor(
      periodTransactions.filter((t) => isInMonth(t.date, refYear, refMonth)),
    );

    return {
      year: refYear,
      month: refMonth,
      income: totals.income,
      expense: totals.expense,
    };
  });

  // Gastos por categoria: top 5 + "Outros".
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const expenseByCategory = new Map<string | null, number>();

  for (const transaction of periodTransactions) {
    if (transaction.type !== 'EXPENSE') continue;
    if (!isInMonth(transaction.date, year, month)) continue;

    expenseByCategory.set(
      transaction.categoryId,
      (expenseByCategory.get(transaction.categoryId) ?? 0) + transaction.value,
    );
  }

  const rankedCategories = [...expenseByCategory.entries()]
    .filter(([categoryId]) => categoryId !== null)
    .sort(([, a], [, b]) => b - a);

  const topCategories = rankedCategories
    .slice(0, TOP_CATEGORIES)
    .map(([categoryId, total]) => {
      const category = categoriesById.get(categoryId!);

      return {
        categoryId,
        name: category?.name ?? 'Sem categoria',
        icon: category?.icon ?? 'other',
        color: category?.color ?? null,
        total: roundMoney(total),
      };
    });

  const othersTotal =
    rankedCategories
      .slice(TOP_CATEGORIES)
      .reduce((total, [, value]) => total + value, 0) +
    (expenseByCategory.get(null) ?? 0);

  const expensesByCategory =
    othersTotal > 0
      ? [
          ...topCategories,
          {
            categoryId: null,
            name: 'Outros',
            icon: 'other',
            color: null,
            total: roundMoney(othersTotal),
          },
        ]
      : topCategories;

  // Vencimentos de fatura nos próximos 7 dias, com o valor em aberto.
  const invoiceCards = cards.filter(
    (card) =>
      card.kind === 'CREDIT' &&
      card.closingDay != null &&
      card.dueDay != null,
  );

  const invoices = (
    await Promise.all(
      invoiceCards.flatMap((card) =>
        dueDatesBetween({ dueDay: card.dueDay! }, todayStart, upcomingEnd).map(
          async (dueDate) => {
            const period = invoicePeriodForDueDate(
              { closingDay: card.closingDay!, dueDay: card.dueDay! },
              dueDate,
            );
            const { _sum } = await prisma.transaction.aggregate({
              where: {
                userId,
                cardId: card.id,
                paymentMethod: 'CREDIT_CARD',
                type: 'EXPENSE',
                paid: false,
                date: { gte: period.start, lt: period.end },
              },
              _sum: { value: true },
            });

            return {
              cardId: card.id,
              cardName: card.name,
              brand: card.brand,
              lastDigits: card.lastDigits,
              color: card.color,
              dueDate: toDateOnly(dueDate),
              closingDate: toDateOnly(period.end),
              amount: roundMoney(_sum.value ?? 0),
            };
          },
        ),
      ),
    )
  )
    .filter((invoice) => invoice.amount > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    totalBalance: roundMoney(
      accounts.reduce((total, account) => total + account.currentBalance, 0),
    ),
    current,
    previous,
    expensesByCategory,
    history,
    cards: cards.filter((card) => !card.archived),
    upcoming: {
      transactions: upcoming,
      invoices,
    },
    recentTransactions: recent,
    fixed: {
      transactions: fixed,
      income: roundMoney(
        fixed.filter((t) => t.type === 'INCOME').reduce((total, t) => total + t.value, 0),
      ),
      expense: roundMoney(
        fixed.filter((t) => t.type === 'EXPENSE').reduce((total, t) => total + t.value, 0),
      ),
      confirmed: fixed.filter((t) => t.paid).length,
    },
  };
}
