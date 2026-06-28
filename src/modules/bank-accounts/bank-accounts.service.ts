import { prisma } from '../../lib/prisma';
import { validateBankAccountOwnership } from './validate-ownership';
import type {
  CreateBankAccountBody,
  UpdateBankAccountBody,
} from './bank-accounts.schemas';

export function create(userId: string, data: CreateBankAccountBody) {
  return prisma.bankAccount.create({
    data: { userId, ...data },
  });
}

export async function findAllByUserId(userId: string) {
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { userId },
    include: {
      transactions: {
        select: { value: true, type: true },
      },
    },
  });

  return bankAccounts.map(({ transactions, ...bankAccount }) => {
    const totalTransactions = transactions.reduce(
      (acc, transaction) =>
        acc + (transaction.type === 'INCOME' ? transaction.value : -transaction.value),
      0,
    );

    const currentBalance = bankAccount.initialBalance + totalTransactions;

    return { ...bankAccount, currentBalance };
  });
}

export async function update(
  userId: string,
  bankAccountId: string,
  data: UpdateBankAccountBody,
) {
  await validateBankAccountOwnership(userId, bankAccountId);

  return prisma.bankAccount.update({
    where: { id: bankAccountId },
    data,
  });
}

export async function remove(userId: string, bankAccountId: string) {
  await validateBankAccountOwnership(userId, bankAccountId);

  await prisma.bankAccount.delete({ where: { id: bankAccountId } });
}
