import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden } from '../../lib/errors';
import { validateCategoryOwnership } from './validate-ownership';
import type { CreateCategoryBody, UpdateCategoryBody } from './categories.schemas';

const DEFAULT_LOCKED_MESSAGE = 'Categorias padrão não podem ser alteradas';

const typeLabel = (type: 'INCOME' | 'EXPENSE' | 'TRANSFER') =>
  type === 'INCOME' ? 'entrada' : 'saída';

/** Padrão primeiro, depois por nome; com a contagem de lançamentos. */
export async function findAllByUserId(userId: string) {
  const categories = await prisma.category.findMany({
    where: { userId },
    include: { _count: { select: { transactions: true, recurringRules: true } } },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  return categories.map(({ _count, ...category }) => ({
    ...category,
    transactionsCount: _count.transactions,
    recurringRulesCount: _count.recurringRules,
  }));
}

/** Nome único por usuário e tipo, sem diferenciar maiúsculas. */
async function ensureUniqueName(
  userId: string,
  type: 'INCOME' | 'EXPENSE',
  name: string,
  ignoreId?: string,
) {
  const existing = await prisma.category.findFirst({
    where: {
      userId,
      type,
      name: { equals: name, mode: 'insensitive' },
      ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw conflict(`Já existe uma categoria de ${typeLabel(type)} com esse nome`);
  }
}

export async function create(userId: string, body: CreateCategoryBody) {
  await ensureUniqueName(userId, body.type, body.name);

  const category = await prisma.category.create({
    data: {
      userId,
      name: body.name,
      type: body.type,
      icon: body.icon,
      color: body.color ?? null,
      isDefault: false,
    },
  });

  return { ...category, transactionsCount: 0, recurringRulesCount: 0 };
}

export async function update(
  userId: string,
  categoryId: string,
  body: UpdateCategoryBody,
) {
  const category = await validateCategoryOwnership(userId, categoryId);

  if (category.isDefault) {
    throw forbidden(DEFAULT_LOCKED_MESSAGE);
  }

  const [transactionsCount, recurringRulesCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.recurringRule.count({ where: { categoryId } }),
  ]);

  if (body.type !== category.type && transactionsCount + recurringRulesCount > 0) {
    throw badRequest('O tipo não pode mudar: a categoria já tem lançamentos');
  }

  await ensureUniqueName(userId, body.type, body.name, categoryId);

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: {
      name: body.name,
      type: body.type,
      icon: body.icon,
      color: body.color ?? null,
    },
  });

  return { ...updated, transactionsCount, recurringRulesCount };
}

/**
 * Exclui uma categoria personalizada. Se ela tem lançamentos, eles vão antes
 * para `moveToCategoryId` (mesmo tipo), tudo numa transação: nenhum
 * lançamento fica sem categoria.
 */
export async function remove(
  userId: string,
  categoryId: string,
  moveToCategoryId?: string,
) {
  const category = await validateCategoryOwnership(userId, categoryId);

  if (category.isDefault) {
    throw forbidden(DEFAULT_LOCKED_MESSAGE);
  }

  const [transactionsCount, recurringRulesCount] = await Promise.all([
    prisma.transaction.count({ where: { categoryId } }),
    prisma.recurringRule.count({ where: { categoryId } }),
  ]);

  if (transactionsCount + recurringRulesCount === 0) {
    await prisma.category.delete({ where: { id: categoryId } });
    return;
  }

  if (!moveToCategoryId) {
    const parts = [
      transactionsCount > 0
        ? `${transactionsCount} lançamento${transactionsCount > 1 ? 's' : ''}`
        : null,
      recurringRulesCount > 0
        ? `${recurringRulesCount} recorrência${recurringRulesCount > 1 ? 's' : ''}`
        : null,
    ].filter(Boolean);
    throw badRequest(
      `Esta categoria tem ${parts.join(' e ')}. Informe para qual categoria movê-los`,
    );
  }

  if (moveToCategoryId === categoryId) {
    throw badRequest('Escolha outra categoria para receber os lançamentos');
  }

  const target = await validateCategoryOwnership(userId, moveToCategoryId);

  if (target.type !== category.type) {
    throw badRequest('Os lançamentos só podem ir para uma categoria do mesmo tipo');
  }

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { userId, categoryId },
      data: { categoryId: target.id },
    }),
    prisma.recurringRule.updateMany({
      where: { userId, categoryId },
      data: { categoryId: target.id },
    }),
    prisma.category.delete({ where: { id: categoryId } }),
  ]);
}
