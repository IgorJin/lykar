import type { FastifyPluginAsync } from 'fastify';
import type { AuthService } from '../../domain/auth';
import type { OnboardingService } from '../../domain/onboarding';
import { SITEMAP_LIMITS } from '../../domain/sitemap';
import { authenticatedSession, createSessionGuard } from '../auth';

type ProjectParams = {projectId: string};
const routes: FastifyPluginAsync<{service: OnboardingService; authService: AuthService}> = async (app, {service, authService}) => {
  app.addHook('preHandler', createSessionGuard(authService));
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });

  app.get<{Params: ProjectParams}>('/api/admin/projects/:projectId/origins', request =>
    service.origins(authenticatedSession(request).user.id, request.params.projectId));

  const originBody = {type: 'object', required: ['origin'], additionalProperties: false,
    properties: {origin: {type: 'string', maxLength: 2048}}};
  app.post<{Params: ProjectParams; Body: {origin: string}}>('/api/admin/projects/:projectId/origins',
    {schema: {body: originBody}}, async (request, reply) => {
      const result = await service.addOrigin(authenticatedSession(request).user.id, request.params.projectId, request.body.origin);
      return reply.code(result.created ? 201 : 200).send({origin: result.origin});
    });
  app.delete<{Params: ProjectParams; Body: {origin: string}}>('/api/admin/projects/:projectId/origins',
    {schema: {body: originBody}}, async (request, reply) => {
      await service.removeOrigin(authenticatedSession(request).user.id, request.params.projectId, request.body.origin);
      return reply.code(204).send();
    });

  app.post<{Params: ProjectParams; Body: {url: string}}>('/api/admin/projects/:projectId/sitemap/preview',
    {schema: {body: {type: 'object', required: ['url'], additionalProperties: false,
      properties: {url: {type: 'string', maxLength: 2048}}}}}, request =>
      service.preview(authenticatedSession(request).user.id, request.params.projectId, request.body.url));

  app.post<{Params: ProjectParams; Body: {urls: string[]}}>('/api/admin/projects/:projectId/sitemap/import',
    {schema: {body: {type: 'object', required: ['urls'], additionalProperties: false,
      properties: {urls: {type: 'array', minItems: 1, maxItems: SITEMAP_LIMITS.entries, items: {type: 'string', maxLength: 2048}}}}}},
    async (request, reply) => reply.code(201).send(await service.importPages(
      authenticatedSession(request).user.id, request.params.projectId, request.body.urls)));
};
export default routes;
