import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';

/**
 * Registra o @fastify/jwt e expõe o preHandler `app.authenticate`, que valida o
 * Bearer token e popula `request.userId` a partir do `sub` do payload.
 * Rotas públicas (ex.: /auth) simplesmente não usam esse preHandler.
 */
export async function registerAuth(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
        request.userId = request.user.sub;
      } catch {
        return reply.code(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Token inválido ou ausente',
        });
      }
    },
  );
}
