import { hash, compare } from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { conflict, unauthorized } from '../../lib/errors';
import type { SigninBody, SignupBody } from './auth.schemas';

type SignToken = (userId: string) => string;

const DEFAULT_CATEGORIES: Prisma.CategoryCreateManyUserInput[] = [
  // Income
  { name: 'Salário', icon: 'salary', type: 'INCOME' },
  { name: 'Freelance', icon: 'freelance', type: 'INCOME' },
  { name: 'Outro', icon: 'other', type: 'INCOME' },
  // Expense
  { name: 'Casa', icon: 'home', type: 'EXPENSE' },
  { name: 'Alimentação', icon: 'food', type: 'EXPENSE' },
  { name: 'Educação', icon: 'education', type: 'EXPENSE' },
  { name: 'Lazer', icon: 'fun', type: 'EXPENSE' },
  { name: 'Mercado', icon: 'grocery', type: 'EXPENSE' },
  { name: 'Roupas', icon: 'clothes', type: 'EXPENSE' },
  { name: 'Transporte', icon: 'transport', type: 'EXPENSE' },
  { name: 'Viagem', icon: 'travel', type: 'EXPENSE' },
  { name: 'Outro', icon: 'other', type: 'EXPENSE' },
];

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
