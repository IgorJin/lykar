import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { EmailDeliveryService, EmailDeliveryError, periodWindow, type BudgetedEmailProvider } from './delivery';
import { EmailPolicy, EmailRateLimitError } from './policy';
import { MemoryEmailStore } from './memory-store';
import { ProviderSendError } from './providers';
import { emailRuntimeFromEnvironment } from './config';

const start = Date.parse('2026-10-05T12:00:00Z');
const link = () => ({ deliveryId: randomUUID(), email: 'test@example.com', url: 'https://lykar.example/api/auth/verify?token=secret', expiresAt: '2026-10-05T12:15:00Z' });
const budget = (id: string, send: BudgetedEmailProvider['provider']['send'], dailyLimit = 2, periodLimit = 3): BudgetedEmailProvider => ({
  provider: { id, send }, dailyLimit, periodLimit, period: { kind: 'calendar-month', anchor: '2026-10-01T00:00:00Z' },
});

test('request policy: 3/hour, 60s cooldown, separate invitation budget and actor cap', async () => {
  let now = start;
  const policy = new EmailPolicy(new MemoryEmailStore(), 'development-secret-at-least-32-characters', {}, () => new Date(now));
  await policy.check('login', 'test@example.com', 'ip');
  await assert.rejects(policy.check('login', 'test@example.com', 'different-ip'), (e: unknown) => e instanceof EmailRateLimitError && e.retryAfterSeconds === 60);
  await policy.check('invitation', 'test@example.com', 'owner');
  now += 60000; await policy.check('login', 'test@example.com', 'ip');
  now += 60000; await policy.check('login', 'test@example.com', 'ip');
  now += 60000; await assert.rejects(policy.check('login', 'test@example.com', 'ip'), EmailRateLimitError);
  now = start + 3600000; await policy.check('login', 'test@example.com', 'ip');
  for (let i = 0; i < 30; i++) await policy.check('login', `other${i}@example.com`, 'burst-ip');
  await assert.rejects(policy.check('login', 'last@example.com', 'burst-ip'), EmailRateLimitError);
  await policy.check('login', 'last@example.com', 'another-ip');
});

test('provider quotas shared by login/invitation; reserve capacity; fixed billing reset and rolling daily limit', async () => {
  let now = start; const sends: string[] = [];
  const service = new EmailDeliveryService(new MemoryEmailStore(), [
    { ...budget('primary', async () => { sends.push('primary'); return { providerMessageId: randomUUID() }; }, 3, 4), reservedDaily: 1, reservedPeriod: 1 },
    budget('backup', async () => { sends.push('backup'); return { providerMessageId: randomUUID() }; }, 1, 1),
  ], () => new Date(now));
  await service.send(link());
  await service.send({ ...link(), projectName: 'Project', role: 'viewer' });
  await service.send(link());
  assert.deepEqual(sends, ['primary', 'primary', 'backup']);
  await assert.rejects(service.send(link()), EmailDeliveryError);
  now += 86400000; await service.send(link());
  await assert.rejects(service.send(link()), EmailDeliveryError);
  now = Date.parse('2026-11-01T00:00:00Z'); await service.send(link());
});

test('one delivery id cannot send twice, including concurrent calls and a process restart', async () => {
  const store = new MemoryEmailStore(); let sends = 0;
  const providers = [budget('primary', async () => { sends++; await Promise.resolve(); return { providerMessageId: randomUUID() }; }, 10, 10)];
  const first = new EmailDeliveryService(store, providers, () => new Date(start));
  const second = new EmailDeliveryService(store, providers, () => new Date(start));
  const message = link();
  await Promise.allSettled([first.send(message), second.send(message)]);
  await second.send(message);
  assert.equal(sends, 1);
});

test('timeout/rejection do not trigger fallback and attempts remain counted', async () => {
  for (const outcome of ['unknown', 'rejected'] as const) {
    let backups = 0, primary = 0;
    const store = new MemoryEmailStore();
    const service = new EmailDeliveryService(store, [
      budget('primary', async () => { primary++; throw new ProviderSendError(outcome, 'timeout'); }, 1, 1),
      budget('backup', async () => { backups++; return { providerMessageId: randomUUID() }; }),
    ], () => new Date(start));
    const message = link();
    await assert.rejects(service.send(message), EmailDeliveryError);
    assert.equal(backups, 0);
    await assert.rejects(service.send(message), EmailDeliveryError);
    assert.equal(primary, 1);
    assert.equal(backups, 0);
    // A NEW explicit request may use remaining provider capacity, not an automatic retry.
    await service.send(link());
    assert.equal(backups, 1);
  }
});

test('billing anchors clamp month ends and fixed 30-day cycles match boundaries', () => {
  const period = { kind: 'calendar-month' as const, anchor: '2026-01-31T06:00:00Z' };
  assert.deepEqual(periodWindow(period, new Date('2026-02-28T06:00:00Z')), { start: new Date('2026-02-28T06:00:00Z'), end: new Date('2026-03-31T06:00:00Z') });
  assert.equal(periodWindow(period, new Date('2026-02-28T05:59:59Z'))!.start.toISOString(), new Date(period.anchor).toISOString());
  assert.equal(periodWindow(period, new Date('2026-01-01')), null);
  assert.equal(periodWindow({ kind: 'days', days: 30, anchor: '2026-01-01T00:00:00Z' }, new Date('2026-01-31T00:00:00Z'))!.end.toISOString(), '2026-03-02T00:00:00.000Z');
});

test('keyless mode is explicit; production/malformed config fails closed without exposing keys', () => {
  assert.equal(emailRuntimeFromEnvironment({}).mode, 'disabled');
  assert.equal(emailRuntimeFromEnvironment({ LYKAR_MAGIC_LINK_FILE: '/tmp/example.ndjson' }).mode, 'file');
  for (const env of [{ NODE_ENV: 'production' }, { LYKAR_EMAIL_MODE: 'providers', LYKAR_EMAIL_PROVIDERS: 'secret-text' },
    { LYKAR_EMAIL_REQUEST_MAX: 'NaN' }, { LYKAR_EMAIL_REQUEST_WINDOW_SECONDS: '5' }]) {
    assert.throws(() => emailRuntimeFromEnvironment(env), (error: unknown) => error instanceof Error && !error.message.includes('secret-text'));
  }
  const config = { id: 'resend', type: 'resend', apiKeyEnv: 'RESEND_KEY', from: 'login@example.com', dailyLimit: 90, periodLimit: 2700,
    period: { kind: 'calendar-month', anchor: '2026-10-01T00:00:00Z' } };
  assert.throws(() => emailRuntimeFromEnvironment({ LYKAR_EMAIL_MODE: 'providers', LYKAR_EMAIL_PROVIDERS: JSON.stringify([config]) }), /missing provider credentials/);
  const configured = emailRuntimeFromEnvironment({ LYKAR_EMAIL_MODE: 'providers', LYKAR_EMAIL_PROVIDERS: JSON.stringify([config]), RESEND_KEY: 'test-only-placeholder' });
  assert.equal(configured.providers[0].provider.id, 'resend'); // construction performs no network access
});
