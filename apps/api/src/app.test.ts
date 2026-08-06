import assert from 'node:assert/strict';
import test from 'node:test';

import type { OperationV1 } from '@lykar/protocol';

import { buildApp } from './app';
import { hashToken } from './domain/auth';
import type { AuthRepository, AuthenticatedSession, MagicLinkSender, UserRecord } from './domain/auth';
import type { AccessRepository, EditorLaunchTarget, EditorSessionGrant, ShareRecord, ShareTarget } from './domain/access';
import type {
  MembershipRepository,
  ProjectInvitationRecord,
  ProjectMemberRecord,
} from './domain/memberships';
import type {
  ActivationResult, AppendOperationsResult, DraftRecord, PageRecord, ProjectRecord,
  PublishResult, ReleaseRecord, RuntimeManifest, VersioningRepository,
} from './domain/versioning';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const PAGE_ID = '99999999-9999-4999-8999-999999999999';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_ID = '33333333-3333-4333-8333-333333333333';
const MANIFEST_HASH = 'a'.repeat(64);
const PREVIEW_TOKEN = 'preview-token-that-is-long-enough-for-validation';

class ApiRepository implements VersioningRepository {
  createProjectCalls = 0;
  async createProject(input: Parameters<VersioningRepository['createProject']>[0]): Promise<ProjectRecord> {
    this.createProjectCalls++;
    assert.equal(input.ownerUserId, USER_ID);
    return { id: PROJECT_ID, name: input.name, publicKey: input.publicKey, origins: input.origins.map(i=>i.origin), createdBy:input.ownerUserId, createdAt:new Date().toISOString() };
  }
  async listProjects():Promise<ProjectRecord[]>{return[];}
  async createPage(input:Parameters<VersioningRepository['createPage']>[0]):Promise<PageRecord>{return{id:PAGE_ID,projectId:input.projectId,name:input.name,pathname:input.pathname,createdBy:input.userId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  async listPages():Promise<PageRecord[]>{return[];}
  async createDraft(input:Parameters<VersioningRepository['createDraft']>[0]):Promise<DraftRecord>{return{id:DRAFT_ID,projectId:PROJECT_ID,pageId:input.pageId,baseReleaseId:input.baseReleaseId??null,publishedReleaseId:null,status:'open',revision:0,createdBy:input.userId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  async listDrafts():Promise<DraftRecord[]>{return[];}
  async getDraft():Promise<{draft:DraftRecord;operations:OperationV1[]}>{throw new Error('unused');}
  async appendOperations(input:Parameters<VersioningRepository['appendOperations']>[0]):Promise<AppendOperationsResult>{return{draftId:input.draftId,revision:input.expectedRevision+1,appended:input.operations.length};}
  async publishDraft():Promise<PublishResult>{throw new Error('unused');}
  async activateRelease():Promise<ActivationResult>{throw new Error('unused');}
  async listReleases():Promise<ReleaseRecord[]>{return[];}
  async resolveRuntimeManifest(input:Parameters<VersioningRepository['resolveRuntimeManifest']>[0]):Promise<RuntimeManifest>{return{schemaVersion:1,projectId:PROJECT_ID,pageId:PAGE_ID,pathname:input.pathname,releaseId:RELEASE_ID,version:input.version??1,manifestHash:MANIFEST_HASH,operations:[],createdAt:new Date().toISOString()};}
}

class MemoryAuthRepository implements AuthRepository {
  user:UserRecord|null=null; login=new Map<string,{userId:string;expiresAt:Date;used:boolean}>(); sessions=new Map<string,{id:string;userId:string;expiresAt:Date;revoked:boolean}>();
  async findOrCreateUser(input:{id:string;email:string}){return this.user??=( {id:USER_ID,email:input.email,createdAt:new Date().toISOString()} );}
  async findUserByEmail(email:string){return this.user?.email===email?this.user:null;}
  async createLoginToken(input:Parameters<AuthRepository['createLoginToken']>[0]){this.login.set(input.tokenHash,{userId:input.userId,expiresAt:input.expiresAt,used:false});}
  async consumeLoginToken(input:Parameters<AuthRepository['consumeLoginToken']>[0]){const item=this.login.get(input.tokenHash);if(!item||item.used||item.expiresAt<=input.now)return null;item.used=true;return this.user;}
  async createSession(input:Parameters<AuthRepository['createSession']>[0]){this.sessions.set(input.tokenHash,{id:input.id,userId:input.userId,expiresAt:input.expiresAt,revoked:false});}
  async findSession(input:Parameters<AuthRepository['findSession']>[0]):Promise<AuthenticatedSession|null>{const item=this.sessions.get(input.tokenHash);if(!item||item.revoked||item.expiresAt<=input.now||!this.user)return null;return{id:item.id,user:this.user,expiresAt:item.expiresAt.toISOString()};}
  async revokeSession(tokenHash:string){const item=this.sessions.get(tokenHash);if(item)item.revoked=true;}
}

class CapturingSender implements MagicLinkSender { url=''; async send(input:{email:string;url:string;expiresAt:string}){this.url=input.url;} }

class ApiAccessRepository implements AccessRepository {
  async getEditorLaunchTarget():Promise<EditorLaunchTarget>{throw new Error('unused');}
  async createEditorLaunchCode():Promise<void>{throw new Error('unused');}
  async consumeEditorLaunchCode():Promise<EditorSessionGrant|null>{return null;}
  async createEditorSession():Promise<void>{throw new Error('unused');}
  async createShareLink():Promise<ShareRecord>{throw new Error('unused');}
  async listShareLinks():Promise<ShareRecord[]>{return[];}
  async revokeShareLink():Promise<boolean>{return false;}
  async getShareTarget():Promise<ShareTarget|null>{return null;}
  async createShareExchangeCode():Promise<void>{throw new Error('unused');}
  async consumeShareExchangeCode():Promise<ShareTarget|null>{return null;}
  async createShareSession():Promise<void>{throw new Error('unused');}
  async authorizeRuntimeAccess(input:Parameters<AccessRepository['authorizeRuntimeAccess']>[0]):Promise<'editor'|null>{return input.tokenHash===hashToken(PREVIEW_TOKEN)?'editor':null;}
  async authorizeEditorDraft():Promise<string|null>{return null;}
}

class ApiMembershipRepository implements MembershipRepository {
  async listProjectAccess():ReturnType<MembershipRepository['listProjectAccess']>{return{actorRole:'owner',members:[],invitations:[]};}
  async createInvitation():Promise<{invitation:ProjectInvitationRecord;projectName:string}>{throw new Error('unused');}
  async resendInvitation():Promise<{invitation:ProjectInvitationRecord;projectName:string}>{throw new Error('unused');}
  async revokeInvitation():Promise<boolean>{return false;}
  async acceptInvitation():ReturnType<MembershipRepository['acceptInvitation']>{return null;}
  async updateMemberRole():Promise<ProjectMemberRecord>{throw new Error('unused');}
  async revokeMember():Promise<boolean>{return false;}
  async transferOwnership():ReturnType<MembershipRepository['transferOwnership']>{throw new Error('unused');}
}

function setup(){const versioningRepository=new ApiRepository();const authRepository=new MemoryAuthRepository();const sender=new CapturingSender();const app=buildApp({logger:false,appOrigin:'http://localhost:3000',ownerEmail:'owner@example.com',versioningRepository,authRepository,accessRepository:new ApiAccessRepository(),membershipRepository:new ApiMembershipRepository(),magicLinkSender:sender});return{app,versioningRepository,sender};}
async function login(app:ReturnType<typeof buildApp>,sender:CapturingSender):Promise<string>{const requested=await app.inject({method:'POST',url:'/api/auth/magic-link',payload:{email:'owner@example.com'}});assert.equal(requested.statusCode,202);const token=new URL(sender.url).searchParams.get('token');assert.ok(token);const verified=await app.inject({method:'GET',url:`/api/auth/verify?token=${token}`});assert.equal(verified.statusCode,302);const cookie=verified.headers['set-cookie'];assert.equal(typeof cookie,'string');return(cookie as string).split(';')[0];}

test('admin endpoints fail closed without a session cookie',async()=>{const{app,versioningRepository}=setup();try{const response=await app.inject({method:'POST',url:'/api/admin/projects',payload:{name:'Site',origins:['https://example.com']}});assert.equal(response.statusCode,401);assert.equal(versioningRepository.createProjectCalls,0);}finally{await app.close();}});

test('owner signs in through a one-use magic link and creates a project',async()=>{const{app,versioningRepository,sender}=setup();try{const cookie=await login(app,sender);const reused=await app.inject({method:'GET',url:sender.url.replace('http://localhost:3000','')});assert.equal(reused.statusCode,401);const response=await app.inject({method:'POST',url:'/api/admin/projects',headers:{cookie},payload:{name:'Site',origins:['https://Example.com']}});assert.equal(response.statusCode,201);assert.deepEqual(response.json().project.origins,['https://example.com']);assert.equal(versioningRepository.createProjectCalls,1);}finally{await app.close();}});

test('explicit immutable versions require a page-scoped editor or share token',async()=>{const{app}=setup();try{const denied=await app.inject({method:'GET',url:'/api/runtime/projects/pk_public/manifest?pathname=%2Fpricing&version=1'});assert.equal(denied.statusCode,401);const allowed=await app.inject({method:'GET',url:'/api/runtime/projects/pk_public/manifest?pathname=%2Fpricing&version=1',headers:{authorization:`Bearer ${PREVIEW_TOKEN}`}});assert.equal(allowed.statusCode,200);assert.equal(allowed.json().manifest.pathname,'/pricing');assert.equal(allowed.headers.etag,`"${MANIFEST_HASH}"`);assert.match(allowed.headers['cache-control']??'',/private/);}finally{await app.close();}});

test('invalid persisted operation is rejected before repository append',async()=>{const{app,sender}=setup();try{const cookie=await login(app,sender);const response=await app.inject({method:'POST',url:`/api/admin/drafts/${DRAFT_ID}/operations`,headers:{cookie},payload:{expectedRevision:0,operations:[{schemaVersion:1,id:'bad',kind:'executeScript',target:{marker:'hero'}}]}});assert.equal(response.statusCode,400);assert.equal(response.json().error.code,'VALIDATION_ERROR');}finally{await app.close();}});
