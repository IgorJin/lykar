import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { MemoryEmailStore } from './memory-store';
import type { EmailBudget } from './store';

const start = Date.parse('2026-01-01T00:00:00Z');
const at = (offset: number) => new Date(start + offset);
function budget(key: string, now = 0, limit = 1, cooldownMs?: number): EmailBudget {
  return { key, limit, since: at(now - 1000), expiresAt: at(now + 5000), slidingWindowMs: 1000, cooldownMs };
}

test('memory email budgets reserve all constraints atomically across concurrent callers', async () => {
  const store = new MemoryEmailStore();
  const key = randomUUID();
  const parallel = await Promise.all(Array.from({ length: 30 }, () => store.reserve([budget(key, 0, 4)], at(0))));
  assert.equal(parallel.filter(result => result.allowed).length, 4);
  assert.ok(parallel.filter(result => !result.allowed).every(result => result.retryAt.getTime() === start + 1000));
  assert.equal((await store.reserve([budget(key), budget('unused')], at(0))).allowed, false);
  assert.equal((await store.reserve([budget('unused')], at(0))).allowed, true);
  assert.equal((await store.reserve([budget(key, 1000, 4)], at(1000))).allowed, true, 'strict rolling boundary');
});

test('memory cooldown, expiry, zero limits and nth-release retry times match rolling semantics', async () => {
  const store = new MemoryEmailStore();
  await store.reserve([budget('cooldown', 0, 10, 1500)], at(0));
  const denied = await store.reserve([budget('cooldown', 1000, 10, 1500)], at(1000));
  assert.equal(denied.allowed, false, 'cooldown survives the rolling window boundary');
  assert.equal(denied.retryAt.getTime(), start + 1500);
  assert.equal((await store.reserve([budget('cooldown', 1500, 10, 1500)], at(1500))).allowed, true);
  for (const offset of [0, 100, 200]) await store.reserve([budget('lowered', offset, 3)], at(offset));
  assert.equal((await store.reserve([budget('lowered', 300, 1)], at(300))).retryAt.getTime(), start + 1200);
  const zero = await store.reserve([budget('zero', 0, 0), budget('zero-unused')], at(0));
  assert.equal(zero.allowed, false);
  assert.equal(zero.retryAt.getTime(), start + 5000);
  assert.equal((await store.reserve([budget('zero-unused')], at(0))).allowed, true);
  await store.reserve([{ ...budget('expires'), expiresAt: at(100) }], at(0));
  assert.equal((await store.reserve([budget('expires', 50)], at(50))).retryAt.getTime(), start + 100);
  assert.equal((await store.reserve([budget('expires', 100)], at(100))).allowed, true, 'expiry is exclusive');
  const fixed: EmailBudget = { key: 'fixed-period', limit: 1, since: at(-1), expiresAt: at(5000) };
  assert.equal((await store.reserve([fixed], at(0))).allowed, true);
  for (const offset of [1, 1000, 4999]) {
    const exhausted = await store.reserve([fixed], at(offset));
    assert.equal(exhausted.allowed, false);
    assert.equal(exhausted.retryAt.getTime(), start + 5000, 'fixed quota releases at expiry, independently of since');
  }
  for (const slidingWindowMs of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(store.reserve([{ ...budget('invalid-window'), slidingWindowMs }], at(0)), /Invalid email budget/);
  }
});

test('memory delivery ledger allows one attempt, retains reservations for every outcome and is immutable after finish', async () => {
  const store = new MemoryEmailStore();
  for (const status of ['accepted', 'rejected', 'unknown'] as const) {
    const id = randomUUID(), key = randomUUID();
    const input = { id, kind: 'login' as const, providerId: 'resend', budgets: [budget(key)], now: at(0) };
    const results = await Promise.all(Array.from({ length: 20 }, () => store.beginDelivery(input)));
    assert.equal(results.filter(result => result.state === 'reserved').length, 1);
    assert.equal(results.filter(result => result.state === 'existing').length, 19);
    await store.finishDelivery(id, status, status === 'accepted' ? 'message-id' : null, status === 'accepted' ? null : 'PROVIDER_UNKNOWN');
    await store.finishDelivery(id, 'accepted', 'replacement', null);
    const existing = await store.beginDelivery(input);
    assert.equal(existing.state, 'existing');
    if (existing.state === 'existing') {
      assert.equal(existing.delivery.status, status);
      existing.delivery.status = 'pending';
    }
    const again = await store.beginDelivery(input);
    assert.equal(again.state === 'existing' && again.delivery.status, status, 'returned records cannot mutate the ledger');
    assert.equal((await store.reserve([budget(key)], at(0))).allowed, false, 'no refunds');
  }
  const limited = { id: randomUUID(), kind: 'invitation' as const, providerId: null, budgets: [budget('disabled', 0, 0)], now: at(0) };
  assert.equal((await store.beginDelivery(limited)).state, 'limited');
  assert.equal((await store.beginDelivery({ ...limited, budgets: [] })).state, 'reserved', 'limited attempt leaves no ledger');
  await assert.rejects(store.reserve([budget('person@example.com')], at(0)), /Invalid email budget/);
  await assert.rejects(store.finishDelivery(limited.id, 'accepted', 'https://secret.example/token', null), /Invalid email delivery outcome/);
});
