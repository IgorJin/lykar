import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { buildApp } from '../app';
import { createResendProvider } from '../email/providers';

const connectionString = process.env.LYKAR_TEST_DATABASE_URL;
const skip = connectionString ? false : 'LYKAR_TEST_DATABASE_URL is not configured';

test('email API shares normalized recipient limits across instances and preserves invitation token on 429', { skip }, async () => {
  let now = Date.now();
  const suffix = randomUUID(), email = `email-${suffix}@example.com`;
  const links: string[] = [], invitations: string[] = [];
  const options = { connectionString, logger: false as const, emailNow: () => new Date(now),
    magicLinkSender: { async send(input: { url: string }) { links.push(input.url); } },
    invitationSender: { async send(input: { url: string }) { invitations.push(input.url); } } };
  const app = buildApp(options), second = buildApp(options);
  const pool = new Pool({ connectionString });
  const request = (instance: typeof app, address = email) => instance.inject({ method: 'POST', url: '/api/auth/magic-link',
    remoteAddress: '192.0.2.11', headers: { 'x-forwarded-for': randomUUID() }, payload: { email: address } });
  try {
    assert.equal((await request(app, ` ${email.toUpperCase()} `)).statusCode, 202);
    const blocked = await request(second);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers['retry-after'], '60');
    assert.equal(blocked.json().error.code, 'EMAIL_RATE_LIMITED');
    assert.equal((await pool.query('SELECT 1 FROM login_tokens WHERE email=$1', [email])).rowCount, 1);
    const login = await app.inject({ method: 'GET', url: links[0] });
    assert.equal(login.statusCode, 302);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    now += 60000; assert.equal((await request(second)).statusCode, 202);
    now += 60000; assert.equal((await request(app)).statusCode, 202);
    now += 60000; assert.equal((await request(second)).statusCode, 429);
    const project = await app.inject({ method: 'POST', url: '/api/admin/projects', headers: { cookie },
      payload: { name: 'Email policy', origins: [`https://email-${suffix}.example.com`] } });
    assert.equal(project.statusCode, 201, project.body);
    const target = `invite-${suffix}@example.com`;
    const invite = await app.inject({ method: 'POST', url: `/api/admin/projects/${project.json().project.id}/invitations`,
      headers: { cookie }, payload: { email: target, role: 'viewer' } });
    assert.equal(invite.statusCode, 201, invite.body);
    const resend = await second.inject({ method: 'POST', url: `/api/admin/invitations/${invite.json().invitation.id}/resend`, headers: { cookie }, payload: {} });
    assert.equal(resend.statusCode, 429, resend.body);
    assert.equal(invitations.length, 1);
    assert.equal((await app.inject({ method: 'GET', url: invitations[0] })).statusCode, 302, 'blocked resend must preserve original token');
  } finally { await app.close(); await second.close(); await pool.end(); }
});

test('email API persists provider acceptance and unknown outcome without leaking provider errors', { skip }, async () => {
  const suffix = randomUUID(), pool = new Pool({ connectionString });
  let calls = 0;
  const provider = createResendProvider({ id: `t-${suffix}`, apiKey: 'placeholder-only', from: 'login@example.com',
    fetcher: (async () => { calls++; if (calls === 1) return new Response(JSON.stringify({ id: randomUUID() }), { status: 200 });
      throw new Error('PRIVATE_TOKEN_AND_API_KEY'); }) as typeof fetch });
  const app = buildApp({ connectionString, logger: false, emailProviders: [{ provider, dailyLimit: 10, periodLimit: 10,
    period: { kind: 'calendar-month', anchor: '2026-01-01T00:00:00Z' } }] });
  try {
    const request = (prefix: string) => app.inject({ method: 'POST', url: '/api/auth/magic-link', remoteAddress: '192.0.2.12', payload: { email: `${prefix}-${suffix}@example.com` } });
    assert.equal((await request('ok')).statusCode, 202);
    const failed = await request('failed');
    assert.equal(failed.statusCode, 503, failed.body);
    assert.equal(failed.json().error.code, 'EMAIL_DELIVERY_UNKNOWN');
    assert.ok(failed.json().error.details.deliveryId);
    assert.ok(!failed.body.includes('PRIVATE_TOKEN'));
    const rows = await pool.query('SELECT status, safe_code FROM email_deliveries WHERE provider_id=$1 ORDER BY created_at', [provider.id]);
    assert.deepEqual(rows.rows.map(row => row.status), ['accepted', 'unknown']);
    assert.equal(rows.rows[1].safe_code, 'network_error');
    assert.equal(calls, 2);
  } finally { await app.close(); await pool.end(); }
});
