import type { FastifyInstance } from 'fastify';
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  bankAccountIdParamSchema,
} from './bank-accounts.schemas';
import * as bankAccountsService from './bank-accounts.service';

export async function bankAccountsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/', (request) => {
    const body = createBankAccountSchema.parse(request.body);
    return bankAccountsService.create(request.userId, body);
  });

  app.get('/', (request) => bankAccountsService.findAllByUserId(request.userId));

  app.put('/:bankAccountId', (request) => {
    const { bankAccountId } = bankAccountIdParamSchema.parse(request.params);
    const body = updateBankAccountSchema.parse(request.body);
    return bankAccountsService.update(request.userId, bankAccountId, body);
  });

  app.delete('/:bankAccountId', async (request, reply) => {
    const { bankAccountId } = bankAccountIdParamSchema.parse(request.params);
    await bankAccountsService.remove(request.userId, bankAccountId);
    return reply.code(204).send();
  });
}
