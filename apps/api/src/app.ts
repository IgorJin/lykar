import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

import { VersioningError, VersioningService, type VersioningRepository } from './domain/versioning';
import dbPlugin from './plugins/db';
import { PostgresVersioningRepository } from './repositories/postgres-versioning-repository';
import versioningRoutes from './routes/versioning';

export type BuildAppOptions = {
  logger?: boolean;
  connectionString?: string;
  adminToken?: string;
  allowedOrigins?: string[];
  versioningRepository?: VersioningRepository;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 1024 * 1024,
  });
  const allowedOrigins = new Set(options.allowedOrigins ?? []);

  server.register(cors, {
    credentials: true,
    allowedHeaders: ['Content-Type', 'If-None-Match', 'X-Lykar-Admin-Token'],
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, allowedOrigins.has(origin));
    },
  });

  server.get('/api/health', async () => ({ status: 'ok' }));

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof VersioningError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    if (typeof error === 'object' && error !== null && 'validation' in error) {
      const validationError = error as { message?: string; validation: unknown };
      return reply.code(400).send({
        error: {
          code: 'REQUEST_VALIDATION_ERROR',
          message: validationError.message ?? 'Request validation failed',
          details: validationError.validation,
        },
      });
    }

    server.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  server.register(async scopedServer => {
    let repository = options.versioningRepository;

    if (!repository) {
      if (!options.connectionString) {
        throw new Error('DATABASE_URL is required when no versioning repository is provided');
      }
      await scopedServer.register(dbPlugin, { connectionString: options.connectionString });
      repository = new PostgresVersioningRepository(scopedServer.pg.pool);
    }

    await scopedServer.register(versioningRoutes, {
      service: new VersioningService(repository),
      adminToken: options.adminToken,
    });
  });

  return server;
}
