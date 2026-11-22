import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../lib/errors';
import { addDaysToApiDate, clampedDayOfMonth, toApiDate, toDateOnly } from '../../lib/dates';
import { validateBankAccountOwnership } from '../bank-accounts/validate-ownership';
import { transactionInclude } from '../transactions/transaction-include';
import { dueDateForPurchase, invoicePeriodForDueDate } from './invoice';
import type { InvoiceQuery, PayInvoiceBody } from './cards.schemas';

const roundMoney = (value: number) => Math.round(value * 100) / 100;

async function findCreditCard(userId: string, cardId: string) {
  const card = await prisma.card.findFirst({ where: { id: cardId, userId } });

  if (!card) {
    throw notFound('Cartão não encontrado');
  }

  if (card.kind !== 'CREDIT' || card.closingDay === null || card.dueDay === null) {
    throw badRequest('Só cartões de crédito têm fatura');
  }

  return { ...card, closingDay: card.closingDay, dueDay: card.dueDay };
}

/** A fatura que vence no mês de `dueDate` (no dia de vencimento do cartão). */
function resolveInvoice(card: { closingDay: number; dueDay: number }, dueDateInput: string) {
  const raw = toApiDate(dueDateInput);
  const dueDate = clampedDayOfMonth(raw.getUTCFullYear(), raw.getUTCMonth(), card.dueDay);
  return { dueDate, period: invoicePeriodForDueDate(card, dueDate) };
}

/** Compras no crédito que entram na fatura (período de fechamento a fechamento). */
function purchasesOf(userId: string, cardId: string, period: { start: Date; end: Date }) {
  return {
    userId,
    cardId,
    type: 'EXPENSE' as const,
    paymentMethod: 'CREDIT_CARD' as const,
    date: { gte: period.start, lt: period.end },
  };
}

/** Resumo da fatura: total, quanto falta pagar e os pagamentos já feitos. */
export async function getInvoice(userId: string, cardId: string, query: InvoiceQuery) {
  const card = await findCreditCard(userId, cardId);
  const { dueDate, period } = query.purchaseDate
    ? resolveInvoice(card, toDateOnly(dueDateForPurchase(card, toApiDate(query.purchaseDate))))
    : resolveInvoice(card, query.dueDate!);

  const [byStatus, payments] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['paid'],
      where: purchasesOf(userId, card.id, period),
      _sum: { value: true },
      _count: true,
    }),
    prisma.transaction.findMany({
      where: { userId, cardId: card.id, type: 'INVOICE_PAYMENT', invoiceDueDate: dueDate },
      include: transactionInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const pending = byStatus.find((group) => !group.paid);
  const paid = byStatus.find((group) => group.paid);

  return {
    cardId: card.id,
    dueDate: toDateOnly(dueDate),
    closingDate: toDateOnly(period.end),
    periodStart: toDateOnly(period.start),
    periodEnd: toDateOnly(addDaysToApiDate(period.end, -1)),
    total: roundMoney((pending?._sum.value ?? 0) + (paid?._sum.value ?? 0)),
    pendingTotal: roundMoney(pending?._sum.value ?? 0),
    paidTotal: roundMoney(paid?._sum.value ?? 0),
    purchasesCount: (pending?._count ?? 0) + (paid?._count ?? 0),
    pendingCount: pending?._count ?? 0,
    payments,
  };
}

/**
 * Paga a fatura: cria um lançamento INVOICE_PAYMENT que tira o total da conta
 * e marca as compras pendentes da fatura como pagas, apontando para ele. Tudo
 * numa transação. Excluir o pagamento desfaz (transactions.service.remove).
 */
export async function payInvoice(userId: string, cardId: string, body: PayInvoiceBody) {
  const card = await findCreditCard(userId, cardId);
  await validateBankAccountOwnership(userId, body.bankAccountId);
  const { dueDate, period } = resolveInvoice(card, body.dueDate);

  const pending = await prisma.transaction.findMany({
    where: { ...purchasesOf(userId, card.id, period), paid: false },
    select: { id: true, value: true },
  });

  if (pending.length === 0) {
    throw badRequest('Esta fatura não tem compras pendentes');
  }

  const total = roundMoney(pending.reduce((sum, purchase) => sum + purchase.value, 0));

  return prisma.$transaction(async (tx) => {
    const payment = await tx.transaction.create({
      data: {
        userId,
        type: 'INVOICE_PAYMENT',
        name: `Fatura ${card.name}`,
        value: total,
        date: toApiDate(body.date),
        bankAccountId: body.bankAccountId,
        cardId: card.id,
        paymentMethod: 'ACCOUNT',
        paid: true,
        invoiceDueDate: dueDate,
      },
      include: transactionInclude,
    });

    await tx.transaction.updateMany({
      where: { id: { in: pending.map((purchase) => purchase.id) } },
      data: { paid: true, invoicePaymentId: payment.id },
    });

    return payment;
  });
}
