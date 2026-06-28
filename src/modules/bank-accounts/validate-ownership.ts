import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

export async function validateBankAccountOwnership(
  userId: string,
  bankAccountId: string,
) {
  const isOwner = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, userId },
  });

  if (!isOwner) {
    throw notFound('Conta bancária não encontrada');
  }
}
