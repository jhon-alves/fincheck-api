import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { toApiDate } from '../../lib/dates';
import { validateBankAccountOwnership } from '../bank-accounts/validate-ownership';
import { transactionInclude } from '../transactions/transaction-include';
import type {
  CreateTransferBody,
  UpdateTransferBody,
} from './transfers.schemas';

async function findOwnedTransfer(userId: string, transferId: string) {
  const transfer = await prisma.transaction.findFirst({
    where: { id: transferId, userId, type: 'TRANSFER' },
  });

  if (!transfer) {
    throw notFound('Transferência não encontrada');
  }

  return transfer;
}

function toTransferData(body: CreateTransferBody | UpdateTransferBody) {
  return {
    bankAccountId: body.fromBankAccountId,
    toBankAccountId: body.toBankAccountId,
    categoryId: null,
    cardId: null,
    paymentMethod: 'ACCOUNT' as const,
    name: body.name ?? 'Transferência',
    value: body.value,
    date: toApiDate(body.date),
    notes: body.notes || null,
    type: 'TRANSFER' as const,
    paid: true,
  };
}

export async function create(userId: string, body: CreateTransferBody) {
  await Promise.all([
    validateBankAccountOwnership(userId, body.fromBankAccountId),
    validateBankAccountOwnership(userId, body.toBankAccountId),
  ]);

  return prisma.transaction.create({
    data: { userId, ...toTransferData(body) },
    include: transactionInclude,
  });
}

export async function update(
  userId: string,
  transferId: string,
  body: UpdateTransferBody,
) {
  await Promise.all([
    findOwnedTransfer(userId, transferId),
    validateBankAccountOwnership(userId, body.fromBankAccountId),
    validateBankAccountOwnership(userId, body.toBankAccountId),
  ]);

  return prisma.transaction.update({
    where: { id: transferId },
    data: toTransferData(body),
    include: transactionInclude,
  });
}

export async function remove(userId: string, transferId: string) {
  await findOwnedTransfer(userId, transferId);

  await prisma.transaction.delete({ where: { id: transferId } });
}
