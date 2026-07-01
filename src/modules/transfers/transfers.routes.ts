import type { FastifyInstance } from 'fastify';
import {
  createTransferSchema,
  transferIdParamSchema,
} from './transfers.schemas';
import * as transfersService from './transfers.service';

export async function transfersRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/', async (request, reply) => {
    const body = createTransferSchema.parse(request.body);
    const transfer = await transfersService.create(request.userId, body);
    return reply.code(201).send(transfer);
  });

  app.delete('/:transferId', async (request, reply) => {
    const { transferId } = transferIdParamSchema.parse(request.params);
    await transfersService.remove(request.userId, transferId);
    return reply.code(204).send();
  });
}
