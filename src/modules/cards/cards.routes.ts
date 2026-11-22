import type { FastifyInstance } from 'fastify';
import {
  createCardSchema,
  updateCardSchema,
  cardIdParamSchema,
  cardFiltersSchema,
  invoiceQuerySchema,
  payInvoiceSchema,
} from './cards.schemas';
import * as cardsService from './cards.service';
import * as invoicesService from './invoices.service';

export async function cardsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.post('/', async (request, reply) => {
    const body = createCardSchema.parse(request.body);
    const card = await cardsService.create(request.userId, body);
    return reply.code(201).send(card);
  });

  app.get('/', (request) => {
    const filters = cardFiltersSchema.parse(request.query);
    return cardsService.findAllByUserId(request.userId, filters);
  });

  app.put('/:cardId', (request) => {
    const { cardId } = cardIdParamSchema.parse(request.params);
    const body = updateCardSchema.parse(request.body);
    return cardsService.update(request.userId, cardId, body);
  });

  app.get('/:cardId/invoice', (request) => {
    const { cardId } = cardIdParamSchema.parse(request.params);
    const query = invoiceQuerySchema.parse(request.query);
    return invoicesService.getInvoice(request.userId, cardId, query);
  });

  app.post('/:cardId/invoice/pay', async (request, reply) => {
    const { cardId } = cardIdParamSchema.parse(request.params);
    const body = payInvoiceSchema.parse(request.body);
    const payment = await invoicesService.payInvoice(request.userId, cardId, body);
    return reply.code(201).send(payment);
  });

  app.delete('/:cardId', async (request, reply) => {
    const { cardId } = cardIdParamSchema.parse(request.params);
    await cardsService.remove(request.userId, cardId);
    return reply.code(204).send();
  });
}
