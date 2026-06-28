import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

export async function validateTransactionOwnership(
  userId: string,
  transactionId: string,
) {
  const isOwner = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  });

  if (!isOwner) {
    throw notFound('Transação não encontrada');
  }
}
