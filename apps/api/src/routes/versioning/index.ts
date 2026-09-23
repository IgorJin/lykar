import type { FastifyPluginAsync } from 'fastify';

import type { AccessService } from '../../domain/access';
import type { AuthService } from '../../domain/auth';
import type { ExperimentService } from '../../domain/experiments';
import { VersioningService } from '../../domain/versioning';
import { bearerToken } from '../access';
import { authenticatedSession, createSessionGuard } from '../auth';

type VersioningRoutesOptions = {
  service: VersioningService;
  authService: AuthService;
  accessService: AccessService;
  experimentService: ExperimentService;
};
type ProjectParams = { projectId: string };
type PageParams = { pageId: string };
type DraftParams = { draftId: string };
type RuntimeParams = { publicKey: string };

const versioningRoutes: FastifyPluginAsync<VersioningRoutesOptions> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.authService);

  fastify.get('/api/admin/projects', { preHandler: requireSession }, async request => ({
    projects: await options.service.listProjects(authenticatedSession(request).user.id),
  }));

  fastify.post<{ Body: { name: unknown; origins: unknown } }>(
    '/api/admin/projects',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['name', 'origins'], additionalProperties: false,
          properties: {
            name: { type: 'string' },
            origins: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const project = await options.service.createProject(
        authenticatedSession(request).user.id,
        request.body.name,
        request.body.origins,
      );
      return reply.code(201).send({ project });
    },
  );

  fastify.post<{ Params: ProjectParams; Body: { name: unknown; pathname: unknown } }>(
    '/api/admin/projects/:projectId/pages',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['name', 'pathname'], additionalProperties: false,
          properties: { name: { type: 'string' }, pathname: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const page = await options.service.createPage(
        authenticatedSession(request).user.id,
        request.params.projectId,
        request.body.name,
        request.body.pathname,
      );
      return reply.code(201).send({ page });
    },
  );

  fastify.get<{ Params: ProjectParams }>(
    '/api/admin/projects/:projectId/pages',
    { preHandler: requireSession },
    async request => ({
      pages: await options.service.listPages(authenticatedSession(request).user.id, request.params.projectId),
    }),
  );

  fastify.post<{ Params: PageParams; Body: { baseReleaseId?: unknown } }>(
    '/api/admin/pages/:pageId/drafts',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', additionalProperties: false,
          properties: { baseReleaseId: { type: ['string', 'null'] } },
        },
      },
    },
    async (request, reply) => {
      const draft = await options.service.createDraft(
        authenticatedSession(request).user.id,
        request.params.pageId,
        request.body.baseReleaseId,
      );
      return reply.code(201).send({ draft });
    },
  );

  fastify.get<{ Params: PageParams; Querystring: { status?: string } }>(
    '/api/admin/pages/:pageId/drafts',
    { preHandler: requireSession },
    async request => ({
      drafts: await options.service.listDrafts(
        authenticatedSession(request).user.id,
        request.params.pageId,
        request.query.status,
      ),
    }),
  );

  fastify.get<{ Params: DraftParams }>(
    '/api/admin/drafts/:draftId',
    { preHandler: requireSession },
    async request => options.service.getDraft(authenticatedSession(request).user.id, request.params.draftId),
  );

  fastify.post<{ Params: DraftParams; Body: { idempotencyKey: unknown; expectedRevision: unknown; operations: unknown; sourceSnapshot?: unknown } }>(
    '/api/admin/drafts/:draftId/operations',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['idempotencyKey', 'expectedRevision', 'operations'], additionalProperties: false,
          properties: {
            idempotencyKey: { type: 'string', minLength: 16, maxLength: 160 },
            expectedRevision: { type: 'integer', minimum: 0 },
            operations: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object' } },
            sourceSnapshot: { type: 'object' },
          },
        },
      },
    },
    async request => ({
      draft: await options.service.appendOperations(
        authenticatedSession(request).user.id,
        request.params.draftId,
        request.body.idempotencyKey,
        request.body.expectedRevision,
        request.body.operations,
        request.body.sourceSnapshot,
      ),
    }),
  );

  fastify.get<{ Params: DraftParams }>(
    '/api/editor/drafts/:draftId',
    async request => {
      const userId = await options.accessService.authorizeEditorDraft(
        bearerToken(request.headers.authorization),
        request.params.draftId,
      );
      return options.service.getDraft(userId, request.params.draftId);
    },
  );

  fastify.post<{ Params: DraftParams; Body: { idempotencyKey: unknown; expectedRevision: unknown; operations: unknown; sourceSnapshot?: unknown } }>(
    '/api/editor/drafts/:draftId/operations',
    {
      schema: {
        body: {
          type: 'object', required: ['idempotencyKey', 'expectedRevision', 'operations'], additionalProperties: false,
          properties: {
            idempotencyKey: { type: 'string', minLength: 16, maxLength: 160 },
            expectedRevision: { type: 'integer', minimum: 0 },
            operations: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object' } },
            sourceSnapshot: { type: 'object' },
          },
        },
      },
    },
    async request => {
      const userId = await options.accessService.authorizeEditorDraft(
        bearerToken(request.headers.authorization),
        request.params.draftId,
      );
      return {
        draft: await options.service.appendOperations(
          userId,
          request.params.draftId,
          request.body.idempotencyKey,
          request.body.expectedRevision,
          request.body.operations,
          request.body.sourceSnapshot,
        ),
      };
    },
  );

  fastify.post<{ Params: DraftParams; Body: { expectedRevision: unknown } }>(
    '/api/admin/drafts/:draftId/publish',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['expectedRevision'], additionalProperties: false,
          properties: { expectedRevision: { type: 'integer', minimum: 0 } },
        },
      },
    },
    async (request, reply) => {
      const published = await options.service.publishDraft(
        authenticatedSession(request).user.id,
        request.params.draftId,
        request.body.expectedRevision,
      );
      return reply.code(201).send(published);
    },
  );

  fastify.get<{ Params: PageParams }>(
    '/api/admin/pages/:pageId/releases',
    { preHandler: requireSession },
    async request => ({
      releases: await options.service.listReleases(authenticatedSession(request).user.id, request.params.pageId),
    }),
  );

  fastify.get<{
    Params: RuntimeParams;
    Querystring: { pathname?: string; version?: string; variantToken?: string };
  }>(
    '/api/runtime/projects/:publicKey/manifest',
    async (request, reply) => {
      const pathname = request.query.pathname ?? '/';
      let manifest;
      if (request.query.variantToken !== undefined) {
        const resolved = await options.experimentService.resolveVariant(
          request.params.publicKey,
          pathname,
          request.query.variantToken,
        );
        if (!resolved) {
          reply.header('Cache-Control', 'no-store');
          return reply.code(204).send();
        }
        if (!resolved.manifest) {
          reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
          return { manifest: null, variant: { experimentId: resolved.experimentId, key: resolved.variantKey } };
        }
        manifest = resolved.manifest;
      } else if (request.query.version !== undefined) {
        await options.accessService.authorizeRuntime(
          bearerToken(request.headers.authorization),
          request.params.publicKey,
          pathname,
          request.query.version,
        );
        manifest = await options.service.resolveRuntimeManifest(
          request.params.publicKey,
          pathname,
          request.query.version,
        );
      } else {
        reply.header('Cache-Control', 'no-store');
        return reply.code(204).send();
      }
      const etag = `"${manifest.manifestHash}"`;
      if (request.headers['if-none-match'] === etag) return reply.code(304).send();
      reply.header('ETag', etag);
      reply.header(
        'Cache-Control',
        'private, max-age=0, must-revalidate',
      );
      return { manifest };
    },
  );
};

export default versioningRoutes;
