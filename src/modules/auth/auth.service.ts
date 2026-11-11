import { hash, compare } from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { conflict, unauthorized } from '../../lib/errors';
import type { SigninBody, SignupBody } from './auth.schemas';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';

type SignToken = (userId: string) => string;

export async function signin(body: SigninBody, signToken: SignToken) {
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user) {
    throw unauthorized('Credenciais inválidas');
  }

  const isPasswordValid = await compare(body.password, user.password);

  if (!isPasswordValid) {
    throw unauthorized('Credenciais inválidas');
  }

  return { accessToken: signToken(user.id) };
}

export async function signup(body: SignupBody, signToken: SignToken) {
  const emailTaken = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });

  if (emailTaken) {
    throw conflict('E-mail já cadastrado');
  }

  const hashedPassword = await hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      password: hashedPassword,
      categories: {
        createMany: { data: DEFAULT_CATEGORIES },
      },
    },
  });

  return { accessToken: signToken(user.id) };
}
