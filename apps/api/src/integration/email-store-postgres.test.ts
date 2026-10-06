import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import type { EmailBudget } from '../email/store';
import { PostgresEmailStore } from '../repositories/postgres-email-store';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
const skip = databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured';
const start = Date.parse('2026-01-01T00:00:00Z');
const at = (offset: number) => new Date(start + offset);
function budget(key: string, now = 0, limit = 1, cooldownMs?: number): EmailBudget {
  return { key, limit, since: at(now - 1000), expiresAt: at(now + 5000), slidingWindowMs: 1000, cooldownMs };
}

test('PostgreSQL email store serializes quotas and deliveries across pools and restarts', { skip }, async () => {
  const schema = `email_${randomUUID().replace(/-/g, '')}`;
  const admin = new Pool({ connectionString: databaseUrl });
  let poolA: Pool | undefined, poolB: Pool | undefined;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  try {
    const options = { connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 8 };
    poolA = new Pool(options);
    poolB = new Pool(options);
    await poolA.query(await readFile(path.resolve(__dirname, '../../migrations/012_email_delivery.sql'), 'utf8'));
    const a = new PostgresEmailStore(poolA), b = new PostgresEmailStore(poolB);
    const key = `test:${randomUUID()}`;
    const outcomes = await Promise.all(Array.from({ length: 48 }, (_, index) =>
      (index % 2 ? a : b).reserve([budget(key, 0, 5)], at(0))));
    assert.equal(outcomes.filter(result => result.allowed).length, 5);
    assert.ok(outcomes.filter(result => !result.allowed).every(result => result.retryAt.getTime() === start + 1000));
    assert.equal((await poolA.query('SELECT 1 FROM email_budget_reservations WHERE bucket_key=$1', [key])).rowCount, 5);
    await poolB.end();
    poolB = new Pool(options);
    const restarted = new PostgresEmailStore(poolB);
    assert.equal((await restarted.reserve([budget(key, 500, 5)], at(500))).allowed, false, 'durable quota survives pool restart');

    const unused = `test:${randomUUID()}`;
    assert.equal((await a.reserve([budget(unused), budget(key)], at(0))).allowed, false);
    assert.equal((await poolA.query('SELECT 1 FROM email_budget_reservations WHERE bucket_key=$1', [unused])).rowCount, 0);
    assert.equal((await restarted.reserve([budget(unused)], at(0))).allowed, true, 'all budgets or none');
    assert.equal((await a.reserve([budget(key, 1000, 5)], at(1000))).allowed, true, 'strict rolling boundary');
    const opposing = [`test:${randomUUID()}`, `test:${randomUUID()}`];
    const opposingResults = await Promise.all([
      a.reserve(opposing.map(value => budget(value)), at(0)),
      restarted.reserve([...opposing].reverse().map(value => budget(value)), at(0)),
    ]);
    assert.equal(opposingResults.filter(result => result.allowed).length, 1, 'opposite bucket order cannot deadlock or partially reserve');

    const cooldown = `test:${randomUUID()}`;
    assert.equal((await a.reserve([budget(cooldown, 0, 10, 1500)], at(0))).allowed, true);
    const cooling = await restarted.reserve([budget(cooldown, 1000, 10, 1500)], at(1000));
    assert.equal(cooling.allowed, false);
    assert.equal(cooling.retryAt.getTime(), start + 1500);
    assert.equal((await a.reserve([budget(cooldown, 1500, 10, 1500)], at(1500))).allowed, true);
    const lowered = `test:${randomUUID()}`;
    for (const offset of [0, 100, 200]) await a.reserve([budget(lowered, offset, 3)], at(offset));
    assert.equal((await restarted.reserve([budget(lowered, 300, 1)], at(300))).retryAt.getTime(), start + 1200);
    const expiry = `test:${randomUUID()}`;
    await a.reserve([{ ...budget(expiry), expiresAt: at(100) }], at(0));
    assert.equal((await a.reserve([budget(expiry, 50)], at(50))).retryAt.getTime(), start + 100);
    assert.equal((await restarted.reserve([budget(expiry, 100)], at(100))).allowed, true);
    const zero = await a.reserve([budget(`test:${randomUUID()}`, 0, 0)], at(0));
    assert.equal(zero.allowed, false);
    assert.equal(zero.retryAt.getTime(), start + 5000);
    const fixed: EmailBudget = { key: `test:${randomUUID()}`, limit: 1, since: at(-1), expiresAt: at(5000) };
    assert.equal((await a.reserve([fixed], at(0))).allowed, true);
    for (const offset of [1, 1000, 4999]) {
      const exhausted = await restarted.reserve([fixed], at(offset));
      assert.equal(exhausted.allowed, false);
      assert.equal(exhausted.retryAt.getTime(), start + 5000, 'fixed quota releases at expiry, independently of since');
    }
    for (const slidingWindowMs of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(a.reserve([{ ...budget(`test:${randomUUID()}`), slidingWindowMs }], at(0)), /Invalid email budget/);
    }

    for (const status of ['accepted', 'rejected', 'unknown'] as const) {
      const id = randomUUID(), deliveryKey = `test:${randomUUID()}`;
      const input = { id, kind: 'invitation' as const, providerId: 'resend', budgets: [budget(deliveryKey, 0, 100)], now: at(0) };
      const attempts = await Promise.all(Array.from({ length: 32 }, (_, index) => (index % 2 ? a : restarted).beginDelivery(input)));
      assert.equal(attempts.filter(result => result.state === 'reserved').length, 1);
      assert.equal(attempts.filter(result => result.state === 'existing').length, 31);
      assert.equal((await poolA.query('SELECT 1 FROM email_budget_reservations WHERE bucket_key=$1', [deliveryKey])).rowCount, 1);
      const freshBucket = `test:${randomUUID()}`;
      assert.equal((await restarted.beginDelivery({ ...input, budgets: [budget(freshBucket)] })).state, 'existing');
      assert.equal((await poolA.query('SELECT 1 FROM email_budget_reservations WHERE bucket_key=$1', [freshBucket])).rowCount, 0, 'existing ids reserve no new budgets');
      await a.finishDelivery(id, status, status === 'accepted' ? 'message-id' : null, status === 'accepted' ? null : 'PROVIDER_UNKNOWN');
      await restarted.finishDelivery(id, 'accepted', 'replacement', null);
      const existing = await restarted.beginDelivery(input);
      assert.equal(existing.state === 'existing' && existing.delivery.status, status);
      const row = (await poolA.query('SELECT * FROM email_deliveries WHERE id=$1', [id])).rows[0];
      assert.ok(row.created_at instanceof Date && row.updated_at instanceof Date && row.finished_at instanceof Date);
      assert.equal((await restarted.reserve([budget(deliveryKey)], at(0))).allowed, false, 'accepted, rejected and unknown consume quota');
    }
    const limited = { id: randomUUID(), kind: 'login' as const, providerId: null, budgets: [budget(`test:${randomUUID()}`, 0, 0)], now: at(0) };
    assert.equal((await a.beginDelivery(limited)).state, 'limited');
    assert.equal((await poolA.query('SELECT 1 FROM email_deliveries WHERE id=$1', [limited.id])).rowCount, 0);
    assert.equal((await restarted.beginDelivery({ ...limited, budgets: [] })).state, 'reserved');

    const columns = await poolA.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=\'email_deliveries\' ORDER BY ordinal_position', [schema]);
    assert.deepEqual(columns.rows.map(row => row.column_name), ['id', 'kind', 'provider_id', 'status', 'provider_message_id', 'safe_code', 'created_at', 'updated_at', 'finished_at']);
    await assert.rejects(a.reserve([budget('person@example.com')], at(0)), /Invalid email budget/);
    await assert.rejects(a.finishDelivery(limited.id, 'accepted', 'https://secret.example/token', null), /Invalid email delivery outcome/);
    await assert.rejects(poolA.query('INSERT INTO email_budget_reservations (bucket_key,reserved_at,expires_at) VALUES ($1,$2,$3)', ['person@example.com', at(0), at(100)]), error => (error as { code?: string }).code === '23514');
    await assert.rejects(poolA.query('UPDATE email_deliveries SET provider_message_id=$2 WHERE id=$1', [limited.id, 'person@example.com']), error => (error as { code?: string }).code === '23514');
  } finally {
    await poolA?.end();
    await poolB?.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
