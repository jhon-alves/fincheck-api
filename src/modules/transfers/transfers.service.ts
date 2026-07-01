import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { validateBankAccountOwnership } from '../bank-accounts/validate-ownership';
import type { CreateTransferBody } from './transfers.schemas';

export async function create(userId: string, body: CreateTransferBody) {
  await Promise.all([
    validateBankAccountOwnership(userId, body.fromBankAccountId),
    validateBankAccountOwnership(userId, body.toBankAccountId),
  ]);

  return prisma.transaction.create({
    data: {
      userId,
      bankAccountId: body.fromBankAccountId,
      toBankAccountId: body.toBankAccountId,
      categoryId: null,
      name: body.name ?? 'Transferência',
      value: body.value,
      date: new Date(body.date),
      type: 'TRANSFER',
      paid: true,
    },
  });
}

export async function remove(userId: string, transferId: string) {
  const transfer = await prisma.transaction.findFirst({
    where: { id: transferId, userId, type: 'TRANSFER' },
  });

  if (!transfer) {
    throw notFound('Transferência não encontrada');
  }

  await prisma.transaction.delete({ where: { id: transferId } });
}
