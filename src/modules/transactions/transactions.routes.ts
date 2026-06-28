import type { FastifyInstance } from 'fastify';
import {
  createTransactionSchema,
  updateTransactionSchema,
  transactionIdParamSchema,
  transactionFiltersSchema,
} from './transactions.schemas';
import * as transactionsService from './transactions.service';

export async function transactionsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/', (request) => {
    const body = createTransactionSchema.parse(request.body);
    return transactionsService.create(request.userId, body);
  });

  app.get('/', (request) => {
    const filters = transactionFiltersSchema.parse(request.query);
    return transactionsService.findAll(request.userId, filters);
  });

  app.put('/:transactionId', (request) => {
    const { transactionId } = transactionIdParamSchema.parse(request.params);
    const body = updateTransactionSchema.parse(request.body);
    return transactionsService.update(request.userId, transactionId, body);
  });

  app.delete('/:transactionId', async (request, reply) => {
    const { transactionId } = transactionIdParamSchema.parse(request.params);
    await transactionsService.remove(request.userId, transactionId);
    return reply.code(204).send();
  });
}
