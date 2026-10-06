import type { FastifyPluginAsync } from 'fastify';

import type { AuthService } from '../../domain/auth';
import type { DeploymentService } from '../../domain/deployments';
import { ValidationError } from '../../domain/versioning';
import { authenticatedSession, createSessionGuard } from '../auth';

const deploymentRoutes: FastifyPluginAsync<{service: DeploymentService; authService: AuthService}> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.authService);
  // Access errors and conflicts must not become cached delivery decisions either.
  fastify.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });

  fastify.get<{Params: {pageId: string}}>(
    '/api/admin/pages/:pageId/deployment', {preHandler: requireSession},
    async request => ({deployment: await options.service.getState(authenticatedSession(request).user.id, request.params.pageId)}),
  );

  fastify.get<{Params: {pageId: string}; Querystring: {beforeRevision?: string; limit?: string}}>(
    '/api/admin/pages/:pageId/deployment/activations', {preHandler: requireSession},
    async request => options.service.listHistory(
      authenticatedSession(request).user.id, request.params.pageId, request.query.beforeRevision, request.query.limit,
    ),
  );

  for (const action of ['deploy', 'disable', 'rollback'] as const) {
    fastify.post<{
      Params: {pageId: string};
      Body: {releaseId?: unknown; expectedRevision: unknown; idempotencyKey: unknown; reason: unknown};
    }>(
      `/api/admin/pages/:pageId/deployment/${action}`,
      {
        preHandler: requireSession,
        schema: {body: {
          type: 'object', additionalProperties: false,
          required: ['expectedRevision', 'idempotencyKey', 'reason', ...(action === 'disable' ? [] : ['releaseId'])],
          properties: {
            releaseId: {type: ['string', 'null']}, expectedRevision: {type: 'integer', minimum: 0},
            idempotencyKey: {type: 'string', minLength: 16, maxLength: 160},
            reason: {type: 'string', minLength: 1, maxLength: 500},
          },
        }},
      },
      async request => options.service.activate(authenticatedSession(request).user.id, request.params.pageId, action, request.body),
    );
  }

  fastify.get<{Params: {publicKey: string}; Querystring: {pathname?: string}}>(
    '/api/runtime/projects/:publicKey/deployment', {logLevel: 'silent'},
    async (request, reply) => {
      reply.header('Vary', 'Origin');
      // This endpoint is for explicit deployment mode only; never erase invalid preview selectors.
      if (Object.keys(request.query).some(key => key !== 'pathname') || request.headers.authorization !== undefined) {
        throw new ValidationError('Deployment resolve does not accept preview or experiment selectors');
      }
      const selection = await options.service.resolve(request.params.publicKey, request.query.pathname ?? '/', request.headers.origin);
      if (!selection) return reply.code(204).send();
      reply.header('Access-Control-Allow-Origin', request.headers.origin!);
      return selection;
    },
  );
};

export default deploymentRoutes;
