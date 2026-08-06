import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

import { AccessService, type AccessRepository } from './domain/access';
import { AnalyticsService, type AnalyticsRepository } from './domain/analytics';
import { AuthService, ConsoleMagicLinkSender, type AuthRepository, type MagicLinkSender } from './domain/auth';
import { ExperimentService, type ExperimentRepository } from './domain/experiments';
import {
  ConsoleInvitationSender,
  MembershipService,
  type InvitationSender,
  type MembershipRepository,
} from './domain/memberships';
import { VersioningError, VersioningService, type VersioningRepository } from './domain/versioning';
import dbPlugin from './plugins/db';
import { PostgresAccessRepository } from './repositories/postgres-access-repository';
import { PostgresAnalyticsRepository } from './repositories/postgres-analytics-repository';
import { PostgresAuthRepository } from './repositories/postgres-auth-repository';
import { PostgresExperimentRepository } from './repositories/postgres-experiment-repository';
import { PostgresMembershipRepository } from './repositories/postgres-membership-repository';
import { PostgresVersioningRepository } from './repositories/postgres-versioning-repository';
import accessRoutes from './routes/access';
import analyticsRoutes from './routes/analytics';
import adminUiRoutes from './routes/admin-ui';
import authRoutes from './routes/auth';
import experimentRoutes from './routes/experiments';
import membershipRoutes from './routes/memberships';
import versioningRoutes from './routes/versioning';

export type BuildAppOptions = {
  logger?: boolean;
  connectionString?: string;
  allowedOrigins?: string[];
  appOrigin?: string;
  ownerEmail?: string;
  secureCookies?: boolean;
  development?: boolean;
  magicLinkSender?: MagicLinkSender;
  invitationSender?: InvitationSender;
  versioningRepository?: VersioningRepository;
  authRepository?: AuthRepository;
  accessRepository?: AccessRepository;
  membershipRepository?: MembershipRepository;
  experimentRepository?: ExperimentRepository;
  analyticsRepository?: AnalyticsRepository;
  analyticsSigningSecret?: string;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? true, bodyLimit: 1024 * 1024 });
  const appOrigin = new URL(options.appOrigin ?? 'http://localhost:3000').origin;
  const allowedOrigins = new Set([appOrigin, ...(options.allowedOrigins ?? [])]);
  const development = options.development ?? process.env.NODE_ENV !== 'production';
  const analyticsSigningSecret = options.analyticsSigningSecret
    ?? (development ? 'lykar-development-analytics-signing-secret' : undefined);
  if (!analyticsSigningSecret) {
    throw new Error('LYKAR_ANALYTICS_SIGNING_SECRET is required in production');
  }
  const ttl = development
    ? {
        login: 7 * 24 * 60 * 60 * 1000,
        session: 180 * 24 * 60 * 60 * 1000,
        editorCode: 24 * 60 * 60 * 1000,
        editorSession: 30 * 24 * 60 * 60 * 1000,
        shareCode: 24 * 60 * 60 * 1000,
        shareSession: 7 * 24 * 60 * 60 * 1000,
        invitation: 7 * 24 * 60 * 60 * 1000,
      }
    : {
        login: 15 * 60 * 1000,
        session: 30 * 24 * 60 * 60 * 1000,
        editorCode: 2 * 60 * 1000,
        editorSession: 2 * 60 * 60 * 1000,
        shareCode: 2 * 60 * 1000,
        shareSession: 60 * 60 * 1000,
        invitation: 7 * 24 * 60 * 60 * 1000,
      };

  server.register(cors, {
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'If-None-Match'],
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      callback(null, allowedOrigins.has(origin));
    },
  });

  server.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/admin/') || request.method === 'GET' || request.method === 'HEAD') return;
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];
    if ((origin && origin !== appOrigin) || fetchSite === 'cross-site') {
      return reply.code(403).send({ error: { code: 'CSRF_REJECTED', message: 'Cross-origin admin mutation was rejected' } });
    }
  });

  server.get('/api/health', async () => ({ status: 'ok' }));
  server.register(adminUiRoutes);

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof VersioningError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
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
    let versioningRepository = options.versioningRepository;
    let authRepository = options.authRepository;
    let accessRepository = options.accessRepository;
    let membershipRepository = options.membershipRepository;
    let experimentRepository = options.experimentRepository;
    let analyticsRepository = options.analyticsRepository;

    if (!versioningRepository || !authRepository || !accessRepository || !membershipRepository
      || !experimentRepository || !analyticsRepository) {
      if (!options.connectionString) throw new Error('DATABASE_URL is required unless all repositories are provided');
      await scopedServer.register(dbPlugin, { connectionString: options.connectionString });
      versioningRepository ??= new PostgresVersioningRepository(scopedServer.pg.pool);
      authRepository ??= new PostgresAuthRepository(scopedServer.pg.pool);
      accessRepository ??= new PostgresAccessRepository(scopedServer.pg.pool);
      membershipRepository ??= new PostgresMembershipRepository(scopedServer.pg.pool);
      experimentRepository ??= new PostgresExperimentRepository(scopedServer.pg.pool);
      analyticsRepository ??= new PostgresAnalyticsRepository(scopedServer.pg.pool);
    }

    const authService = new AuthService(authRepository, {
      ownerEmail: options.ownerEmail ?? 'owner@lykar.local',
      appOrigin,
      loginTtlMs: ttl.login,
      sessionTtlMs: ttl.session,
      sender: options.magicLinkSender ?? new ConsoleMagicLinkSender(message => scopedServer.log.info(message)),
    });
    const accessService = new AccessService(accessRepository, {
      appOrigin,
      editorCodeTtlMs: ttl.editorCode,
      editorSessionTtlMs: ttl.editorSession,
      shareCodeTtlMs: ttl.shareCode,
      shareSessionTtlMs: ttl.shareSession,
    });
    const membershipService = new MembershipService(membershipRepository, {
      appOrigin,
      invitationTtlMs: ttl.invitation,
      sender: options.invitationSender ?? new ConsoleInvitationSender(message => scopedServer.log.info(message)),
    });
    const experimentService = new ExperimentService(experimentRepository);
    const analyticsService = new AnalyticsService(analyticsRepository, {
      signingSecret: analyticsSigningSecret,
      capabilityTtlMs: 30 * 24 * 60 * 60 * 1000,
    });
    const secureCookies = options.secureCookies ?? appOrigin.startsWith('https://');
    const sessionTtlSeconds = Math.floor(ttl.session / 1000);

    await scopedServer.register(authRoutes, {
      service: authService,
      secureCookies,
      sessionTtlSeconds,
    });
    await scopedServer.register(membershipRoutes, {
      service: membershipService,
      authService,
      secureCookies,
      sessionTtlSeconds,
    });
    await scopedServer.register(accessRoutes, { accessService, authService });
    await scopedServer.register(analyticsRoutes, { analyticsService, authService });
    await scopedServer.register(experimentRoutes, { experimentService, authService });
    await scopedServer.register(versioningRoutes, {
      service: new VersioningService(versioningRepository),
      authService,
      accessService,
      experimentService,
    });
  });

  return server;
}
