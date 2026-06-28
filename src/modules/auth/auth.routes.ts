import type { FastifyInstance } from 'fastify';
import { signinSchema, signupSchema } from './auth.schemas';
import * as authService from './auth.service';

export async function authRoutes(app: FastifyInstance) {
  const signToken = (userId: string) => app.jwt.sign({ sub: userId });

  app.post('/signin', async (request) => {
    const body = signinSchema.parse(request.body);
    return authService.signin(body, signToken);
  });

  app.post('/signup', async (request, reply) => {
    const body = signupSchema.parse(request.body);
    const result = await authService.signup(body, signToken);
    return reply.code(201).send(result);
  });
}
