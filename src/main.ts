import { buildServer } from './server';
import { env } from './env';

async function bootstrap() {
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

bootstrap();
