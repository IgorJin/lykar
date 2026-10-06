import installationRoutes from './routes/installation';
import type {InstallationOptions} from './config/installation';
import onboardingRoutes from './routes/onboarding';
import {OnboardingService,type SitemapPreview} from './domain/onboarding';
import {PostgresOnboardingRepository} from './repositories/postgres-onboarding-repository';
import siteConnectionRoutes from './routes/site-connection';
import {SiteConnectionService} from './domain/site-connection';
import {PostgresSiteRepository} from './repositories/postgres-site-repository';
import type {DnsTxtVerifier} from './domain/dns-verifier';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { EmailPolicy, EmailRateLimitError, type EmailLimitOptions } from './email/policy';
import { EmailDeliveryService, unavailableSender, validateEmailProviders, type BudgetedEmailProvider } from './email/delivery';
import type { EmailStore } from './email/store';
import { MemoryEmailStore } from './email/memory-store';
import { PostgresEmailStore } from './repositories/postgres-email-store';

import { AccessService, type AccessRepository } from './domain/access';
import { AnalyticsService, type AnalyticsRepository } from './domain/analytics';
import { AuthService, ConsoleMagicLinkSender, type AuthRepository, type MagicLinkSender } from './domain/auth';
import { ExperimentService, type ExperimentRepository } from './domain/experiments';
import { DeploymentService, type DeploymentRepository } from './domain/deployments';
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
import { PostgresDeploymentRepository } from './repositories/postgres-deployment-repository';
import { PostgresMembershipRepository } from './repositories/postgres-membership-repository';
import { PostgresVersioningRepository } from './repositories/postgres-versioning-repository';
import accessRoutes from './routes/access';
import analyticsRoutes from './routes/analytics';
import adminUiRoutes from './routes/admin-ui';
import authRoutes from './routes/auth';
import experimentRoutes from './routes/experiments';
import deploymentRoutes from './routes/deployments';
import membershipRoutes from './routes/memberships';
import versioningRoutes from './routes/versioning';

export type BuildAppOptions = {
  logger?: boolean;
  connectionString?: string;
  allowedOrigins?: string[];
  appOrigin?: string;
  ownerEmail?: string;
  devAuth?: boolean;
  secureCookies?: boolean;
  development?: boolean;
  siteDnsVerifier?: DnsTxtVerifier;
  siteNow?: () => Date;
  sitemapPreview?: SitemapPreview;
  installation?: InstallationOptions;
  siteAllowLoopback?: boolean;
  emailStore?: EmailStore;
  emailLimitSecret?: string;
  emailLimits?: false | Partial<EmailLimitOptions>;
  emailProviders?: BudgetedEmailProvider[];
  emailNow?: () => Date;
  magicLinkSender?: MagicLinkSender;
  invitationSender?: InvitationSender;
  versioningRepository?: VersioningRepository;
  authRepository?: AuthRepository;
  accessRepository?: AccessRepository;
  membershipRepository?: MembershipRepository;
  experimentRepository?: ExperimentRepository;
  deploymentRepository?: DeploymentRepository;
  analyticsRepository?: AnalyticsRepository;
  analyticsSigningSecret?: string;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const appOrigin = new URL(options.appOrigin ?? 'http://localhost:3000').origin;
  const appHostname = new URL(appOrigin).hostname;
  const allowedOrigins = new Set([appOrigin, ...(options.allowedOrigins ?? [])]);
  const development = process.env.NODE_ENV !== 'production' && (options.development ?? true);
  if (options.siteAllowLoopback && !development) throw new Error('Local site verification is restricted to development');
  const devAuth = options.devAuth ?? process.env.LYKAR_DEV_AUTH === '1';
  if (devAuth && !development) {
    throw new Error('LYKAR_DEV_AUTH can only be enabled outside production');
  }
  if (devAuth && !isLoopbackHost(appHostname)) {
    throw new Error('LYKAR_DEV_AUTH requires a localhost or loopback app origin');
  }
  if (!development && !options.emailProviders?.length && (!options.magicLinkSender || !options.invitationSender
    || options.magicLinkSender instanceof ConsoleMagicLinkSender || options.invitationSender instanceof ConsoleInvitationSender)) {
    throw new Error('Production requires configured email senders');
  }
  if (options.emailProviders) validateEmailProviders(options.emailProviders);
  if (options.emailProviders?.length && (options.magicLinkSender || options.invitationSender)) throw new Error('Choose providers or injected email senders');
  if (!development && options.emailLimits === false) throw new Error('Production email limits cannot be disabled');
  if (!development && options.emailStore instanceof MemoryEmailStore) throw new Error('Production email store must be persistent');
  if (!development && (options.emailLimitSecret?.length ?? 0) < 32) throw new Error('Production requires LYKAR_EMAIL_LIMIT_SECRET');
  if (!development && !appOrigin.startsWith('https://')) throw new Error('Production email links require HTTPS app origin');
  const server = Fastify({
    logger: options.logger === false ? false : { serializers: {
      req: request => ({ method: request.method, url: request.url?.split('?')[0].replace(/^\/share\/[^/]+/, '/share/[redacted]'), id: request.id }),
    } },
    bodyLimit: 1024 * 1024,
  });
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
    const adminMutation = request.url.startsWith('/api/admin/') || request.url.startsWith('/api/auth/logout');
    const developmentLogin = request.url.startsWith('/api/auth/dev-login');
    if ((!adminMutation && !developmentLogin) || request.method === 'GET' || request.method === 'HEAD') return;
    const origin = request.headers.origin;
    const fetchSite = request.headers['sec-fetch-site'];
    if ((origin && origin !== appOrigin) || fetchSite === 'cross-site') {
      return reply.code(403).send({ error: { code: 'CSRF_REJECTED', message: 'Cross-origin admin mutation was rejected' } });
    }
  });

  server.get('/api/connection/ping', async (_request,reply) => {
    reply.header('Cache-Control','no-store').header('Access-Control-Allow-Origin','*');
    return {ok:true,schemaVersion:1};
  });
  server.get('/api/health', async () => ({ status: 'ok' }));
  server.register(adminUiRoutes);

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof EmailRateLimitError) reply.header('Retry-After', error.retryAfterSeconds);
    if (error instanceof VersioningError) {
      if (error.statusCode===429 && error.details && typeof error.details === 'object' && 'retryAfterSeconds' in error.details) reply.header('Retry-After', String(error.details.retryAfterSeconds));
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
    let emailStore = options.emailStore;
    let siteRepository: PostgresSiteRepository | undefined;
    let onboardingRepository: PostgresOnboardingRepository | undefined;
    let versioningRepository = options.versioningRepository;
    let authRepository = options.authRepository;
    let accessRepository = options.accessRepository;
    let membershipRepository = options.membershipRepository;
    let experimentRepository = options.experimentRepository;
    let deploymentRepository = options.deploymentRepository;
    let analyticsRepository = options.analyticsRepository;

    if (!versioningRepository || !authRepository || !accessRepository || !membershipRepository
      || !experimentRepository || !analyticsRepository || !deploymentRepository) {
      if (!options.connectionString) throw new Error('DATABASE_URL is required unless all repositories are provided');
      await scopedServer.register(dbPlugin, { connectionString: options.connectionString });
      siteRepository = new PostgresSiteRepository(scopedServer.pg.pool);
      onboardingRepository = new PostgresOnboardingRepository(scopedServer.pg.pool);
      emailStore ??= new PostgresEmailStore(scopedServer.pg.pool);
      versioningRepository ??= new PostgresVersioningRepository(scopedServer.pg.pool);
      authRepository ??= new PostgresAuthRepository(scopedServer.pg.pool);
      accessRepository ??= new PostgresAccessRepository(scopedServer.pg.pool);
      membershipRepository ??= new PostgresMembershipRepository(scopedServer.pg.pool);
      experimentRepository ??= new PostgresExperimentRepository(scopedServer.pg.pool);
      deploymentRepository ??= new PostgresDeploymentRepository(scopedServer.pg.pool, development && options.siteAllowLoopback === true);
      analyticsRepository ??= new PostgresAnalyticsRepository(scopedServer.pg.pool);
    }

    if (!emailStore && !development) throw new Error('Production requires a persistent email store');
    emailStore ??= new MemoryEmailStore();
    const emailPolicy = options.emailLimits === false ? undefined : new EmailPolicy(emailStore,
      options.emailLimitSecret ?? 'lykar-local-email-limit-secret-for-development', options.emailLimits, options.emailNow);
    const emailSender = options.emailProviders?.length ? new EmailDeliveryService(emailStore, options.emailProviders, options.emailNow) : unavailableSender;
    const authService = new AuthService(authRepository, {
      ownerEmail: options.ownerEmail ?? 'owner@lykar.local',
      appOrigin,
      loginTtlMs: ttl.login,
      sessionTtlMs: ttl.session,
      sender: options.magicLinkSender ?? emailSender,
      emailPolicy,
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
      sender: options.invitationSender ?? emailSender,
      emailPolicy,
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
      emailCooldownSeconds: options.emailLimits === false ? 0 : Math.ceil((options.emailLimits?.cooldownMs ?? 60000) / 1000),
      devAuth,
      secureCookies,
      sessionTtlSeconds,
    });
    await scopedServer.register(membershipRoutes, {
      service: membershipService,
      authService,
      secureCookies,
      sessionTtlSeconds,
    });
    await scopedServer.register(installationRoutes,{authService,appOrigin,development,installation:options.installation});
    if(onboardingRepository) await scopedServer.register(onboardingRoutes,{service:new OnboardingService(onboardingRepository,{allowLoopback:options.siteAllowLoopback,sitemapPreview:options.sitemapPreview}),authService});
    if (siteRepository) await scopedServer.register(siteConnectionRoutes, {service: new SiteConnectionService(siteRepository, {allowLoopback: options.siteAllowLoopback, dns:options.siteDnsVerifier, now:options.siteNow}), authService});
    await scopedServer.register(accessRoutes, { accessService, authService });
    await scopedServer.register(analyticsRoutes, { analyticsService, authService });
    await scopedServer.register(experimentRoutes, { experimentService, authService });
    await scopedServer.register(deploymentRoutes, {service: new DeploymentService(deploymentRepository), authService});
    await scopedServer.register(versioningRoutes, {
      service: new VersioningService(versioningRepository),
      authService,
      accessService,
      experimentService,
    });
  });

  return server;
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const octets = host.split('.').map(Number);
  return octets.length === 4 && octets[0] === 127
    && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255);
}
