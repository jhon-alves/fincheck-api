import { prisma } from '../../lib/prisma';
import { validateBankAccountOwnership } from '../bank-accounts/validate-ownership';
import { validateCategoryOwnership } from '../categories/validate-ownership';
import { validateTransactionOwnership } from './validate-ownership';
import type {
  CreateTransactionBody,
  UpdateTransactionBody,
  TransactionFilters,
} from './transactions.schemas';

interface ValidateOwnershipParams {
  userId: string;
  bankAccountId?: string;
  categoryId?: string;
  transactionId?: string;
}

async function validateEntitiesOwnership({
  userId,
  bankAccountId,
  categoryId,
  transactionId,
}: ValidateOwnershipParams) {
  await Promise.all([
    transactionId
      ? validateTransactionOwnership(userId, transactionId)
      : undefined,
    bankAccountId
      ? validateBankAccountOwnership(userId, bankAccountId)
      : undefined,
    categoryId ? validateCategoryOwnership(userId, categoryId) : undefined,
  ]);
}

export async function create(userId: string, body: CreateTransactionBody) {
  await validateEntitiesOwnership({
    userId,
    bankAccountId: body.bankAccountId,
    categoryId: body.categoryId,
  });

  return prisma.transaction.create({
    data: {
      userId,
      bankAccountId: body.bankAccountId,
      categoryId: body.categoryId,
      name: body.name,
      value: body.value,
      date: new Date(body.date),
      type: body.type,
    },
  });
}

export function findAll(userId: string, filters: TransactionFilters) {
  return prisma.transaction.findMany({
    where: {
      userId,
      bankAccountId: filters.bankAccountId,
      type: filters.type,
      date: {
        gte: new Date(Date.UTC(filters.year, filters.month)),
        lt: new Date(Date.UTC(filters.year, filters.month + 1)),
      },
    },
    include: {
      category: {
        select: { id: true, name: true, icon: true },
      },
    },
  });
}

export async function update(
  userId: string,
  transactionId: string,
  body: UpdateTransactionBody,
) {
  await validateEntitiesOwnership({
    userId,
    transactionId,
    bankAccountId: body.bankAccountId,
    categoryId: body.categoryId,
  });

  return prisma.transaction.update({
    where: { id: transactionId },
    data: {
      bankAccountId: body.bankAccountId,
      categoryId: body.categoryId,
      name: body.name,
      value: body.value,
      date: new Date(body.date),
      type: body.type,
    },
  });
}

export async function remove(userId: string, transactionId: string) {
  await validateEntitiesOwnership({ userId, transactionId });

  await prisma.transaction.delete({ where: { id: transactionId } });
}
