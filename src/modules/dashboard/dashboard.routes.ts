import type { FastifyInstance } from 'fastify';
import { summaryFiltersSchema } from './dashboard.schemas';
import * as dashboardService from './dashboard.service';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/summary', (request) => {
    const filters = summaryFiltersSchema.parse(request.query);
    return dashboardService.getSummary(request.userId, filters);
  });
}
