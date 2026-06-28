import { prisma } from '../../lib/prisma';

export function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
}
