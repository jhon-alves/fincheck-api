import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import {
  addMonthsToApiDate,
  startOfMonthUTC,
  startOfNextMonthUTC,
  toApiDate,
  toDateOnly,
} from '../../lib/dates';
import { transactionInclude } from './transaction-include';
import { resolvePayment } from './resolve-payment';

export { transactionInclude };
import { buildInstallments } from './installments';
import * as recurringService from '../recurring/recurring.service';
import {
  type CalendarFilters,
  type CreateTransactionBody,
  type Scope,
  type TransactionFilters,
  type UpdateTransactionBody,
} from './transactions.schemas';


const roundMoney = (value: number) => Math.round(value * 100) / 100;

async function findOwnedTransaction(userId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!transaction) {
    throw notFound('Transação não encontrada');
  }

  return transaction;
}

export async function create(userId: string, body: CreateTransactionBody) {
  const amount = body.totalValue ?? body.value!;

  // Recorrente: cria a regra (o molde) e devolve a 1ª ocorrência.
  if (body.recurrence) {
    const { firstOccurrenceId } = await recurringService.createRule(
      userId,
      {
        type: body.type,
        name: body.name,
        value: amount,
        categoryId: body.categoryId,
        paymentMethod: body.paymentMethod,
        bankAccountId: body.bankAccountId,
        cardId: body.cardId,
        notes: body.notes,
        startDate: body.date,
        recurrence: body.recurrence,
      },
      { firstPaid: body.paid },
    );

    return firstOccurrenceId
      ? prisma.transaction.findUnique({
          where: { id: firstOccurrenceId },
          include: transactionInclude,
        })
      : null;
  }

  const payment = await resolvePayment(userId, body);
  const date = toApiDate(body.date);
  const paid = body.paid ?? payment.paymentMethod !== 'CREDIT_CARD';

  const base = {
    userId,
    categoryId: body.categoryId,
    name: body.name,
    type: body.type,
    notes: body.notes || null,
    ...payment,
  };

  if (body.installments <= 1) {
    return prisma.transaction.create({
      data: { ...base, value: amount, date, paid },
      include: transactionInclude,
    });
  }

  // Parcelado: N transações atômicas, ligadas pelo mesmo grupo. Só a 1ª pode
  // nascer paga; as futuras nascem pendentes.
  const installmentGroupId = randomUUID();
  const installments = buildInstallments(amount, body.installments, date);

  return prisma.$transaction(
    installments.map((installment) =>
      prisma.transaction.create({
        data: {
          ...base,
          value: installment.value,
          date: installment.date,
          paid: installment.number === 1 ? paid : false,
          installmentGroupId,
          installmentNumber: installment.number,
          installmentsTotal: body.installments,
        },
        include: transactionInclude,
      }),
    ),
  );
}

/** [início do dia `from`, início do dia seguinte a `to`) em UTC. */
function dateRange(from: string, to: string): Prisma.DateTimeFilter {
  const start = toApiDate(from);
  const end = toApiDate(to);

  return {
    gte: new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    ),
    lt: new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1),
    ),
  };
}

export async function findAll(userId: string, filters: TransactionFilters) {
  const date =
    filters.from && filters.to
      ? dateRange(filters.from, filters.to)
      : {
          gte: startOfMonthUTC(filters.year!, filters.month!),
          lt: startOfNextMonthUTC(filters.year!, filters.month!),
        };

  await recurringService.ensureRecurringOccurrences(userId, date.lt as Date);

  return prisma.transaction.findMany({
    where: {
      userId,
      date,
      type: filters.type,
      cardId: filters.cardId,
      categoryId: filters.categoryId,
      paymentMethod: filters.paymentMethod,
      paid: filters.paid,
      // Ao filtrar por conta, considera tanto a origem quanto o destino
      // (para que transferências apareçam nos dois lados).
      ...(filters.bankAccountId
        ? {
            OR: [
              { bankAccountId: filters.bankAccountId },
              { toBankAccountId: filters.bankAccountId },
            ],
          }
        : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' } }
        : {}),
    },
    include: transactionInclude,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Agregado por dia para o grid do calendário. */
export async function findCalendar(userId: string, filters: CalendarFilters) {
  await recurringService.ensureRecurringOccurrences(
    userId,
    startOfNextMonthUTC(filters.year, filters.month),
  );

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: startOfMonthUTC(filters.year, filters.month),
        lt: startOfNextMonthUTC(filters.year, filters.month),
      },
    },
    select: {
      date: true,
      value: true,
      type: true,
      installmentGroupId: true,
      recurringRuleId: true,
    },
  });

  const days = new Map<
    string,
    {
      date: string;
      income: number;
      expense: number;
      count: number;
      hasInstallments: boolean;
      hasRecurring: boolean;
    }
  >();

  for (const transaction of transactions) {
    const key = toDateOnly(transaction.date);
    const day = days.get(key) ?? {
      date: key,
      income: 0,
      expense: 0,
      count: 0,
      hasInstallments: false,
      hasRecurring: false,
    };

    if (transaction.type === 'INCOME') day.income += transaction.value;
    if (transaction.type === 'EXPENSE') day.expense += transaction.value;
    day.count += 1;
    day.hasInstallments ||= transaction.installmentGroupId !== null;
    day.hasRecurring ||= transaction.recurringRuleId !== null;

    days.set(key, day);
  }

  return [...days.values()]
    .map((day) => ({
      ...day,
      income: roundMoney(day.income),
      expense: roundMoney(day.expense),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Todas as parcelas de um parcelamento, em ordem. */
export async function findInstallmentGroup(
  userId: string,
  installmentGroupId: string,
) {
  const installments = await prisma.transaction.findMany({
    where: { userId, installmentGroupId },
    include: transactionInclude,
    orderBy: { installmentNumber: 'asc' },
  });

  if (installments.length === 0) {
    throw notFound('Parcelamento não encontrado');
  }

  return installments;
}

/**
 * Parcelas atingidas pelo escopo: só esta, esta e as próximas, ou todas.
 * Fora de um parcelamento o escopo é sempre "só esta".
 */
async function findScopeTargets(
  userId: string,
  transaction: Awaited<ReturnType<typeof findOwnedTransaction>>,
  scope: Scope,
) {
  if (!transaction.installmentGroupId || scope === 'one') {
    return [transaction];
  }

  return prisma.transaction.findMany({
    where: {
      userId,
      installmentGroupId: transaction.installmentGroupId,
      ...(scope === 'following'
        ? { installmentNumber: { gte: transaction.installmentNumber ?? 1 } }
        : {}),
    },
  });
}

export async function update(
  userId: string,
  transactionId: string,
  body: UpdateTransactionBody,
  scope: Scope,
) {
  const current = await findOwnedTransaction(userId, transactionId);

  if (current.type === 'TRANSFER') {
    throw badRequest('Use a rota de transferências para editar transferências');
  }

  if (current.installmentGroupId && body.type !== 'EXPENSE') {
    throw badRequest('Parcelas só podem ser saídas');
  }

  if (current.recurringRuleId) {
    return recurringService.updateOccurrence(userId, current, body, scope);
  }

  const payment = await resolvePayment(userId, body, current.cardId);
  const newDate = toApiDate(body.date);
  const dateChanged = toDateOnly(newDate) !== toDateOnly(current.date);
  const targets = await findScopeTargets(userId, current, scope);
  const currentNumber = current.installmentNumber ?? 1;

  const data = {
    name: body.name,
    categoryId: body.categoryId,
    type: body.type,
    value: body.value,
    notes: body.notes || null,
    ...payment,
  };

  await prisma.$transaction(
    targets.map((target) =>
      prisma.transaction.update({
        where: { id: target.id },
        data: {
          ...data,
          // Se a data mudou, as demais parcelas do escopo andam junto,
          // mantendo o intervalo de um mês entre elas. Se não mudou, cada uma
          // fica onde está (evita "grudar" no dia 28 por causa de fevereiro).
          ...(target.id === current.id
            ? { date: newDate, paid: body.paid ?? target.paid }
            : dateChanged
              ? {
                  date: addMonthsToApiDate(
                    newDate,
                    (target.installmentNumber ?? 1) - currentNumber,
                  ),
                }
              : {}),
        },
      }),
    ),
  );

  return prisma.transaction.findUnique({
    where: { id: transactionId },
    include: transactionInclude,
  });
}

export async function remove(
  userId: string,
  transactionId: string,
  scope: Scope,
) {
  const current = await findOwnedTransaction(userId, transactionId);

  if (current.recurringRuleId) {
    await recurringService.removeOccurrence(current, scope);
    return;
  }

  const targets = await findScopeTargets(userId, current, scope);

  await prisma.transaction.deleteMany({
    where: { userId, id: { in: targets.map((target) => target.id) } },
  });
}

/** Confirma o recebimento/pagamento (ou volta para pendente). */
export async function confirm(userId: string, transactionId: string, paid = true) {
  await findOwnedTransaction(userId, transactionId);

  return prisma.transaction.update({
    where: { id: transactionId },
    data: { paid },
    include: transactionInclude,
  });
}
