import type { FastifyInstance } from 'fastify';
import { getUserById } from './users.service';

export async function usersRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/me', (request) => getUserById(request.userId));
}
