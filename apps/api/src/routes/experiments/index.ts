import type { FastifyPluginAsync } from 'fastify';

import type { AuthService } from '../../domain/auth';
import type { ExperimentService, ExperimentVariantKey } from '../../domain/experiments';
import { authenticatedSession, createSessionGuard } from '../auth';

type ExperimentRoutesOptions = { experimentService: ExperimentService; authService: AuthService };
type PageParams = { pageId: string };
type ExperimentParams = { experimentId: string };
type VariantParams = ExperimentParams & { key: ExperimentVariantKey };
type LinkParams = { linkId: string };

const experimentRoutes: FastifyPluginAsync<ExperimentRoutesOptions> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.authService);

  fastify.get<{ Params: PageParams }>(
    '/api/admin/pages/:pageId/experiments',
    { preHandler: requireSession },
    async request => ({
      experiments: await options.experimentService.listExperiments(
        authenticatedSession(request).user.id,
        request.params.pageId,
      ),
    }),
  );

  fastify.post<{
    Params: PageParams;
    Body: { name: unknown; variants: unknown };
  }>(
    '/api/admin/pages/:pageId/experiments',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['name', 'variants'], additionalProperties: false,
          properties: {
            name: { type: 'string' },
            variants: {
              type: 'array', minItems: 2, maxItems: 2,
              items: {
                type: 'object', required: ['key'], additionalProperties: false,
                properties: {
                  key: { type: 'string', enum: ['A', 'B'] },
                  releaseId: { type: ['string', 'null'] },
                  description: { type: ['string', 'null'] },
                  weightBps: { type: 'integer', minimum: 1, maximum: 9999 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const experiment = await options.experimentService.createExperiment(
        authenticatedSession(request).user.id,
        request.params.pageId,
        request.body.name,
        request.body.variants,
      );
      return reply.code(201).send({ experiment });
    },
  );

  fastify.patch<{
    Params: VariantParams;
    Body: { releaseId?: unknown; description?: unknown; weightBps?: unknown };
  }>(
    '/api/admin/experiments/:experimentId/variants/:key',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          properties: {
            releaseId: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            weightBps: { type: 'integer', minimum: 1, maximum: 9999 },
          },
        },
      },
    },
    async request => ({
      experiment: await options.experimentService.updateVariant(
        authenticatedSession(request).user.id,
        request.params.experimentId,
        request.params.key,
        request.body.releaseId,
        request.body.description,
        request.body.weightBps,
      ),
    }),
  );

  for (const action of ['activate', 'pause', 'complete'] as const) {
    fastify.post<{ Params: ExperimentParams; Body: { winnerVariantKey?: unknown } }>(
      `/api/admin/experiments/:experimentId/${action}`,
      {
        preHandler: requireSession,
        schema: {
          body: {
            type: 'object', additionalProperties: false,
            properties: { winnerVariantKey: { type: ['string', 'null'], enum: ['A', 'B', null] } },
          },
        },
      },
      async request => ({
        experiment: await options.experimentService.transition(
          authenticatedSession(request).user.id,
          request.params.experimentId,
          action,
          request.body?.winnerVariantKey,
        ),
      }),
    );
  }

  fastify.post<{ Params: ExperimentParams }>(
    '/api/admin/experiments/:experimentId/links',
    { preHandler: requireSession },
    async (request, reply) => reply.code(201).send(await options.experimentService.createExperimentLink(
      authenticatedSession(request).user.id,
      request.params.experimentId,
    )),
  );

  fastify.delete<{ Params: LinkParams }>(
    '/api/admin/experiment-links/:linkId',
    { preHandler: requireSession },
    async (request, reply) => {
      await options.experimentService.revokeExperimentLink(
        authenticatedSession(request).user.id,
        request.params.linkId,
      );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: VariantParams }>(
    '/api/admin/experiments/:experimentId/variants/:key/links',
    { preHandler: requireSession },
    async (request, reply) => reply.code(201).send(await options.experimentService.createVariantLink(
      authenticatedSession(request).user.id,
      request.params.experimentId,
      request.params.key,
    )),
  );

  fastify.delete<{ Params: LinkParams }>(
    '/api/admin/variant-links/:linkId',
    { preHandler: requireSession },
    async (request, reply) => {
      await options.experimentService.revokeVariantLink(
        authenticatedSession(request).user.id,
        request.params.linkId,
      );
      return reply.code(204).send();
    },
  );
};

export default experimentRoutes;
