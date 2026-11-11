import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

/** Garante que o cartão é do usuário e devolve o cartão (para validar regras). */
export async function validateCardOwnership(userId: string, cardId: string) {
  const card = await prisma.card.findFirst({
    where: { id: cardId, userId },
  });

  if (!card) {
    throw notFound('Cartão não encontrado');
  }

  return card;
}
