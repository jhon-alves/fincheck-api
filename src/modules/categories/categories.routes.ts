import type { FastifyInstance } from 'fastify';
import {
  categoryIdParamSchema,
  createCategorySchema,
  deleteCategoryQuerySchema,
  updateCategorySchema,
} from './categories.schemas';
import * as categoriesService from './categories.service';

export async function categoriesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', (request) => categoriesService.findAllByUserId(request.userId));

  app.post('/', async (request, reply) => {
    const body = createCategorySchema.parse(request.body);
    const category = await categoriesService.create(request.userId, body);
    return reply.code(201).send(category);
  });

  app.put('/:categoryId', (request) => {
    const { categoryId } = categoryIdParamSchema.parse(request.params);
    const body = updateCategorySchema.parse(request.body);
    return categoriesService.update(request.userId, categoryId, body);
  });

  app.delete('/:categoryId', async (request, reply) => {
    const { categoryId } = categoryIdParamSchema.parse(request.params);
    const { moveToCategoryId } = deleteCategoryQuerySchema.parse(request.query);
    await categoriesService.remove(request.userId, categoryId, moveToCategoryId);
    return reply.code(204).send();
  });
}
