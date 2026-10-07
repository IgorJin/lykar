import type { FastifyPluginAsync } from 'fastify';

import type { AnalyticsService } from '../../domain/analytics';
import type { AuthService } from '../../domain/auth';
import { authenticatedSession, createSessionGuard } from '../auth';

type AnalyticsRoutesOptions = { analyticsService: AnalyticsService; authService: AuthService };
type RuntimeParams = { publicKey: string };
type ExperimentParams = { experimentId: string };

const analyticsRoutes: FastifyPluginAsync<AnalyticsRoutesOptions> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.authService);

  fastify.post<{
    Params: RuntimeParams;
    Body: { pathname: unknown; experimentToken: unknown; anonymousId: unknown };
  }>(
    '/api/runtime/projects/:publicKey/experiments/resolve',
    {
      logLevel: 'silent',
      schema: {
        body: {
          type: 'object', required: ['pathname', 'experimentToken', 'anonymousId'], additionalProperties: false,
          properties: {
            pathname: { type: 'string' },
            experimentToken: { type: 'string', minLength: 32, maxLength: 256 },
            anonymousId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const selection = await options.analyticsService.resolveExperiment(
        request.params.publicKey,
        request.body.pathname,
        request.body.experimentToken,
        request.body.anonymousId,
      );
      reply.header('Cache-Control', 'no-store');
      if (!selection) return reply.code(204).send();
      return { selection };
    },
  );

  fastify.post<{
    Body: {
      capability: unknown;
      clientEventId: unknown;
      eventType: unknown;
      name: unknown;
      properties?: unknown;
      occurredAt: unknown;
    };
  }>(
    '/api/runtime/analytics/events',
    {
      logLevel: 'silent',
      schema: {
        body: {
          type: 'object',
          required: ['capability', 'clientEventId', 'eventType', 'name', 'occurredAt'],
          additionalProperties: false,
          properties: {
            capability: { type: 'string' },
            clientEventId: { type: 'string' },
            eventType: { type: 'string', enum: ['exposure', 'conversion'] },
            name: { type: 'string', minLength: 1, maxLength: 120 },
            properties: { type: 'object' },
            occurredAt: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => reply.code(202).send(await options.analyticsService.recordEvent(
      request.body.capability,
      request.body.clientEventId,
      request.body.eventType,
      request.body.name,
      request.body.properties,
      request.body.occurredAt,
    )),
  );

  fastify.post<{ Params: ExperimentParams }>(
    '/api/admin/experiments/:experimentId/analytics-tests',
    { preHandler: requireSession, logLevel: 'silent' },
    async (request, reply) => { reply.header('Cache-Control', 'no-store'); return reply.code(201).send(await options.analyticsService.createTest(authenticatedSession(request).user.id, request.params.experimentId)); },
  );
  fastify.get<{ Params: ExperimentParams & { testId: string } }>(
    '/api/admin/experiments/:experimentId/analytics-tests/:testId',
    { preHandler: requireSession, logLevel: 'silent' },
    async (request, reply) => { reply.header('Cache-Control', 'no-store'); return { test: await options.analyticsService.getTest(authenticatedSession(request).user.id, request.params.experimentId, request.params.testId) }; },
  );
  fastify.post<{ Params: RuntimeParams; Body: { token: unknown; pathname: unknown; consent: unknown; name?: unknown; clientEventId?: unknown } }>(
    '/api/runtime/projects/:publicKey/analytics-tests',
    { logLevel: 'silent', schema: { body: { type: 'object', required: ['token', 'pathname', 'consent'], additionalProperties: false,
      properties: { token: { type: 'string', minLength: 32, maxLength: 256 }, pathname: { type: 'string' }, consent: { type: 'string', enum: ['pending','granted','denied'] }, name: { type: 'string', minLength: 1, maxLength: 120 }, clientEventId: { type: 'string' } } } } },
    async (request, reply) => { reply.header('Cache-Control', 'no-store'); return reply.code(202).send(await options.analyticsService.recordTest(request.params.publicKey, request.body)); },
  );

  fastify.get<{ Params: ExperimentParams }>(
    '/api/admin/experiments/:experimentId/analytics',
    { preHandler: requireSession },
    async request => ({
      report: await options.analyticsService.getReport(
        authenticatedSession(request).user.id,
        request.params.experimentId,
      ),
    }),
  );
};

export default analyticsRoutes;
