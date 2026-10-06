import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMailerSendProvider, createResendProvider, EmailMessage, EmailProvider, ProviderSendError,
} from './providers';

const message: EmailMessage = {
  to: 'private-recipient@example.test', subject: 'Вход',
  text: 'https://app.example.test/auth?token=private-token', html: '<p>private-token</p>',
};
const apiKey = 'private-api-key';
const resendId = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
const mailerSendId = '5e42957d51f1d94a1070a733';
const factories = [createResendProvider, createMailerSendProvider];

function provider(factory: typeof createResendProvider, fetcher: typeof fetch): EmailProvider {
  return factory({ id: 'test-provider', apiKey, from: 'sender@example.test', fetcher });
}

function assertSafe(error: unknown, outcome: 'unknown' | 'rejected', code: string): boolean {
  assert.ok(error instanceof ProviderSendError);
  assert.equal(error.outcome, outcome);
  assert.equal(error.safeCode, code);
  const serialized = `${String(error)} ${error.stack} ${JSON.stringify(error)}`;
  for (const secret of [apiKey, message.to, 'private-token', 'upstream-sensitive-body']) {
    assert.ok(!serialized.includes(secret), `error must not expose ${secret}`);
  }
  assert.equal('cause' in error, false);
  return true;
}

test('Resend sends text+HTML with delivery idempotency to the fixed endpoint', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal instanceof AbortSignal);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${apiKey}`);
    assert.equal(headers.get('idempotency-key'), 'login/abc-123');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(options?.body)), {
      from: 'sender@example.test', to: [message.to], subject: message.subject, text: message.text, html: message.html,
    });
    return Response.json({ id: resendId });
  };
  assert.deepEqual(await provider(createResendProvider, fetcher).send(message, 'login/abc-123'), { providerMessageId: resendId });
  assert.equal(calls, 1);
});

test('MailerSend uses its documented envelope and disables tracking without invented idempotency headers', async () => {
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, 'https://api.mailersend.com/v1/email');
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${apiKey}`);
    assert.equal(headers.get('idempotency-key'), null);
    assert.equal(headers.get('x-idempotency-key'), null);
    assert.deepEqual(JSON.parse(String(options?.body)), {
      from: { email: 'sender@example.test' }, to: [{ email: message.to }],
      subject: message.subject, text: message.text, html: message.html,
      settings: { track_clicks: false, track_opens: false, track_content: false },
    });
    return new Response('upstream-sensitive-body', { status: 202, headers: { 'x-message-id': mailerSendId } });
  };
  assert.deepEqual(await provider(createMailerSendProvider, fetcher).send(message, 'delivery-1'), { providerMessageId: mailerSendId });
});

test('explicit 4xx rejection retains only safe status and Retry-After metadata without reading body', async () => {
  for (const factory of factories) {
    for (const status of [400, 401, 403, 409, 422, 429]) {
      let bodyRead = false;
      const response = new Response(`upstream-sensitive-body ${apiKey} ${message.to}`, {
        status, headers: { 'retry-after': '60' },
      });
      response.json = async () => { bodyRead = true; throw new Error('must not read'); };
      const sending = provider(factory, async () => response).send(message, 'delivery-1');
      await assert.rejects(sending, error => {
        assertSafe(error, 'rejected', `http_${status}`);
        assert.equal((error as ProviderSendError).retryAfterSeconds, 60);
        return true;
      });
      assert.equal(bodyRead, false);
    }
  }
});

test('Retry-After HTTP dates are rounded safely and invalid metadata is discarded', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T12:00:00Z') });
  for (const [header, expected] of [
    ['Mon, 05 Oct 2026 12:00:30 GMT', 30], ['Mon, 05 Oct 2026 11:00:00 GMT', 0],
    ['upstream-sensitive-body', undefined], ['9007199254740992', undefined], ['-1', undefined],
  ] as const) {
    await assert.rejects(provider(createResendProvider, async () => new Response(null, {
      status: 429, headers: { 'retry-after': header },
    })).send(message, 'delivery-1'), error => {
      assertSafe(error, 'rejected', 'http_429');
      assert.equal((error as ProviderSendError).retryAfterSeconds, expected);
      return true;
    });
  }
});

test('network failures, HTTP timeout, server errors and redirects have unknown acceptance', async () => {
  for (const factory of factories) {
    await assert.rejects(provider(factory, async () => {
      throw new Error(`upstream-sensitive-body ${message.to} ${apiKey} private-token`);
    }).send(message, 'delivery-1'), error => assertSafe(error, 'unknown', 'network_error'));
    for (const status of [408, 500, 502, 503, 504, 302]) {
      await assert.rejects(provider(factory, async () => new Response('upstream-sensitive-body', { status }))
        .send(message, 'delivery-1'), error => assertSafe(error, 'unknown', status === 302 ? 'unexpected_status' : `http_${status}`));
    }
  }
});

test('successful responses without safe provider identifiers remain unknown', async () => {
  for (const body of [{}, null, { id: apiKey }, { id: message.to }, { id: 'private-token' }, { id: `${resendId}\nsecret` }]) {
    await assert.rejects(provider(createResendProvider, async () => Response.json(body))
      .send(message, 'delivery-1'), error => assertSafe(error, 'unknown', 'malformed_response'));
  }
  await assert.rejects(provider(createResendProvider, async () => new Response('upstream-sensitive-body'))
    .send(message, 'delivery-1'), error => assertSafe(error, 'unknown', 'malformed_response'));
  for (const id of [undefined, apiKey, message.to, 'private-token']) {
    await assert.rejects(provider(createMailerSendProvider, async () => new Response('upstream-sensitive-body', {
      status: 202, headers: id ? { 'x-message-id': id } : {},
    })).send(message, 'delivery-1'), error => assertSafe(error, 'unknown', 'malformed_response'));
  }
});

test('ten-second deadline aborts stalled fetchers even when they ignore the signal', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const factory of factories) {
    let signal: AbortSignal | null | undefined;
    const sending = provider(factory, async (_url, options) => {
      signal = options?.signal;
      return new Promise<Response>(() => undefined);
    }).send(message, 'delivery-1');
    const rejection = assert.rejects(sending, error => assertSafe(error, 'unknown', 'timeout'));
    context.mock.timers.tick(9999);
    assert.equal(signal?.aborted, false);
    context.mock.timers.tick(1);
    assert.equal(signal?.aborted, true);
    await rejection;
  }
});

test('the deadline includes stalled success body parsing', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const response = new Response(null);
  response.json = () => new Promise(() => undefined);
  const sending = provider(createResendProvider, async (_url, options) => {
    signal = options?.signal;
    return response;
  }).send(message, 'delivery-1');
  await Promise.resolve();
  const rejection = assert.rejects(sending, error => assertSafe(error, 'unknown', 'timeout'));
  context.mock.timers.tick(10000);
  assert.equal(signal?.aborted, true);
  await rejection;
});

test('invalid configuration and delivery headers fail safely before fetching', async () => {
  let fetched = false;
  const fetcher: typeof fetch = async () => { fetched = true; return Response.json({ id: resendId }); };
  for (const config of [
    { id: message.to, apiKey, from: 'sender@example.test' },
    { id: 'resend', apiKey: `${apiKey}\r\nInjected: value`, from: 'sender@example.test' },
    { id: 'resend', apiKey, from: 'sender@example.test\nInjected' },
  ]) {
    assert.throws(() => createResendProvider({ ...config, fetcher }), error => assertSafe(error, 'rejected', 'invalid_configuration'));
  }
  await assert.rejects(provider(createResendProvider, fetcher).send(message, 'token\nInjected'),
    error => assertSafe(error, 'rejected', 'invalid_delivery_id'));
  assert.equal(fetched, false);
});

test('ProviderSendError itself replaces unrecognized sensitive codes', () => {
  const error = new ProviderSendError('unknown', `${apiKey} ${message.to} private-token`, -1);
  assertSafe(error, 'unknown', 'provider_failure');
  assert.equal(error.retryAfterSeconds, undefined);
});
