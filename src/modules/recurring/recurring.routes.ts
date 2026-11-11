import type { FastifyInstance } from 'fastify';
import { endRuleSchema, ruleBodySchema, ruleIdParamSchema } from './recurring.schemas';
import * as recurringService from './recurring.service';

export async function recurringRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', (request) => recurringService.findAllByUserId(request.userId));

  app.post('/', async (request, reply) => {
    const body = ruleBodySchema.parse(request.body);
    const { rule } = await recurringService.createRule(request.userId, body);
    const rules = await recurringService.findAllByUserId(request.userId);
    return reply.code(201).send(rules.find((item) => item.id === rule.id));
  });

  app.put('/:ruleId', (request) => {
    const { ruleId } = ruleIdParamSchema.parse(request.params);
    const body = ruleBodySchema.parse(request.body);
    return recurringService.updateRule(request.userId, ruleId, body);
  });

  app.delete('/:ruleId', async (request, reply) => {
    const { ruleId } = ruleIdParamSchema.parse(request.params);
    await recurringService.removeRule(request.userId, ruleId);
    return reply.code(204).send();
  });

  app.post('/:ruleId/end', (request) => {
    const { ruleId } = ruleIdParamSchema.parse(request.params);
    const body = endRuleSchema.parse(request.body);
    return recurringService.endRule(request.userId, ruleId, body);
  });
}
