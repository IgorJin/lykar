import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

import { buildApp } from '../app';
import { hashToken } from '../domain/auth';
import type { DnsTxtVerifier } from '../domain/dns-verifier';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
type Challenge = {id: string; token: string; recordName: string; recordValue: string; expiresAt: string};
type Probe = {id: string; nonce: string; pageUrl: string; publicKey: string; expiresAt: string};
type OriginState = {origin: string; verifiedAt: string | null; verificationMethod: string | null;
  connection: {status: string; code: string; report: Record<string, unknown> | null}};

test('site verification and connection probes bind proofs to owners, exact origins and current challenges', {
  skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured', timeout: 60000,
}, async () => {
  const suffix = randomUUID();
  const origin = `https://connection-${suffix}.example.com`, alternateOrigin = `${origin}:8443`;
  const emailA = `connection-a-${suffix}@example.com`, emailB = `connection-b-${suffix}@example.com`;
  const links = new Map<string, string>();
  let clock = Date.now();
  const advance = (milliseconds: number) => { clock += milliseconds; };
  let dnsResult: Awaited<ReturnType<DnsTxtVerifier>> = 'missing';
  const dnsCalls: Array<{hostname: string; value: string}> = [];
  let holdDns = false;
  let signalDnsStarted: (() => void) | undefined;
  let finishDns: ((value: Awaited<ReturnType<DnsTxtVerifier>>) => void) | undefined;
  const dns: DnsTxtVerifier = async (hostname, value) => {
    dnsCalls.push({hostname, value});
    if (!holdDns) return dnsResult;
    return new Promise(resolve => { finishDns = resolve; signalDnsStarted?.(); });
  };
  const options = {logger: false, connectionString: databaseUrl, emailLimits: false as const,
    siteDnsVerifier: dns, siteNow: () => new Date(clock), siteAllowLoopback: false,
    magicLinkSender: {async send(input: {email: string; url: string}) { links.set(input.email, input.url); }}};
  const app = buildApp(options);
  const pool = new Pool({connectionString: databaseUrl});
  let localApp: ReturnType<typeof buildApp> | undefined;
  const post = (url: string, payload: Record<string, unknown>, cookie: string) =>
    app.inject({method: 'POST', url, payload, headers: {cookie}});
  const expectError = (response: {statusCode: number; body: string; json(): {error: {code: string}}}, status: number, code: string) => {
    assert.equal(response.statusCode, status, response.body);
    assert.equal(response.json().error.code, code, response.body);
  };
  try {
    const login = async (email: string) => {
      const requested = await app.inject({method: 'POST', url: '/api/auth/magic-link', payload: {email}});
      assert.equal(requested.statusCode, 202, requested.body);
      const link = new URL(links.get(email)!);
      const loggedIn = await app.inject({method: 'GET', url: link.pathname + link.search});
      assert.equal(loggedIn.statusCode, 302, loggedIn.body);
      const cookie = String(loggedIn.headers['set-cookie']).split(';')[0];
      const session = await app.inject({method: 'GET', url: '/api/auth/session', headers: {cookie}});
      assert.equal(session.statusCode, 200, session.body);
      return {cookie, id: session.json().user.id as string};
    };
    const a = await login(emailA), b = await login(emailB);
    const project = async (name: string, origins: string[], cookie: string) => {
      const created = await post('/api/admin/projects', {name, origins}, cookie);
      assert.equal(created.statusCode, 201, created.body);
      const result = created.json().project;
      const pages = await app.inject({method: 'GET', url: `/api/admin/projects/${result.id}/pages`, headers: {cookie}});
      assert.equal(pages.statusCode, 200, pages.body);
      return {id: result.id as string, publicKey: result.publicKey as string, pageId: pages.json().pages[0].id as string};
    };
    const pa = await project('Site connection A', [origin, alternateOrigin], a.cookie);
    const pb = await project('Site connection B', [origin], b.cookie);
    const action = (name: string, payload: Record<string, unknown>, cookie = a.cookie, projectId = pa.id) =>
      post(`/api/admin/projects/${projectId}/origins/${name}`, payload, cookie);
    const state = async (cookie = a.cookie, pageId = pa.pageId): Promise<OriginState[]> => {
      const response = await app.inject({method: 'GET', url: `/api/admin/pages/${pageId}/connection`, headers: {cookie}});
      assert.equal(response.statusCode, 200, response.body);
      assert.match(String(response.headers['cache-control']), /no-store/);
      return response.json().origins;
    };
    const originState = async (value = origin) => (await state()).find(item => item.origin === value)!;
    const challenge = async (value = origin): Promise<Challenge> => {
      const response = await action('challenge', {origin: value});
      assert.equal(response.statusCode, 201, response.body);
      const proof = response.json() as Challenge;
      assert.equal(proof.recordName, `_lykar-verification.${new URL(value).hostname}`);
      assert.equal(proof.recordValue, `lykar-verification=${proof.id}.${proof.token}`);
      assert.match(proof.token, /^[A-Za-z0-9_-]{43}$/);
      const stored = await pool.query('SELECT token_hash FROM origin_verification_challenges WHERE id=$1', [proof.id]);
      assert.equal(stored.rows[0].token_hash.trim(), hashToken(proof.token));
      return proof;
    };
    const verify = (proof: Challenge, value = origin, cookie = a.cookie, projectId = pa.id) =>
      action('verify', {origin: value, challengeId: proof.id, token: proof.token}, cookie, projectId);

    assert.ok((await state()).every(item => item.verifiedAt === null && item.connection.status === 'unchecked'));
    const first = await challenge();
    const callsBefore = dnsCalls.length;
    expectError(await verify({...first, token: 'x'.repeat(43)}), 409, 'VERIFICATION_CHALLENGE_INVALID');
    expectError(await verify(first, alternateOrigin), 409, 'VERIFICATION_CHALLENGE_INVALID');
    expectError(await verify(first, origin, b.cookie, pb.id), 409, 'VERIFICATION_CHALLENGE_INVALID');
    expectError(await verify(first, origin, b.cookie), 403, 'FORBIDDEN');
    assert.equal(dnsCalls.length, callsBefore, 'invalid proof must not initiate DNS');
    expectError(await verify(first), 409, 'DNS_TXT_MISSING');
    assert.deepEqual(dnsCalls[dnsCalls.length - 1], {hostname: new URL(origin).hostname, value: first.recordValue});
    expectError(await verify(first), 429, 'DNS_CHECK_COOLDOWN');
    assert.equal(dnsCalls.length, callsBefore + 1);
    advance(5000);
    dnsResult = 'unavailable';
    expectError(await verify(first), 503, 'DNS_UNAVAILABLE');
    advance(5000);
    dnsResult = 'match';
    const accepted = await verify(first);
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal((await originState()).verificationMethod, 'dns-txt');
    assert.equal((await originState(alternateOrigin)).verifiedAt, null, 'verification must retain the exact port binding');
    expectError(await verify(first), 409, 'VERIFICATION_CHALLENGE_INVALID');

    // A verified sibling origin cannot authorize a new public deployment.
    const draft = await post(`/api/admin/pages/${pa.pageId}/drafts`, {}, a.cookie);
    assert.equal(draft.statusCode, 201, draft.body);
    const draftId = draft.json().draft.id;
    const saved = await post(`/api/admin/drafts/${draftId}/operations`, {
      expectedRevision: 0, idempotencyKey: `connection-save-${suffix}`,
      sourceSnapshot: {algorithm: 'lykar-dom-v1', pageHash: 'c'.repeat(64), capturedAt: new Date(clock).toISOString()},
      operations: [{schemaVersion: 1, id: `connection-op-${suffix}`, kind: 'setText', target: {marker: 'hero-title'}, value: 'Verified site'}],
    }, a.cookie);
    assert.equal(saved.statusCode, 200, saved.body);
    const published = await post(`/api/admin/drafts/${draftId}/publish`, {expectedRevision: 1}, a.cookie);
    assert.equal(published.statusCode, 201, published.body);
    const deployment = {releaseId: published.json().release.id, expectedRevision: 0,
      idempotencyKey: `connection-deploy-${suffix}`, reason: 'Deploy verified site'};
    const deployUrl = `/api/admin/pages/${pa.pageId}/deployment/deploy`;
    expectError(await post(deployUrl, deployment, a.cookie), 409, 'ORIGIN_NOT_VERIFIED');
    const alternateProof = await challenge(alternateOrigin);
    assert.equal((await verify(alternateProof, alternateOrigin)).statusCode, 200);
    const deployed = await post(deployUrl, deployment, a.cookie);
    assert.equal(deployed.statusCode, 200, deployed.body);
    const runtimeUrl = `/api/runtime/projects/${pa.publicKey}/deployment?pathname=%2F`;
    const runtime = (value: string) => app.inject({method: 'GET', url: runtimeUrl, headers: {origin: value}});
    assert.equal((await runtime(origin)).statusCode, 200);
    assert.equal((await action('revoke', {origin})).statusCode, 204);
    const revokedRuntime = await runtime(origin);
    assert.equal(revokedRuntime.statusCode, 204, revokedRuntime.body);
    assert.equal(revokedRuntime.headers['access-control-allow-origin'], undefined);
    assert.equal((await runtime(alternateOrigin)).statusCode, 200);

    const rotated = await challenge();
    advance(1);
    const current = await challenge();
    expectError(await verify(rotated), 409, 'VERIFICATION_CHALLENGE_INVALID');
    advance(24 * 3600000);
    expectError(await verify(current), 409, 'VERIFICATION_CHALLENGE_INVALID');
    const pendingProof = await challenge();
    holdDns = true;
    const started = new Promise<void>(resolve => { signalDnsStarted = resolve; });
    const pending = verify(pendingProof);
    await started;
    assert.equal((await action('revoke', {origin})).statusCode, 204);
    finishDns!('match');
    holdDns = false;
    expectError(await pending, 409, 'VERIFICATION_CHALLENGE_INVALID');
    assert.equal((await originState()).verifiedAt, null, 'late DNS completion cannot undo revocation');

    // Membership policy distinguishes reading diagnostics from mutating proofs and probes.
    const membershipId = randomUUID();
    await pool.query('INSERT INTO project_memberships(id,project_id,user_id,role) VALUES($1,$2,$3,$4)',
      [membershipId, pa.id, b.id, 'viewer']);
    assert.equal((await state(b.cookie)).length, 2);
    for (const role of ['viewer', 'editor']) {
      await pool.query('UPDATE project_memberships SET role=$2 WHERE id=$1', [membershipId, role]);
      expectError(await action('challenge', {origin}, b.cookie), 403, 'FORBIDDEN');
      expectError(await action('revoke', {origin}, b.cookie), 403, 'FORBIDDEN');
    }
    await pool.query('UPDATE project_memberships SET role=$2 WHERE id=$1', [membershipId, 'viewer']);
    expectError(await post(`/api/admin/pages/${pa.pageId}/connection/probes`, {origin}, b.cookie), 403, 'FORBIDDEN');
    await pool.query('UPDATE project_memberships SET role=$2 WHERE id=$1', [membershipId, 'editor']);

    const otherPage = await post(`/api/admin/projects/${pa.id}/pages`, {name: 'Other', pathname: '/other'}, a.cookie);
    assert.equal(otherPage.statusCode, 201, otherPage.body);
    const otherPageId = otherPage.json().page.id as string;
    const probe = async (value = origin): Promise<Probe> => {
      // Deliberately keep the same timestamp: the active generation wins even under ties.
      const response = await post(`/api/admin/pages/${pa.pageId}/connection/probes`, {origin: value}, a.cookie);
      assert.equal(response.statusCode, 201, response.body);
      const result = response.json() as Probe;
      assert.equal(result.pageUrl, `${value}/`);
      const stored = await pool.query('SELECT token_hash FROM site_connection_probes WHERE id=$1', [result.id]);
      assert.equal(stored.rows[0].token_hash.trim(), hashToken(result.nonce));
      return result;
    };
    const report = (target: Probe, overrides: Record<string, unknown> = {}) => ({
      type: 'lykar:connection-report', schemaVersion: 1, nonce: target.nonce, pageUrl: target.pageUrl,
      projectKey: target.publicKey, sdkVersion: '1.0.0', api: 'reachable',
      runtimeAsset: 'ready', editorAsset: 'ready', readiness: 'ready', csp: [], ...overrides,
    });
    const finish = (target: Probe, payload: Record<string, unknown>, cookie = a.cookie, pageId = pa.pageId) =>
      post(`/api/admin/pages/${pageId}/connection/probes/${target.id}`, {nonce: target.nonce, ...payload}, cookie);
    const bound = await probe();
    expectError(await finish(bound, {nonce: 'x'.repeat(43), reason: 'NO_SIGNAL'}), 409, 'CONNECTION_PROBE_INVALID');
    expectError(await finish(bound, {reason: 'NO_SIGNAL'}, b.cookie), 409, 'CONNECTION_PROBE_INVALID');
    expectError(await finish(bound, {reason: 'NO_SIGNAL'}, a.cookie, otherPageId), 409, 'CONNECTION_PROBE_INVALID');
    expectError(await finish(bound, {report: report(bound, {pageUrl: `${alternateOrigin}/`})}), 403, 'FORBIDDEN');
    expectError(await finish(bound, {report: report(bound, {nonce: 'x'.repeat(43)})}), 400, 'VALIDATION_ERROR');
    const complete = await finish(bound, {report: report(bound)});
    assert.equal(complete.statusCode, 200, complete.body);
    assert.equal(complete.json().code, 'OK');
    const checked = await originState();
    assert.equal(checked.connection.status, 'checked');
    assert.equal(checked.verifiedAt, null, 'connection evidence does not prove domain ownership');
    assert.deepEqual(checked.connection.report, {sdkVersion: '1.0.0', api: 'reachable', runtimeAsset: 'ready',
      editorAsset: 'ready', readiness: 'ready', csp: []});
    expectError(await finish(bound, {report: report(bound)}), 409, 'CONNECTION_PROBE_INVALID');
    advance(15 * 60000);
    assert.equal((await originState()).connection.status, 'stale');

    const older = await probe(), newer = await probe();
    expectError(await finish(older, {reason: 'NO_SIGNAL'}), 409, 'CONNECTION_PROBE_INVALID');
    assert.equal((await originState()).connection.status, 'checking');
    assert.equal((await finish(newer, {reason: 'NO_SIGNAL'})).json().code, 'NO_SIGNAL');
    assert.equal((await originState()).connection.status, 'inconclusive');
    const expired = await probe();
    advance(120000);
    expectError(await finish(expired, {reason: 'NO_SIGNAL'}), 409, 'CONNECTION_PROBE_INVALID');
    assert.equal((await originState()).connection.status, 'inconclusive');
    for (const [overrides, code] of [
      [{projectKey: 'pk_another_project'}, 'WRONG_PROJECT_KEY'],
      [{csp: ['script-src']}, 'CSP_BLOCKED'],
      [{runtimeAsset: 'unavailable'}, 'RUNTIME_ASSET_UNAVAILABLE'],
      [{readiness: 'unsupported'}, 'UNSUPPORTED_FRAMEWORK'],
    ] as const) {
      const target = await probe();
      const response = await finish(target, {report: report(target, overrides)});
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().code, code);
      assert.equal((await originState()).connection.status, 'attention');
    }
    const revokedProbe = await probe();
    assert.equal((await action('revoke', {origin})).statusCode, 204);
    expectError(await finish(revokedProbe, {reason: 'NO_SIGNAL'}), 409, 'CONNECTION_PROBE_INVALID');
    assert.equal((await originState()).connection.status, 'unchecked');
    assert.equal((await originState()).connection.report, null);

    const local = await project('Local site connection', ['http://localhost:3007'], a.cookie);
    expectError(await action('verify-local', {origin: 'http://localhost:3007'}, a.cookie, local.id), 400, 'VALIDATION_ERROR');
    localApp = buildApp({...options, siteAllowLoopback: true});
    const localResponse = await localApp.inject({method: 'POST',
      url: `/api/admin/projects/${local.id}/origins/verify-local`, headers: {cookie: a.cookie}, payload: {origin: 'http://localhost:3007'}});
    assert.equal(localResponse.statusCode, 200, localResponse.body);
    assert.equal(localResponse.json().method, 'local-development');
    assert.equal((await state(a.cookie, local.pageId))[0].verificationMethod, 'local-development');
    const localRuntime = `/api/runtime/projects/${local.publicKey}/deployment?pathname=%2F`;
    assert.equal((await app.inject({method:'GET',url:localRuntime,headers:{origin:'http://localhost:3007'}})).statusCode,204,
      'local-development proof must not authorize an API with local verification disabled');
    assert.equal((await localApp.inject({method:'GET',url:localRuntime,headers:{origin:'http://localhost:3007'}})).statusCode,200);
    const publicLocal = await localApp.inject({method: 'POST', url: `/api/admin/projects/${pa.id}/origins/verify-local`,
      headers: {cookie: a.cookie}, payload: {origin}});
    expectError(publicLocal, 400, 'VALIDATION_ERROR');
  } finally {
    finishDns?.('unavailable');
    if (localApp) await localApp.close();
    await app.close();
    await pool.end();
  }
});
