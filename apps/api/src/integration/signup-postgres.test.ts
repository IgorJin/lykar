import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { buildApp } from '../app';
import { hashToken } from '../domain/auth';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
const skip = databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured';

test('customer signup confirms email, isolates projects and preserves invitation identity under races', { skip }, async () => {
  const suffix = randomUUID();
  const a = `a-${suffix}@example.com`, b = `b-${suffix}@example.com`, c = `c-${suffix}@example.com`;
  const links = new Map<string, string[]>(), invites = new Map<string, string>();
  const app = buildApp({ emailLimits: false, logger: false, connectionString: databaseUrl,
    magicLinkSender: { async send(input) { links.set(input.email, [...(links.get(input.email) ?? []), input.url]); } },
    invitationSender: { async send(input) { invites.set(input.email, input.url); } },
  });
  const pool = new Pool({ connectionString: databaseUrl });
  const request = async (email: string) => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/magic-link', payload: { email } });
    assert.equal(response.statusCode, 202, response.body);
    assert.deepEqual(response.json(), { accepted: true });
    assert.equal(response.headers['set-cookie'], undefined);
    return response;
  };
  const verify = (url: string) => app.inject({ method: 'GET', url: new URL(url).pathname + new URL(url).search });
  const cookie = (response: { headers: Record<string, unknown> }) => String(response.headers['set-cookie']).split(';')[0];
  const session = async (value: string) => {
    const result = await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: value } });
    assert.equal(result.statusCode, 200, result.body);
    return result.json().user;
  };
  try {
    await request(` ${a.toUpperCase()} `);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1', [a])).rowCount, 0, 'request must not create unverified account');
    const firstLink = links.get(a)![0];
    const challenge = await pool.query('SELECT user_id, email, token_hash FROM login_tokens WHERE email=$1', [a]);
    assert.equal(challenge.rows[0].user_id, null);
    assert.equal(challenge.rows[0].token_hash.trim(), hashToken(new URL(firstLink).searchParams.get('token')!));
    const attempts = await Promise.all([verify(firstLink), verify(firstLink)]);
    assert.deepEqual(attempts.map(r => r.statusCode).sort(), [302, 401]);
    const aCookie = cookie(attempts.find(r => r.statusCode === 302)!);
    const aUser = await session(aCookie);
    assert.equal(aUser.email, a);
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/projects', headers: { cookie: aCookie } })).json().projects.length, 0);

    // Two concurrent requests/confirmations create a single independent account.
    await Promise.all([request(b), request(b.toUpperCase())]);
    const bLogins = await Promise.all(links.get(b)!.map(verify));
    assert.ok(bLogins.every(r => r.statusCode === 302));
    const bCookie = cookie(bLogins[0]), bUser = await session(bCookie);
    assert.equal((await session(cookie(bLogins[1]))).id, bUser.id);
    assert.notEqual(aUser.id, bUser.id);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1', [b])).rowCount, 1);
    const project = async (name: string, auth: string) => {
      const response = await app.inject({ method: 'POST', url: '/api/admin/projects', headers: { cookie: auth },
        payload: { name, origins: [`https://${name}-${suffix}.example.com`] } });
      assert.equal(response.statusCode, 201, response.body);
      return response.json().project;
    };
    const pa = await project('alpha', aCookie), pb = await project('beta', bCookie);
    for (const [auth, own, other] of [[aCookie, pa, pb], [bCookie, pb, pa]] as const) {
      const listed = await app.inject({ method: 'GET', url: '/api/admin/projects', headers: { cookie: auth } });
      assert.deepEqual(listed.json().projects.map((p: { id: string }) => p.id), [own.id]);
      const ownMembers = await app.inject({ method: 'GET', url: `/api/admin/projects/${own.id}/members`, headers: { cookie: auth } });
      assert.equal(ownMembers.json().actorRole, 'owner');
      for (const path of ['pages', 'members']) {
        assert.equal((await app.inject({ method: 'GET', url: `/api/admin/projects/${other.id}/${path}`, headers: { cookie: auth } })).statusCode, 403);
      }
      assert.equal((await app.inject({ method: 'POST', url: `/api/admin/projects/${other.id}/pages`, headers: { cookie: auth }, payload: { name: 'Intrusion', pathname: '/intrusion' } })).statusCode, 403);
      const pages = await app.inject({ method: 'GET', url: `/api/admin/projects/${own.id}/pages`, headers: { cookie: auth } });
      const ownPage = pages.json().pages[0];
      const otherAuth = auth === aCookie ? bCookie : aCookie;
      for (const path of ['drafts', 'releases', 'deployment']) {
        assert.equal((await app.inject({ method: 'GET', url: `/api/admin/pages/${ownPage.id}/${path}`, headers: { cookie: otherAuth } })).statusCode, 403);
      }
      assert.equal((await app.inject({ method: 'POST', url: `/api/admin/pages/${ownPage.id}/drafts`, headers: { cookie: otherAuth }, payload: {} })).statusCode, 403);
    }
    // Invitation to B cannot be changed by B or silently grant A ownership in B's project.
    const invite = await app.inject({ method: 'POST', url: `/api/admin/projects/${pa.id}/invitations`, headers: { cookie: aCookie }, payload: { email: b, role: 'viewer' } });
    assert.equal(invite.statusCode, 201, invite.body);
    assert.equal((await app.inject({ method: 'POST', url: `/api/admin/invitations/${invite.json().invitation.id}/resend`, headers: { cookie: bCookie }, payload: {} })).statusCode, 403);
    const accepts = await Promise.all([
      app.inject({ method: 'GET', url: invites.get(b)!, headers: { cookie: aCookie } }),
      verify(invites.get(b)!),
    ]);
    assert.deepEqual(accepts.map(r => r.statusCode).sort(), [302, 401]);
    assert.equal((await session(cookie(accepts.find(r => r.statusCode === 302)!))).id, bUser.id);
    const bAccess = await app.inject({ method: 'GET', url: `/api/admin/projects/${pa.id}/members`, headers: { cookie: bCookie } });
    assert.equal(bAccess.json().actorRole, 'viewer');
    assert.equal((await app.inject({ method: 'POST', url: `/api/admin/projects/${pa.id}/pages`, headers: { cookie: bCookie }, payload: { name: 'No write', pathname: '/no' } })).statusCode, 403);
    // Signup and invitation confirmation race on the same new email and converge on one user.
    await request(c);
    assert.equal((await app.inject({ method: 'POST', url: `/api/admin/projects/${pa.id}/invitations`, headers: { cookie: aCookie }, payload: { email: c, role: 'editor' } })).statusCode, 201);
    const mixed = await Promise.all([verify(links.get(c)![0]), verify(invites.get(c)!)]);
    assert.ok(mixed.every(r => r.statusCode === 302));
    const identities = await Promise.all(mixed.map(r => session(cookie(r))));
    assert.equal(identities[0].id, identities[1].id);
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1', [c])).rowCount, 1);
    assert.equal((await pool.query('SELECT 1 FROM project_memberships WHERE project_id=$1 AND user_id=$2', [pa.id, identities[0].id])).rowCount, 1);
    // Re-registration returns the same account with the same owned project.
    await request(a);
    const repeated = await verify(links.get(a)![links.get(a)!.length - 1]);
    assert.equal((await session(cookie(repeated))).id, aUser.id);
    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookie(repeated) } });
    assert.equal(logout.statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: cookie(repeated) } })).statusCode, 401);
    // Expiry denies both browser and API access, and resend issues a usable new challenge.
    const expiredEmail = `expired-${suffix}@example.com`;
    await request(expiredEmail);
    await pool.query("UPDATE login_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE email=$1", [expiredEmail]);
    const expired = await verify(links.get(expiredEmail)![0]);
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.headers['set-cookie'], undefined);
    const expiredBrowser = await app.inject({ method: 'GET', url: links.get(expiredEmail)![0], headers: { accept: 'text/html' } });
    assert.equal(expiredBrowser.headers.location, '/admin/?authError=invalid-link');
    assert.equal(expiredBrowser.headers['referrer-policy'], 'no-referrer');
    assert.equal((await pool.query('SELECT 1 FROM users WHERE email=$1', [expiredEmail])).rowCount, 0);
    await request(expiredEmail);
    assert.equal((await verify(links.get(expiredEmail)![links.get(expiredEmail)!.length - 1])).statusCode, 302);
  } finally { await app.close(); await pool.end(); }
});
