import assert from 'node:assert/strict';
import test from 'node:test';

import { createDnsTxtVerifier, normalizeVerifiableOrigin, type DnsTxtResolver } from './dns-verifier';
import { ValidationError } from './versioning';

test('origins normalize host case and ports while retaining custom HTTPS ports', () => {
  assert.deepEqual(normalizeVerifiableOrigin('HTTPS://Shop.Example.COM:443', false), {
    origin: 'https://shop.example.com', hostname: 'shop.example.com', local: false,
    recordName: '_lykar-verification.shop.example.com',
  });
  assert.equal(normalizeVerifiableOrigin('https://example.com:8443', false).origin, 'https://example.com:8443');
  assert.equal(normalizeVerifiableOrigin('https://example.com:08443', false).origin, 'https://example.com:8443');
});

test('unsafe origins fail without reflecting the submitted value', () => {
  const unsafe: unknown[] = [
    undefined, null, 123, {}, '', 'example.com', '//example.com', 'ftp://example.com', 'http://example.com',
    'https://example.com/', 'https://example.com/path', 'https://example.com/..', 'https://example.com?',
    'https://example.com#', 'https://example.com?key=secret', 'https://user:secret@example.com',
    'https://@example.com', 'https://*.example.com', ' https://example.com', 'https://example.com\n',
    'https://exam\tple.com', 'https://example.com\\path', 'https://example.com:0x50', 'https://example.com:65536',
    'https://example.com.', 'https://example..com', 'https://-example.com', 'https://example-.com',
    'https://example_com.com', 'https://%65xample.com', 'https://例子.com', 'https://com',
    'https://127.0.0.1', 'https://127.1', 'https://2130706433', 'https://0x7f000001',
    'https://0177.0.0.1', 'https://192.168.1.1', 'https://8.8.8.8', 'https://169.254.169.254',
    'https://[::1]', 'https://[2001:4860:4860::8888]', 'https://[::ffff:127.0.0.1]',
    'https://localhost', 'https://app.localhost', 'https://app.local', 'https://app.internal',
    'https://app.home', 'https://app.lan', 'https://app.test', 'https://metadata.google.internal',
    `https://${'a'.repeat(64)}.com`, `https://${Array(5).fill('a'.repeat(50)).join('.')}.com`,
  ];
  for (const value of unsafe) {
    assert.throws(() => normalizeVerifiableOrigin(value, false), error =>
      error instanceof ValidationError && error.message === 'Origin must be an HTTPS origin with a public DNS hostname', String(value));
  }
});

test('development permits only explicitly written loopback hosts', () => {
  for (const [input, origin, hostname] of [
    ['HTTP://LOCALHOST:80', 'http://localhost', 'localhost'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000', '127.0.0.1'],
    ['https://[::1]:443', 'https://[::1]', '::1'],
  ]) {
    assert.deepEqual(normalizeVerifiableOrigin(input, true), {
      origin, hostname, local: true, recordName: `_lykar-verification.${hostname}`,
    });
  }
  for (const value of ['http://example.com', 'http://127.1', 'http://127.0.0.2', 'http://2130706433',
    'http://0x7f000001', 'http://[0:0:0:0:0:0:0:1]', 'http://app.localhost', 'https://app.test']) {
    assert.throws(() => normalizeVerifiableOrigin(value, true), ValidationError);
  }
});

class FakeResolver implements DnsTxtResolver {
  names: string[] = [];
  cancelled = 0;
  constructor(private readonly respond: () => Promise<string[][]>) {}
  resolveTxt(name: string) {
    this.names.push(name);
    return this.respond();
  }
  cancel() { this.cancelled += 1; }
}

test('TXT chunks join within each record and compare exactly', async () => {
  const expected = 'lykar-verification=secret-token';
  for (const [records, result] of [
    [[['unrelated'], ['lykar-verification=', 'secret-token']], 'match'],
    [[['lykar-verification='], ['secret-token']], 'missing'],
    [[['lykar-verification=wrong-token']], 'missing'],
    [[[`${expected} `]], 'missing'],
    [[[expected.toUpperCase()]], 'missing'],
    [[], 'missing'],
  ] as const) {
    const resolver = new FakeResolver(async () => records.map(chunks => [...chunks]));
    assert.equal(await createDnsTxtVerifier(() => resolver)('example.com', expected), result);
    assert.deepEqual(resolver.names, ['_lykar-verification.example.com']);
    assert.equal(resolver.cancelled, 1);
  }
});

test('missing and unavailable DNS responses expose only a safe status and cancel the resolver', async () => {
  for (const code of ['ENODATA', 'ENOTFOUND', 'ETIMEOUT', 'ESERVFAIL', 'ECANCELLED', 'EAI_AGAIN']) {
    const resolver = new FakeResolver(async () => { throw Object.assign(new Error('secret DNS response'), {code}); });
    assert.equal(await createDnsTxtVerifier(() => resolver)('example.com', 'token'),
      ['ENODATA', 'ENOTFOUND'].includes(code) ? 'missing' : 'unavailable');
    assert.equal(resolver.cancelled, 1);
  }
  assert.equal(await createDnsTxtVerifier(() => { throw new Error('private configuration'); })('example.com', 'token'), 'unavailable');
});

test('an independent deadline completes even when the DNS resolver never settles', async () => {
  const resolver = new FakeResolver(() => new Promise(() => {}));
  assert.equal(await createDnsTxtVerifier(() => resolver, {deadlineMs: 10})('example.com', 'token'), 'unavailable');
  assert.equal(resolver.cancelled, 1);
});

test('each call gets a fresh resolver and cleanup failures cannot leak', async () => {
  const resolvers: FakeResolver[] = [];
  const verify = createDnsTxtVerifier(() => {
    const resolver = new FakeResolver(async () => [['token']]);
    resolvers.push(resolver);
    return resolver;
  });
  assert.deepEqual(await Promise.all([verify('example.com', 'token'), verify('www.example.com', 'token')]), ['match', 'match']);
  assert.equal(resolvers.length, 2);
  assert.notEqual(resolvers[0], resolvers[1]);
  assert.ok(resolvers.every(resolver => resolver.cancelled === 1));
  assert.equal(await createDnsTxtVerifier(() => ({resolveTxt: async () => [['token']], cancel() { throw new Error('secret'); }}))('example.com', 'token'), 'match');
});

test('oversized or malformed DNS data fail closed, even after a matching record', async () => {
  const oversized = [
    Array.from({length: 65}, () => ['token']),
    [['token'], Array(17).fill('a')],
    [['token'], ['a'.repeat(256)]],
    Array.from({length: 64}, () => Array(2).fill('a'.repeat(255))),
    [['token'], []],
    [['token'], [123]],
    null,
  ];
  for (const records of oversized) {
    const resolver = new FakeResolver(async () => records as string[][]);
    assert.equal(await createDnsTxtVerifier(() => resolver)('example.com', 'token'), 'unavailable');
    assert.equal(resolver.cancelled, 1);
  }
});

test('invalid DNS arguments never create a resolver or query attacker-selected names', async () => {
  let created = 0;
  const verify = createDnsTxtVerifier(() => { created += 1; return new FakeResolver(async () => []); });
  for (const hostname of ['localhost', '127.0.0.1', '2130706433', 'app.internal', 'Example.com',
    'example.com:8443', 'example.com/path', '_lykar-verification.example.com', 'example.com.']) {
    assert.equal(await verify(hostname, 'token'), 'unavailable');
  }
  for (const value of ['', 'a'.repeat(1025), '😀'.repeat(257)]) {
    assert.equal(await verify('example.com', value), 'unavailable');
  }
  assert.equal(created, 0);
  for (const deadlineMs of [0, -1, 3001, Infinity, NaN, 1.5]) {
    assert.throws(() => createDnsTxtVerifier(() => new FakeResolver(async () => []), {deadlineMs}), ValidationError);
  }
});
