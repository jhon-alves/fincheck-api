import type { FastifyInstance } from 'fastify';
import {
  createTransactionSchema,
  updateTransactionSchema,
  transactionIdParamSchema,
  transactionFiltersSchema,
  calendarFiltersSchema,
  installmentGroupParamSchema,
  scopeQuerySchema,
  confirmBodySchema,
} from './transactions.schemas';
import * as transactionsService from './transactions.service';

export async function transactionsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // Parcelado devolve a lista de parcelas criadas; à vista, a transação.
  app.post('/', async (request, reply) => {
    const body = createTransactionSchema.parse(request.body);
    const created = await transactionsService.create(request.userId, body);
    return reply.code(201).send(created);
  });

  app.get('/', (request) => {
    const filters = transactionFiltersSchema.parse(request.query);
    return transactionsService.findAll(request.userId, filters);
  });

  app.get('/calendar', (request) => {
    const filters = calendarFiltersSchema.parse(request.query);
    return transactionsService.findCalendar(request.userId, filters);
  });

  app.get('/installments/:installmentGroupId', (request) => {
    const { installmentGroupId } = installmentGroupParamSchema.parse(
      request.params,
    );
    return transactionsService.findInstallmentGroup(
      request.userId,
      installmentGroupId,
    );
  });

  app.put('/:transactionId', (request) => {
    const { transactionId } = transactionIdParamSchema.parse(request.params);
    const { scope } = scopeQuerySchema.parse(request.query);
    const body = updateTransactionSchema.parse(request.body);
    return transactionsService.update(
      request.userId,
      transactionId,
      body,
      scope,
    );
  });

  // Confirma (ou desfaz, com { paid: false }) sem destacar a ocorrência da
  // regra recorrente, ao contrário de um PUT com escopo "só esta".
  app.patch('/:transactionId/confirm', (request) => {
    const { transactionId } = transactionIdParamSchema.parse(request.params);
    const { paid } = confirmBodySchema.parse(request.body ?? undefined);
    return transactionsService.confirm(request.userId, transactionId, paid);
  });

  app.delete('/:transactionId', async (request, reply) => {
    const { transactionId } = transactionIdParamSchema.parse(request.params);
    const { scope } = scopeQuerySchema.parse(request.query);
    await transactionsService.remove(request.userId, transactionId, scope);
    return reply.code(204).send();
  });
}
