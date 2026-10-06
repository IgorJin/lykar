import type {FastifyPluginAsync} from 'fastify';
import type {AuthService} from '../../domain/auth';
import type {SiteConnectionService} from '../../domain/site-connection';
import {authenticatedSession,createSessionGuard} from '../auth';
const routes:FastifyPluginAsync<{service:SiteConnectionService;authService:AuthService}>=async(app,{service,authService})=>{
  app.addHook('preHandler',createSessionGuard(authService));
  app.addHook('onRequest',async(_req,reply)=>{reply.header('Cache-Control','no-store');});
  app.get<{Params:{pageId:string}}>('/api/admin/pages/:pageId/connection',req=>service.state(authenticatedSession(req).user.id,req.params.pageId));
  for(const action of ['challenge','verify','revoke','verify-local'] as const) {
    app.post<{Params:{projectId:string};Body:{origin:string;challengeId?:string;token?:string}}>(`/api/admin/projects/:projectId/origins/${action}`,{
      schema:{body:{type:'object',required:['origin'],additionalProperties:false,properties:{origin:{type:'string',maxLength:2048},challengeId:{type:'string'},token:{type:'string',maxLength:128}}}},
    },async(req,reply)=>{
      const user=authenticatedSession(req).user.id,{projectId}=req.params,{origin}=req.body;
      if(action==='challenge')return reply.code(201).send(await service.challenge(user,projectId,origin));
      if(action==='verify')return service.verify(user,projectId,origin,req.body.challengeId,req.body.token);
      if(action==='verify-local')return service.local(user,projectId,origin);
      await service.revoke(user,projectId,origin);return reply.code(204).send();
    });
  }
  app.post<{Params:{pageId:string};Body:{origin:string}}>('/api/admin/pages/:pageId/connection/probes',{
    schema:{body:{type:'object',required:['origin'],additionalProperties:false,properties:{origin:{type:'string',maxLength:2048}}}},
  },async(req,reply)=>reply.code(201).send(await service.probe(authenticatedSession(req).user.id,req.params.pageId,req.body.origin)));
  app.post<{Params:{pageId:string;probeId:string};Body:{nonce:unknown;report?:unknown;reason?:unknown}}>('/api/admin/pages/:pageId/connection/probes/:probeId',{
    schema:{body:{type:'object',required:['nonce'],additionalProperties:false,properties:{nonce:{type:'string',maxLength:128},report:{type:['object','null']},reason:{enum:['NO_SIGNAL','CANCELLED']}}}},
  },req=>service.finish(authenticatedSession(req).user.id,req.params.pageId,req.params.probeId,req.body));
};
export default routes;
