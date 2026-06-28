import { prisma } from '../../lib/prisma';

export function findAllByUserId(userId: string) {
  return prisma.category.findMany({ where: { userId } });
}
