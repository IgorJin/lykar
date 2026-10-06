import { randomUUID } from 'node:crypto';
import { isConnectionReport } from '@lykar/protocol';
import { hashToken, issueOpaqueToken } from './auth';
import { requireUuid, ValidationError, VersioningError } from './versioning';
import { normalizeVerifiableOrigin, verifyDnsTxt, type DnsTxtVerifier } from './dns-verifier';
import { PostgresSiteRepository } from '../repositories/postgres-site-repository';

export class SiteConnectionService {
  constructor(private readonly repository:PostgresSiteRepository,private readonly options:{allowLoopback?:boolean;dns?:DnsTxtVerifier;now?:()=>Date}={}) {}
  private now() { return this.options.now?.() ?? new Date(); }
  private origin(value:unknown) { return normalizeVerifiableOrigin(value,this.options.allowLoopback===true); }
  private token(value:unknown) { if(typeof value!=='string'|| !/^[A-Za-z0-9_-]{43}$/.test(value))throw new ValidationError('Некорректный код проверки.');return value; }
  async state(user:string,page:unknown) {return {...await this.repository.state(user,requireUuid(page,'pageId'),this.now(),15*60000),allowLoopback:this.options.allowLoopback===true};}
  async challenge(user:string,project:unknown,value:unknown) {
    const origin=this.origin(value);if(origin.local)throw new ValidationError('Для localhost используйте локальное подтверждение.');
    const token=issueOpaqueToken(),id=randomUUID(),now=this.now(),expires=new Date(now.getTime()+24*3600000);
    await this.repository.challenge({user,project:requireUuid(project,'projectId'),origin:origin.origin,id,hash:hashToken(token),now,expires});
    return {id,token,recordName:origin.recordName,recordValue:`lykar-verification=${id}.${token}`,expiresAt:expires.toISOString()};
  }
  async verify(user:string,project:unknown,value:unknown,id:unknown,tokenValue:unknown) {
    const origin=this.origin(value);if(origin.local)throw new ValidationError('DNS verification is not available for loopback');
    const token=this.token(tokenValue),input={user,project:requireUuid(project,'projectId'),origin:origin.origin,id:requireUuid(id,'challengeId'),hash:hashToken(token),now:this.now()};
    await this.repository.prepareVerification(input);
    const result=await (this.options.dns ?? verifyDnsTxt)(origin.hostname,`lykar-verification=${input.id}.${token}`);
    if(result!=='match')throw new VersioningError(result==='missing'?'DNS TXT пока не найден. Проверьте запись и дождитесь обновления DNS.':'DNS временно недоступен. Повторите проверку позже.',result==='missing'?'DNS_TXT_MISSING':'DNS_UNAVAILABLE',result==='missing'?409:503);
    await this.repository.verify({...input,now:this.now()});return {verified:true};
  }
  async local(user:string,project:unknown,value:unknown) {
    const origin=this.origin(value);if(!this.options.allowLoopback||!origin.local)throw new ValidationError('Локальное подтверждение разрешено только для loopback в dev/test.');
    await this.repository.local(user,requireUuid(project,'projectId'),origin.origin,this.now());return {verified:true,method:'local-development'};
  }
  async revoke(user:string,project:unknown,value:unknown) {await this.repository.revoke(user,requireUuid(project,'projectId'),this.origin(value).origin,this.now());}
  async probe(user:string,page:unknown,value:unknown) {
    const origin=this.origin(value),nonce=issueOpaqueToken(),id=randomUUID(),now=this.now(),expires=new Date(now.getTime()+120000);
    const result=await this.repository.probe({user,page:requireUuid(page,'pageId'),origin:origin.origin,id,hash:hashToken(nonce),now,expires});
    return {...result,id,nonce,expiresAt:expires.toISOString()};
  }
  finish(user:string,page:unknown,id:unknown,body:{nonce:unknown;report?:unknown;reason?:unknown}) {
    const nonce=this.token(body.nonce);
    if(body.report!==undefined&&body.report!==null&&(!isConnectionReport(body.report)||body.report.nonce!==nonce))throw new ValidationError('Некорректный отчёт подключения.');
    if(!body.report&&!['NO_SIGNAL','CANCELLED'].includes(body.reason as string))throw new ValidationError('Укажите причину отсутствия отчёта.');
    return this.repository.finish({user,page:requireUuid(page,'pageId'),id:requireUuid(id,'probeId'),hash:hashToken(nonce),now:this.now(),report:isConnectionReport(body.report)?body.report:null,reason:body.reason==='CANCELLED'?'CANCELLED':'NO_SIGNAL'});
  }
}
