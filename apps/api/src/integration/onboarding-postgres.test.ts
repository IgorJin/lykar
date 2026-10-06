import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

import { buildApp } from '../app';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;

test('onboarding origins and sitemap imports enforce roles, current allowlists and transactional deduplication', {
  skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured', timeout: 60000,
}, async () => {
  const suffix = randomUUID();
  const origin = `https://onboarding-${suffix}.example.com`;
  const alternate = `${origin}:8443`;
  const links = new Map<string, string>();
  const previewCalls: {url: string; origins: string[]}[] = [];
  const app = buildApp({logger: false, connectionString: databaseUrl, emailLimits: false,
    magicLinkSender: {async send(input) { links.set(input.email, input.url); }},
    sitemapPreview: async (url, origins) => {
      previewCalls.push({url, origins});
      return {pages: [{pathname: '/offer', url: `${origin}/offer`}], duplicates: 2, excluded: 1};
    }});
  const pool = new Pool({connectionString: databaseUrl});
  type Response = {statusCode: number; body: string; json(): any};
  const success = (response: Response, status: number) => assert.equal(response.statusCode, status, response.body);
  const error = (response: Response, status: number, code: string) => {
    success(response, status); assert.equal(response.json().error.code, code, response.body);
  };
  const request = (method: 'GET' | 'POST' | 'DELETE', url: string, cookie?: string, payload?: Record<string, unknown>) =>
    app.inject({method, url, ...(cookie ? {headers: {cookie}} : {}), ...(payload ? {payload} : {})});
  try {
    const login = async (label: string) => {
      const email = `onboarding-${label}-${suffix}@example.com`;
      success(await request('POST', '/api/auth/magic-link', undefined, {email}), 202);
      const link = new URL(links.get(email)!);
      const loggedIn = await request('GET', link.pathname + link.search);
      success(loggedIn, 302);
      const cookie = String(loggedIn.headers['set-cookie']).split(';')[0];
      const session = await request('GET', '/api/auth/session', cookie);
      success(session, 200);
      return {cookie, id: session.json().user.id as string};
    };
    const owner = await login('owner'), other = await login('other');
    const created = await request('POST', '/api/admin/projects', owner.cookie, {name: 'Onboarding site', origins: [origin]});
    success(created, 201);
    const projectId = created.json().project.id as string;
    const publicKey = created.json().project.publicKey as string;
    const pagesUrl = `/api/admin/projects/${projectId}/pages`;
    const originsUrl = `/api/admin/projects/${projectId}/origins`;
    const previewUrl = `/api/admin/projects/${projectId}/sitemap/preview`;
    const importUrl = `/api/admin/projects/${projectId}/sitemap/import`;
    const rootPage = (await request('GET', pagesUrl, owner.cookie)).json().pages[0];
    const add = (value: string, cookie = owner.cookie) => request('POST', originsUrl, cookie, {origin: value});
    const remove = (value: string, cookie = owner.cookie) => request('DELETE', originsUrl, cookie, {origin: value});
    const importPages = (urls: string[], cookie = owner.cookie) => request('POST', importUrl, cookie, {urls});

    success(await request('GET', originsUrl), 401);
    error(await request('GET', originsUrl, other.cookie), 403, 'FORBIDDEN');
    error(await request('POST', previewUrl, other.cookie, {url: `${origin}/sitemap.xml`}), 403, 'FORBIDDEN');
    assert.equal(previewCalls.length, 0, 'foreign membership must not initiate fetching');
    error(await add(alternate, other.cookie), 403, 'FORBIDDEN');
    error(await remove(origin, other.cookie), 403, 'FORBIDDEN');
    error(await importPages([`${origin}/foreign-user`], other.cookie), 403, 'FORBIDDEN');
    error(await remove(origin), 409, 'LAST_ORIGIN_REQUIRED');

    const added = await add(alternate);
    success(added, 201);
    const alternateId = added.json().origin.id as string;
    assert.equal(added.json().origin.verifiedAt, null);
    assert.equal(added.json().origin.verificationMethod, null);
    const duplicate = await add(alternate);
    success(duplicate, 200);
    assert.equal(duplicate.json().origin.id, alternateId);
    const origins = await request('GET', originsUrl, owner.cookie);
    success(origins, 200);
    assert.match(String(origins.headers['cache-control']), /no-store/);
    assert.equal(origins.json().origins.length, 2);
    assert.equal(origins.json().allowLoopback, false);
    error(await add('http://127.0.0.1:3000'), 400, 'VALIDATION_ERROR');
    error(await add('https://example.com/path'), 400, 'VALIDATION_ERROR');

    const membershipId = randomUUID();
    await pool.query('INSERT INTO project_memberships(id,project_id,user_id,role) VALUES($1,$2,$3,$4)',
      [membershipId, projectId, other.id, 'viewer']);
    for (const role of ['viewer', 'editor']) {
      await pool.query('UPDATE project_memberships SET role=$2 WHERE id=$1', [membershipId, role]);
      success(await request('GET', originsUrl, other.cookie), 200);
      error(await add(`https://role-${suffix}.example.com`, other.cookie), 403, 'FORBIDDEN');
      error(await remove(alternate, other.cookie), 403, 'FORBIDDEN');
      error(await importPages([`${origin}/role-page`], other.cookie), 403, 'FORBIDDEN');
    }
    const preview = await request('POST', previewUrl, other.cookie, {url: `${origin}/sitemap.xml`});
    success(preview, 200);
    assert.deepEqual(preview.json(), {pages: [{pathname: '/offer', url: `${origin}/offer`}], duplicates: 2, excluded: 1});
    assert.deepEqual(previewCalls[0], {url: `${origin}/sitemap.xml`, origins: [origin, alternate]});
    await pool.query("UPDATE project_memberships SET role='admin' WHERE id=$1", [membershipId]);
    success(await importPages([`${origin}/admin-page`], other.cookie), 201);

    const imported = await importPages([`${origin}/offer?campaign=a`, `${origin}/offer?campaign=b`, `${alternate}/offer`,
      `${origin}/`, `${origin}/second%20page`]);
    success(imported, 201);
    assert.equal(imported.json().imported, 2);
    assert.equal(imported.json().duplicates, 3);
    assert.deepEqual(imported.json().pages.map((page: {pathname: string}) => page.pathname), ['/offer', '/second%20page']);
    const concurrent = await Promise.all([importPages([`${origin}/race`]), importPages([`${origin}/race?x=1`])]);
    concurrent.forEach(response => success(response, 201));
    assert.equal(concurrent.reduce((count, response) => count + response.json().imported, 0), 1);
    assert.equal(concurrent.reduce((count, response) => count + response.json().duplicates, 0), 1);
    const repeat = await importPages([`${origin}/offer`]);
    success(repeat, 201);
    assert.equal(repeat.json().imported, 0);
    assert.equal(repeat.json().duplicates, 1);
    const distinct = await importPages([`${origin}/Case`, `${origin}/case`, `${origin}/encoded%2Fpath`, `${origin}/encoded/path`]);
    success(distinct, 201);
    assert.equal(distinct.json().imported, 4, 'case and percent-encoded path segments retain Page identity');
    for (const foreign of ['https://foreign.example.com/page', `${origin}:9443/page`, `https://user@${new URL(origin).host}/page`,
      'file:///etc/passwd', `${origin}/back\\slash`]) {
      error(await importPages([`${origin}/atomic`, foreign]), 400, 'SITEMAP_PAGE_NOT_ALLOWED');
    }
    assert.equal((await pool.query('SELECT id FROM pages WHERE project_id=$1 AND pathname=$2', [projectId, '/atomic'])).rowCount, 0);

    // Removing an origin invalidates its proof generation, pending connection probe,
    // and public deployment access; re-adding it never restores the old evidence.
    const challenge = await request('POST', `${originsUrl}/challenge`, owner.cookie, {origin: alternate});
    success(challenge, 201);
    const proof = challenge.json();
    const probe = await request('POST', `/api/admin/pages/${rootPage.id}/connection/probes`, owner.cookie, {origin: alternate});
    success(probe, 201);
    await pool.query("UPDATE project_origins SET verified_at=NOW(),verification_method='dns-txt' WHERE project_id=$1", [projectId]);
    const draft = await request('POST', `/api/admin/pages/${rootPage.id}/drafts`, owner.cookie, {});
    success(draft, 201);
    const draftId = draft.json().draft.id;
    success(await request('POST', `/api/admin/drafts/${draftId}/operations`, owner.cookie, {
      expectedRevision: 0, idempotencyKey: `onboarding-save-${suffix}`,
      sourceSnapshot: {algorithm: 'lykar-dom-v1', pageHash: 'a'.repeat(64), capturedAt: new Date().toISOString()},
      operations: [{schemaVersion: 1, id: `onboarding-op-${suffix}`, kind: 'setText', target: {marker: 'hero'}, value: 'Onboarding'}],
    }), 200);
    const published = await request('POST', `/api/admin/drafts/${draftId}/publish`, owner.cookie, {expectedRevision: 1});
    success(published, 201);
    success(await request('POST', `/api/admin/pages/${rootPage.id}/deployment/deploy`, owner.cookie, {
      releaseId: published.json().release.id, expectedRevision: 0, idempotencyKey: `onboarding-deploy-${suffix}`, reason: 'Onboarding deployment',
    }), 200);
    const runtime = (value: string) => app.inject({method: 'GET', url: `/api/runtime/projects/${publicKey}/deployment?pathname=%2F`, headers: {origin: value}});
    success(await runtime(alternate), 200);
    success(await remove(alternate, other.cookie), 204);
    const removed = await runtime(alternate);
    success(removed, 204);
    assert.equal(removed.headers['access-control-allow-origin'], undefined);
    success(await runtime(origin), 200);
    assert.equal((await pool.query('SELECT id FROM origin_verification_challenges WHERE id=$1', [proof.id])).rowCount, 0);
    assert.equal((await pool.query('SELECT id FROM site_connection_probes WHERE id=$1', [probe.json().id])).rowCount, 0);
    error(await request('POST', importUrl, owner.cookie, {urls: [`${origin}/atomic`, `${alternate}/offer`]}), 400, 'SITEMAP_PAGE_NOT_ALLOWED');
    assert.equal((await pool.query('SELECT id FROM pages WHERE project_id=$1 AND pathname=$2', [projectId, '/atomic'])).rowCount, 0);
    const readded = await add(alternate);
    success(readded, 201);
    assert.notEqual(readded.json().origin.id, alternateId);
    assert.equal(readded.json().origin.verifiedAt, null);
    success(await runtime(alternate), 204);
    error(await request('POST', `${originsUrl}/verify`, owner.cookie,
      {origin: alternate, challengeId: proof.id, token: proof.token}), 409, 'VERIFICATION_CHALLENGE_INVALID');

    // Concurrent removals serialize at the project, retaining one usable origin.
    const removals = await Promise.all([remove(origin), remove(alternate)]);
    assert.deepEqual(removals.map(response => response.statusCode).sort(), [204, 409]);
    assert.equal((await request('GET', originsUrl, owner.cookie)).json().origins.length, 1);
    await pool.query('UPDATE project_memberships SET revoked_at=NOW() WHERE id=$1', [membershipId]);
    error(await importPages([`${origin}/revoked`], other.cookie), 403, 'FORBIDDEN');
  } finally {
    await app.close();
    await pool.end();
  }
});
