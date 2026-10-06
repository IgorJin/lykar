import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ConsoleMagicLinkSender } from './domain/auth';
import { ConsoleInvitationSender } from './domain/memberships';

import type { OperationV1 } from '@lykar/protocol';

import { buildApp, type BuildAppOptions } from './app';
import type { AnalyticsRepository, ExperimentAnalyticsReport } from './domain/analytics';
import { hashToken } from './domain/auth';
import type { AuthRepository, AuthenticatedSession, MagicLinkSender, UserRecord } from './domain/auth';
import type { AccessRepository, EditorLaunchTarget, EditorSessionGrant, ShareRecord, ShareTarget } from './domain/access';
import type { ExperimentRecord, ExperimentRepository, VariantRuntimeResolution } from './domain/experiments';
import type {
  MembershipRepository,
  ProjectInvitationRecord,
  ProjectMemberRecord,
} from './domain/memberships';
import type {
  AppendOperationsResult, DraftRecord, PageRecord, ProjectRecord,
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
  async createDraft(input:Parameters<VersioningRepository['createDraft']>[0]):Promise<DraftRecord>{return{id:DRAFT_ID,projectId:PROJECT_ID,pageId:input.pageId,baseReleaseId:input.baseReleaseId??null,publishedReleaseId:null,status:'open',revision:0,sourceSnapshot:null,createdBy:input.userId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
  async listDrafts():Promise<DraftRecord[]>{return[];}
  async getDraft():Promise<{draft:DraftRecord;operations:OperationV1[]}>{throw new Error('unused');}
  async appendOperations(input:Parameters<VersioningRepository['appendOperations']>[0]):Promise<AppendOperationsResult>{return{draftId:input.draftId,revision:input.expectedRevision+1,appended:input.operations.length,operationIds:input.operations.map(operation=>operation.id),idempotencyKey:input.idempotencyKey,payloadHash:input.payloadHash,replayed:false,savedAt:new Date().toISOString(),expiresAt:input.resultExpiresAt};}
  async publishDraft():Promise<PublishResult>{throw new Error('unused');}
  async listReleases():Promise<ReleaseRecord[]>{return[];}
  async resolveRuntimeManifest(input:Parameters<VersioningRepository['resolveRuntimeManifest']>[0]):Promise<RuntimeManifest>{return{schemaVersion:1,projectId:PROJECT_ID,pageId:PAGE_ID,pathname:input.pathname,releaseId:RELEASE_ID,version:input.version??1,manifestHash:MANIFEST_HASH,operations:[],createdAt:new Date().toISOString()};}
}

class ApiExperimentRepository implements ExperimentRepository {
  async createExperiment():Promise<ExperimentRecord>{throw new Error('unused');}
  async listExperiments():Promise<ExperimentRecord[]>{return[];}
  async updateVariant():Promise<ExperimentRecord>{throw new Error('unused');}
  async transition():Promise<ExperimentRecord>{throw new Error('unused');}
  async createExperimentLink():ReturnType<ExperimentRepository['createExperimentLink']>{throw new Error('unused');}
  async revokeExperimentLink():Promise<boolean>{return false;}
  async createVariantLink():ReturnType<ExperimentRepository['createVariantLink']>{throw new Error('unused');}
  async revokeVariantLink():Promise<boolean>{return false;}
  async resolveVariant():Promise<VariantRuntimeResolution|null>{return null;}
}

class ApiAnalyticsRepository implements AnalyticsRepository {
  async resolveAssignment():ReturnType<AnalyticsRepository['resolveAssignment']>{return null;}
  async recordEvent():Promise<{duplicate:boolean}>{return{duplicate:false};}
  async getReport():Promise<ExperimentAnalyticsReport>{throw new Error('unused');}
}

class MemoryAuthRepository implements AuthRepository {
  user:UserRecord|null=null; login=new Map<string,{email:string;expiresAt:Date;used:boolean}>(); sessions=new Map<string,{id:string;userId:string;expiresAt:Date;revoked:boolean}>();
  async findOrCreateUser(input:{id:string;email:string}){return this.user??=( {id:USER_ID,email:input.email,createdAt:new Date().toISOString()} );}
  async findUserByEmail(email:string){return this.user?.email===email?this.user:null;}
  async createLoginToken(input:Parameters<AuthRepository['createLoginToken']>[0]){this.login.set(input.tokenHash,{email:input.email,expiresAt:input.expiresAt,used:false});}
  async consumeLoginToken(input:Parameters<AuthRepository['consumeLoginToken']>[0]){const item=this.login.get(input.tokenHash);if(!item||item.used||item.expiresAt<=input.now)return null;item.used=true;return this.findOrCreateUser({id:USER_ID,email:item.email});}
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
  async getInvitationForResend():Promise<{email:string}>{throw new Error('unused');}
  async listProjectAccess():ReturnType<MembershipRepository['listProjectAccess']>{return{actorRole:'owner',members:[],invitations:[]};}
  async createInvitation():Promise<{invitation:ProjectInvitationRecord;projectName:string}>{throw new Error('unused');}
  async resendInvitation():Promise<{invitation:ProjectInvitationRecord;projectName:string}>{throw new Error('unused');}
  async revokeInvitation():Promise<boolean>{return false;}
  async acceptInvitation():ReturnType<MembershipRepository['acceptInvitation']>{return null;}
  async updateMemberRole():Promise<ProjectMemberRecord>{throw new Error('unused');}
  async revokeMember():Promise<boolean>{return false;}
  async transferOwnership():ReturnType<MembershipRepository['transferOwnership']>{throw new Error('unused');}
}

function setup(overrides: Pick<BuildAppOptions, 'devAuth' | 'development' | 'appOrigin'> = {}) {
  const versioningRepository = new ApiRepository();
  const authRepository = new MemoryAuthRepository();
  const sender = new CapturingSender();
  const app = buildApp({
    logger: false,
    emailLimits: false,
    appOrigin: 'http://localhost:3000',
    ownerEmail: 'owner@example.com',
    versioningRepository,
    authRepository,
    accessRepository: new ApiAccessRepository(),
    membershipRepository: new ApiMembershipRepository(),
    experimentRepository: new ApiExperimentRepository(),
    analyticsRepository: new ApiAnalyticsRepository(),
    deploymentRepository: {
      async getState(_userId, pageId) { return {pageId, revision: 0, activeReleaseId: null, activation: null}; },
      async listHistory() { return {activations: [], nextBeforeRevision: null}; },
      async activate() { throw new Error('Deployment mutations use PostgreSQL integration tests'); },
      async resolve() { return null; },
    },
    magicLinkSender: sender,
    ...overrides,
  });
  return { app, versioningRepository, sender };
}
async function login(app:ReturnType<typeof buildApp>,sender:CapturingSender):Promise<string>{const requested=await app.inject({method:'POST',url:'/api/auth/magic-link',payload:{email:'owner@example.com'}});assert.equal(requested.statusCode,202);const token=new URL(sender.url).searchParams.get('token');assert.ok(token);const verified=await app.inject({method:'GET',url:`/api/auth/verify?token=${token}`});assert.equal(verified.statusCode,302);const cookie=verified.headers['set-cookie'];assert.equal(typeof cookie,'string');return(cookie as string).split(';')[0];}

test('admin endpoints fail closed without a session cookie',async()=>{const{app,versioningRepository}=setup();try{const response=await app.inject({method:'POST',url:'/api/admin/projects',payload:{name:'Site',origins:['https://example.com']}});assert.equal(response.statusCode,401);assert.equal(versioningRepository.createProjectCalls,0);}finally{await app.close();}});

test('development login is disabled unless the local development mode is enabled', async () => {
  const { app } = setup();
  try {
    const status = await app.inject({ method: 'GET', url: '/api/auth/dev-login' });
    assert.deepEqual(status.json(), { enabled: false });
    const login = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: {} });
    assert.equal(login.statusCode, 404);
  } finally {
    await app.close();
  }
});

test('local development login creates a normal owner session', async () => {
  const { app, versioningRepository } = setup({ devAuth: true });
  try {
    const crossSiteLogin = await app.inject({
      method: 'POST', url: '/api/auth/dev-login', payload: {},
      headers: { origin: 'https://untrusted.example', 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(crossSiteLogin.statusCode, 403);
    assert.equal(crossSiteLogin.headers['set-cookie'], undefined);
    const status = await app.inject({ method: 'GET', url: '/api/auth/dev-login' });
    assert.deepEqual(status.json(), { enabled: true });
    const login = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: {} });
    assert.equal(login.statusCode, 200);
    const cookie = login.headers['set-cookie'];
    assert.equal(typeof cookie, 'string');
    const sessionCookie = (cookie as string).split(';')[0];
    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: sessionCookie } });
    assert.equal(session.statusCode, 200);
    assert.equal(session.json().user.email, 'owner@example.com');
    const project = await app.inject({
      method: 'POST',
      url: '/api/admin/projects',
      headers: { cookie: sessionCookie },
      payload: { name: 'Local site', origins: ['http://localhost:4173'] },
    });
    assert.equal(project.statusCode, 201);
    assert.equal(versioningRepository.createProjectCalls, 1);
  } finally {
    await app.close();
  }
});

test('development login refuses production and non-loopback origins', () => {
  assert.throws(() => setup({ devAuth: true, development: false }), /outside production/);
  assert.throws(
    () => setup({ devAuth: true, development: true, appOrigin: 'https://admin.example.com' }),
    /loopback app origin/,
  );
});

test('owner signs in through a one-use magic link and creates a project',async()=>{const{app,versioningRepository,sender}=setup();try{const cookie=await login(app,sender);const reused=await app.inject({method:'GET',url:sender.url.replace('http://localhost:3000','')});assert.equal(reused.statusCode,401);const response=await app.inject({method:'POST',url:'/api/admin/projects',headers:{cookie},payload:{name:'Site',origins:['https://Example.com']}});assert.equal(response.statusCode,201);assert.deepEqual(response.json().project.origins,['https://example.com']);assert.equal(versioningRepository.createProjectCalls,1);}finally{await app.close();}});

test('explicit immutable versions require a page-scoped editor or share token',async()=>{const{app}=setup();try{const denied=await app.inject({method:'GET',url:'/api/runtime/projects/pk_public/manifest?pathname=%2Fpricing&version=1'});assert.equal(denied.statusCode,401);const allowed=await app.inject({method:'GET',url:'/api/runtime/projects/pk_public/manifest?pathname=%2Fpricing&version=1',headers:{authorization:`Bearer ${PREVIEW_TOKEN}`}});assert.equal(allowed.statusCode,200);assert.equal(allowed.json().manifest.pathname,'/pricing');assert.equal(allowed.headers.etag,`"${MANIFEST_HASH}"`);assert.match(allowed.headers['cache-control']??'',/private/);}finally{await app.close();}});

test('runtime without an explicit version or variant token leaves the native page untouched',async()=>{const{app}=setup();try{const response=await app.inject({method:'GET',url:'/api/runtime/projects/pk_public/manifest?pathname=%2Fpricing'});assert.equal(response.statusCode,204);}finally{await app.close();}});

test('invalid persisted operation is rejected before repository append',async()=>{const{app,sender}=setup();try{const cookie=await login(app,sender);const response=await app.inject({method:'POST',url:`/api/admin/drafts/${DRAFT_ID}/operations`,headers:{cookie},payload:{idempotencyKey:'save-request-invalid-0001',expectedRevision:0,operations:[{schemaVersion:1,id:'bad',kind:'executeScript',target:{marker:'hero'}}]}});assert.equal(response.statusCode,400);assert.equal(response.json().error.code,'VALIDATION_ERROR');}finally{await app.close();}});

test('signup request creates no account/session until verification and browser errors remove secret URL', async () => {
  const { app, sender } = setup();
  try {
    const requested = await app.inject({ method: 'POST', url: '/api/auth/magic-link', payload: { email: 'new@example.com' } });
    assert.equal(requested.statusCode, 202);
    assert.equal(requested.headers['set-cookie'], undefined);
    assert.match(sender.url, /token=/);
    assert.equal((await app.inject({ method: 'GET', url: '/api/auth/session' })).statusCode, 401);
    const verified = await app.inject({ method: 'GET', url: sender.url });
    assert.equal(verified.statusCode, 302);
    const cookie = String(verified.headers['set-cookie']).split(';')[0];
    const session = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    assert.equal(session.json().user.email, 'new@example.com');
    const reused = await app.inject({ method: 'GET', url: sender.url, headers: { accept: 'text/html' } });
    assert.equal(reused.headers.location, '/admin/?authError=invalid-link');
    assert.equal(reused.headers['set-cookie'], undefined);
    assert.equal(reused.headers['cache-control'], 'no-store');
  } finally { await app.close(); }
});

test('production refuses default console senders and has no privileged owner registration', () => {
  assert.throws(() => setup({ development: false }), /configured email senders/);
});

test('production cannot enable local login, console senders or file delivery', () => {
  assert.throws(() => buildApp({development:false,siteAllowLoopback:true}), /restricted to development/);
  assert.throws(() => buildApp({ development: false, magicLinkSender: new ConsoleMagicLinkSender(), invitationSender: new ConsoleInvitationSender() }), /configured email senders/);
  for (const configuration of [
    { LYKAR_DEV_AUTH: '1', LYKAR_MAGIC_LINK_FILE: '' },
    { LYKAR_DEV_AUTH: '0', LYKAR_MAGIC_LINK_FILE: '/tmp/lykar-production-must-not-write.ndjson' },
  ]) {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'server.js')], {
      env: { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', ...configuration }, encoding: 'utf8', timeout: 5000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside production|restricted to local non-production/);
  }
});
