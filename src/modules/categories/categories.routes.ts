import type { FastifyInstance } from 'fastify';
import { findAllByUserId } from './categories.service';

export async function categoriesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', (request) => findAllByUserId(request.userId));
}
