import { timingSafeEqual } from 'node:crypto';

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import { VersioningService } from '../../domain/versioning';

type VersioningRoutesOptions = {
  service: VersioningService;
  adminToken?: string;
};

type ProjectParams = { projectId: string };
type DraftParams = { draftId: string };
type RuntimeParams = { publicKey: string };

function isAuthorized(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function createAdminGuard(adminToken?: string) {
  return async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!adminToken) {
      return reply.code(503).send({
        error: { code: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'LYKAR_ADMIN_TOKEN is not configured' },
      });
    }

    const header = request.headers['x-lykar-admin-token'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!isAuthorized(provided, adminToken)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Admin token is invalid' } });
    }
  };
}

const versioningRoutes: FastifyPluginAsync<VersioningRoutesOptions> = async (fastify, options) => {
  const requireAdmin = createAdminGuard(options.adminToken);

  fastify.get(
    '/api/admin/projects',
    { preHandler: requireAdmin },
    async () => ({ projects: await options.service.listProjects() }),
  );

  fastify.post<{ Body: { name: unknown; origins: unknown } }>(
    '/api/admin/projects',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'origins'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            origins: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const project = await options.service.createProject(request.body.name, request.body.origins);
      return reply.code(201).send({ project });
    },
  );

  fastify.post<{ Params: ProjectParams; Body: { baseReleaseId?: unknown } }>(
    '/api/admin/projects/:projectId/drafts',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { baseReleaseId: { type: ['string', 'null'] } },
        },
      },
    },
    async (request, reply) => {
      const draft = await options.service.createDraft(request.params.projectId, request.body.baseReleaseId);
      return reply.code(201).send({ draft });
    },
  );

  fastify.get<{ Params: ProjectParams; Querystring: { status?: string } }>(
    '/api/admin/projects/:projectId/drafts',
    { preHandler: requireAdmin },
    async request => ({
      drafts: await options.service.listDrafts(request.params.projectId, request.query.status),
    }),
  );

  fastify.get<{ Params: DraftParams }>(
    '/api/admin/drafts/:draftId',
    { preHandler: requireAdmin },
    async request => options.service.getDraft(request.params.draftId),
  );

  fastify.post<{ Params: DraftParams; Body: { expectedRevision: unknown; operations: unknown } }>(
    '/api/admin/drafts/:draftId/operations',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['expectedRevision', 'operations'],
          additionalProperties: false,
          properties: {
            expectedRevision: { type: 'integer', minimum: 0 },
            operations: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object' } },
          },
        },
      },
    },
    async request => ({
      draft: await options.service.appendOperations(
        request.params.draftId,
        request.body.expectedRevision,
        request.body.operations,
      ),
    }),
  );

  fastify.post<{ Params: DraftParams; Body: { expectedRevision: unknown; environment?: unknown } }>(
    '/api/admin/drafts/:draftId/publish',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['expectedRevision'],
          additionalProperties: false,
          properties: {
            expectedRevision: { type: 'integer', minimum: 0 },
            environment: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const published = await options.service.publishDraft(
        request.params.draftId,
        request.body.expectedRevision,
        request.body.environment,
      );
      return reply.code(201).send(published);
    },
  );

  fastify.post<{
    Params: ProjectParams;
    Body: { releaseId: unknown; environment?: unknown };
  }>(
    '/api/admin/projects/:projectId/rollback',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['releaseId'],
          additionalProperties: false,
          properties: {
            releaseId: { type: 'string' },
            environment: { type: 'string' },
          },
        },
      },
    },
    async request => ({
      activation: await options.service.activateRelease(
        request.params.projectId,
        request.body.releaseId,
        request.body.environment,
      ),
    }),
  );

  fastify.get<{ Params: ProjectParams }>(
    '/api/admin/projects/:projectId/releases',
    { preHandler: requireAdmin },
    async request => ({ releases: await options.service.listReleases(request.params.projectId) }),
  );

  fastify.get<{
    Params: RuntimeParams;
    Querystring: { version?: string; environment?: string };
  }>(
    '/api/runtime/projects/:publicKey/manifest',
    async (request, reply) => {
      const manifest = await options.service.resolveRuntimeManifest(
        request.params.publicKey,
        request.query.version,
        request.query.environment,
      );
      const etag = `"${manifest.manifestHash}"`;

      if (request.headers['if-none-match'] === etag) {
        return reply.code(304).send();
      }

      reply.header('ETag', etag);
      reply.header(
        'Cache-Control',
        request.query.version
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=30, stale-while-revalidate=60',
      );
      return { manifest };
    },
  );
};

export default versioningRoutes;
