import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';

/** Garante que a categoria é do usuário e devolve a categoria. */
export async function validateCategoryOwnership(
  userId: string,
  categoryId: string,
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  });

  if (!category) {
    throw notFound('Categoria não encontrada');
  }

  return category;
}
