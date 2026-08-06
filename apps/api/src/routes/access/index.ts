import type { FastifyPluginAsync } from 'fastify';

import type { AccessService } from '../../domain/access';
import type { AuthService } from '../../domain/auth';
import { authenticatedSession, createSessionGuard } from '../auth';

type AccessRoutesOptions = { accessService: AccessService; authService: AuthService };
type PageParams = { pageId: string };
type ShareParams = { shareId: string };
type ShareTokenParams = { token: string };

export function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1];
}

const accessRoutes: FastifyPluginAsync<AccessRoutesOptions> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.authService);

  fastify.post<{ Params: PageParams; Body: { draftId: unknown } }>(
    '/api/admin/pages/:pageId/editor-launch',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['draftId'], additionalProperties: false,
          properties: { draftId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const user = authenticatedSession(request).user;
      const launch = await options.accessService.createEditorLaunch(user.id, request.params.pageId, request.body.draftId);
      return reply.code(201).send(launch);
    },
  );

  fastify.post<{ Body: { code: unknown; pageUrl: unknown } }>(
    '/api/editor/exchange',
    {
      schema: {
        body: {
          type: 'object', required: ['code', 'pageUrl'], additionalProperties: false,
          properties: { code: { type: 'string' }, pageUrl: { type: 'string' } },
        },
      },
    },
    async request => ({ capability: await options.accessService.exchangeEditor(request.body.code, request.body.pageUrl) }),
  );

  fastify.post<{
    Params: PageParams;
    Body: { releaseId: unknown; expiresInSeconds?: unknown };
  }>(
    '/api/admin/pages/:pageId/shares',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['releaseId'], additionalProperties: false,
          properties: { releaseId: { type: 'string' }, expiresInSeconds: { type: ['integer', 'null'] } },
        },
      },
    },
    async (request, reply) => {
      const user = authenticatedSession(request).user;
      const share = await options.accessService.createShare(
        user.id,
        request.params.pageId,
        request.body.releaseId,
        request.body.expiresInSeconds,
      );
      return reply.code(201).send(share);
    },
  );

  fastify.get<{ Params: PageParams }>(
    '/api/admin/pages/:pageId/shares',
    { preHandler: requireSession },
    async request => ({
      shares: await options.accessService.listShares(authenticatedSession(request).user.id, request.params.pageId),
    }),
  );

  fastify.delete<{ Params: ShareParams }>(
    '/api/admin/shares/:shareId',
    { preHandler: requireSession },
    async (request, reply) => {
      await options.accessService.revokeShare(authenticatedSession(request).user.id, request.params.shareId);
      return reply.code(204).send();
    },
  );

  fastify.get<{ Params: ShareTokenParams }>(
    '/share/:token',
    async (request, reply) => {
      reply.header('Referrer-Policy', 'no-referrer');
      return reply.redirect(await options.accessService.beginShare(request.params.token));
    },
  );

  fastify.post<{ Body: { code: unknown; pageUrl: unknown } }>(
    '/api/share/exchange',
    {
      schema: {
        body: {
          type: 'object', required: ['code', 'pageUrl'], additionalProperties: false,
          properties: { code: { type: 'string' }, pageUrl: { type: 'string' } },
        },
      },
    },
    async request => ({ access: await options.accessService.exchangeShare(request.body.code, request.body.pageUrl) }),
  );
};

export default accessRoutes;
