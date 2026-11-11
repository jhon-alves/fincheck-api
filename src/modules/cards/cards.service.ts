import type { Card } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { validateBankAccountOwnership } from '../bank-accounts/validate-ownership';
import { validateCardOwnership } from './validate-ownership';
import type {
  CardFilters,
  CreateCardBody,
  UpdateCardBody,
} from './cards.schemas';

/** Débito não tem limite, fechamento nem vencimento: zera esses campos. */
function normalizeCardData(data: CreateCardBody | UpdateCardBody) {
  const isCredit = data.kind === 'CREDIT';

  return {
    name: data.name,
    holderName: data.holderName.toUpperCase(),
    lastDigits: data.lastDigits,
    brand: data.brand,
    kind: data.kind,
    color: data.color,
    expMonth: data.expMonth,
    expYear: data.expYear,
    bankAccountId: data.bankAccountId ?? null,
    creditLimit: isCredit ? (data.creditLimit ?? null) : null,
    closingDay: isCredit ? (data.closingDay ?? null) : null,
    dueDay: isCredit ? (data.dueDay ?? null) : null,
    ...(data.archived !== undefined ? { archived: data.archived } : {}),
  };
}

/**
 * Limite usado = compras no crédito ainda não pagas (inclui parcelas futuras,
 * que já comprometem o limite desde o dia da compra).
 */
export async function withLimits<T extends Card>(cards: T[]) {
  const creditCardIds = cards
    .filter((card) => card.kind === 'CREDIT')
    .map((card) => card.id);

  const usage = creditCardIds.length
    ? await prisma.transaction.groupBy({
        by: ['cardId'],
        where: {
          cardId: { in: creditCardIds },
          paymentMethod: 'CREDIT_CARD',
          type: 'EXPENSE',
          paid: false,
          // Recorrentes futuras (assinaturas) ainda não foram cobradas: só
          // consomem o limite quando a data chega. Parcelas futuras consomem
          // desde a compra.
          OR: [{ recurringRuleId: null }, { date: { lt: tomorrowStart() } }],
        },
        _sum: { value: true },
      })
    : [];

  const usedByCard = new Map(
    usage.map((row) => [row.cardId, row._sum.value ?? 0]),
  );

  return cards.map((card) => {
    if (card.kind !== 'CREDIT') {
      return { ...card, usedLimit: null, availableLimit: null };
    }

    const usedLimit = Math.round((usedByCard.get(card.id) ?? 0) * 100) / 100;
    const availableLimit =
      card.creditLimit == null
        ? null
        : Math.round((card.creditLimit - usedLimit) * 100) / 100;

    return { ...card, usedLimit, availableLimit };
  });
}

function tomorrowStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

const cardInclude = {
  bankAccount: { select: { id: true, name: true, color: true } },
} as const;

export async function create(userId: string, data: CreateCardBody) {
  if (data.bankAccountId) {
    await validateBankAccountOwnership(userId, data.bankAccountId);
  }

  const card = await prisma.card.create({
    data: { userId, ...normalizeCardData(data) },
    include: cardInclude,
  });

  const [cardWithLimits] = await withLimits([card]);
  return cardWithLimits;
}

export async function findAllByUserId(userId: string, filters: CardFilters) {
  const cards = await prisma.card.findMany({
    where: {
      userId,
      ...(filters.includeArchived ? {} : { archived: false }),
    },
    include: cardInclude,
    orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }],
  });

  return withLimits(cards);
}

export async function update(
  userId: string,
  cardId: string,
  data: UpdateCardBody,
) {
  await Promise.all([
    validateCardOwnership(userId, cardId),
    data.bankAccountId
      ? validateBankAccountOwnership(userId, data.bankAccountId)
      : undefined,
  ]);

  const card = await prisma.card.update({
    where: { id: cardId },
    data: normalizeCardData(data),
    include: cardInclude,
  });

  const [cardWithLimits] = await withLimits([card]);
  return cardWithLimits;
}

export async function remove(userId: string, cardId: string) {
  await validateCardOwnership(userId, cardId);

  // As transações do cartão saem junto (onDelete: Cascade), como nas contas.
  // Para manter o histórico, o caminho é arquivar.
  await prisma.card.delete({ where: { id: cardId } });
}
