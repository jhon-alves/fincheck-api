import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { registerAuth } from './plugins/auth';
import { HttpError } from './lib/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { bankAccountsRoutes } from './modules/bank-accounts/bank-accounts.routes';
import { categoriesRoutes } from './modules/categories/categories.routes';
import { transactionsRoutes } from './modules/transactions/transactions.routes';

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: '*' });
  await registerAuth(app);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Dados inválidos',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      });
    }

    if (typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name || 'Error',
        message: error.message,
      });
    }

    request.log.error(error);
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Erro interno do servidor',
    });
  });

  app.get('/health', () => ({ status: 'ok' }));

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(usersRoutes, { prefix: '/users' });
  await app.register(bankAccountsRoutes, { prefix: '/bank-accounts' });
  await app.register(categoriesRoutes, { prefix: '/categories' });
  await app.register(transactionsRoutes, { prefix: '/transactions' });

  return app;
}
