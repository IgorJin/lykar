import type { FastifyPluginAsync } from 'fastify';

import type { AuthService } from '../../domain/auth';
import type { MembershipService } from '../../domain/memberships';
import { authenticatedSession, createSessionGuard, sessionCookie } from '../auth';

type MembershipRoutesOptions = {
  service: MembershipService;
  authService: AuthService;
  secureCookies: boolean;
  sessionTtlSeconds: number;
};

type ProjectParams = { projectId: string };
type InvitationParams = { invitationId: string };
type MemberParams = { projectId: string; membershipId: string };

const membershipRoutes: FastifyPluginAsync<MembershipRoutesOptions> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.authService);

  fastify.get<{ Params: ProjectParams }>(
    '/api/admin/projects/:projectId/members',
    { preHandler: requireSession },
    async request => options.service.listProjectAccess(
      authenticatedSession(request).user.id,
      request.params.projectId,
    ),
  );

  fastify.post<{ Params: ProjectParams; Body: { email: unknown; role: unknown } }>(
    '/api/admin/projects/:projectId/invitations',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['email', 'role'], additionalProperties: false,
          properties: { email: { type: 'string' }, role: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const invitation = await options.service.invite(
        authenticatedSession(request).user.id,
        request.params.projectId,
        request.body.email,
        request.body.role,
      );
      return reply.code(201).send({ invitation });
    },
  );

  fastify.post<{ Params: InvitationParams }>(
    '/api/admin/invitations/:invitationId/resend',
    { preHandler: requireSession },
    async (request, reply) => {
      const invitation = await options.service.resend(
        authenticatedSession(request).user.id,
        request.params.invitationId,
      );
      return reply.code(201).send({ invitation });
    },
  );

  fastify.delete<{ Params: InvitationParams }>(
    '/api/admin/invitations/:invitationId',
    { preHandler: requireSession },
    async (request, reply) => {
      await options.service.revokeInvitation(
        authenticatedSession(request).user.id,
        request.params.invitationId,
      );
      return reply.code(204).send();
    },
  );

  fastify.patch<{ Params: MemberParams; Body: { role: unknown } }>(
    '/api/admin/projects/:projectId/members/:membershipId',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['role'], additionalProperties: false,
          properties: { role: { type: 'string' } },
        },
      },
    },
    async request => ({
      member: await options.service.updateMemberRole(
        authenticatedSession(request).user.id,
        request.params.projectId,
        request.params.membershipId,
        request.body.role,
      ),
    }),
  );

  fastify.delete<{ Params: MemberParams }>(
    '/api/admin/projects/:projectId/members/:membershipId',
    { preHandler: requireSession },
    async (request, reply) => {
      await options.service.revokeMember(
        authenticatedSession(request).user.id,
        request.params.projectId,
        request.params.membershipId,
      );
      return reply.code(204).send();
    },
  );

  fastify.post<{ Params: ProjectParams; Body: { membershipId: unknown } }>(
    '/api/admin/projects/:projectId/transfer-ownership',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object', required: ['membershipId'], additionalProperties: false,
          properties: { membershipId: { type: 'string' } },
        },
      },
    },
    async request => options.service.transferOwnership(
      authenticatedSession(request).user.id,
      request.params.projectId,
      request.body.membershipId,
    ),
  );

  fastify.get<{ Querystring: { token?: string } }>(
    '/api/invitations/accept',
    async (request, reply) => {
      const accepted = await options.service.accept(request.query.token);
      const session = await options.authService.createSessionForUser(accepted.user);
      reply.header('Set-Cookie', sessionCookie(session.token, options.sessionTtlSeconds, options.secureCookies));
      reply.header('Referrer-Policy', 'no-referrer');
      return reply.redirect(`/admin/?project=${accepted.projectId}`);
    },
  );
};

export default membershipRoutes;
