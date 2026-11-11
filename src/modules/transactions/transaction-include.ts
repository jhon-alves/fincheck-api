import type { Prisma } from '@prisma/client';

/** Relações devolvidas junto com cada transação. */
export const transactionInclude = {
  category: {
    select: { id: true, name: true, icon: true, type: true, color: true },
  },
  bankAccount: {
    select: { id: true, name: true, color: true },
  },
  toBankAccount: {
    select: { id: true, name: true, color: true },
  },
  card: {
    select: {
      id: true,
      name: true,
      brand: true,
      lastDigits: true,
      color: true,
      kind: true,
    },
  },
  recurringRule: {
    select: {
      id: true,
      frequency: true,
      dayRule: true,
      dayOfMonth: true,
      businessDayN: true,
      active: true,
      endDate: true,
      autoConfirm: true,
    },
  },
} satisfies Prisma.TransactionInclude;
