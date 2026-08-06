import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { AuthenticatedSession, AuthService } from '../../domain/auth';
import { UnauthorizedError } from '../../domain/versioning';

export const SESSION_COOKIE = 'lykar_session';

type AuthRoutesOptions = {
  service: AuthService;
  secureCookies: boolean;
  sessionTtlSeconds: number;
};

const requestSessions = new WeakMap<FastifyRequest, AuthenticatedSession>();

export function createSessionGuard(service: AuthService) {
  return async function requireSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    const session = await service.authenticate(token);
    requestSessions.set(request, session);
  };
}

export function authenticatedSession(request: FastifyRequest): AuthenticatedSession {
  const session = requestSessions.get(request);
  if (!session) throw new UnauthorizedError();
  return session;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (fastify, options) => {
  const requireSession = createSessionGuard(options.service);

  fastify.post<{ Body: { email: unknown } }>(
    '/api/auth/magic-link',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      await options.service.requestMagicLink(request.body.email);
      return reply.code(202).send({ accepted: true });
    },
  );

  fastify.get<{ Querystring: { token?: string } }>(
    '/api/auth/verify',
    async (request, reply) => {
      const session = await options.service.verifyMagicLink(request.query.token);
      reply.header('Set-Cookie', sessionCookie(session.token, options.sessionTtlSeconds, options.secureCookies));
      reply.header('Referrer-Policy', 'no-referrer');
      return reply.redirect('/admin/');
    },
  );

  fastify.get(
    '/api/auth/session',
    { preHandler: requireSession },
    async request => {
      const session = authenticatedSession(request);
      return { user: session.user, expiresAt: session.expiresAt };
    },
  );

  fastify.post(
    '/api/auth/logout',
    async (request, reply) => {
      const token = readCookie(request.headers.cookie, SESSION_COOKIE);
      await options.service.logout(token);
      reply.header('Set-Cookie', sessionCookie('', 0, options.secureCookies));
      return reply.code(204).send();
    },
  );
};

export default authRoutes;
