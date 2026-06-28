import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

export async function validateCategoryOwnership(
  userId: string,
  categoryId: string,
) {
  const isOwner = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!isOwner) {
    throw notFound('Categoria não encontrada');
  }
}
