import assert from 'node:assert/strict';
import test from 'node:test';

import { createSitemapPreview, isPublicSitemapAddress, normalizeSitemapPage, parseSitemapXml, SITEMAP_LIMITS, type SitemapAddress, type SitemapTransport } from './sitemap';
import { ValidationError, VersioningError } from './versioning';

const origin = 'https://shop.example.com';
const publicAddress: SitemapAddress = {address: '93.184.216.34', family: 4};
const xml = (...locations: string[]) => `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map(location => `<url><loc>${location}</loc></url>`).join('')}</urlset>`;

class Transport implements SitemapTransport {
  resolutions: string[] = [];
  requests: {url: string; address: SitemapAddress; signal: AbortSignal}[] = [];
  addresses: SitemapAddress[] = [publicAddress];
  statusCode = 200;
  headers: Record<string, string | string[] | undefined> = {};
  content: string | Uint8Array = xml(`${origin}/pricing`);
  body?: AsyncIterable<Uint8Array>;
  async resolve(hostname: string) { this.resolutions.push(hostname); return this.addresses; }
  async request(url: URL, address: SitemapAddress, signal: AbortSignal) {
    this.requests.push({url: url.href, address, signal});
    const content = this.content;
    return {statusCode: this.statusCode, headers: this.headers, body: this.body ?? (async function* () { yield typeof content === 'string' ? Buffer.from(content) : content; })()};
  }
}

test('preview pins the validated DNS address, deduplicates pathname and excludes foreign origins', async () => {
  const transport = new Transport();
  transport.addresses.push({address: '2606:4700:4700::1111', family: 6});
  transport.content = xml(`${origin}/pricing/?campaign=x&amp;test=1`, `${origin}/pricing#part`, `${origin}/a//b/`, `${origin}/a/b`, `${origin}/a%2Fb`, 'https://evil.example.com/pricing', 'https://shop.example.com.evil.com/x', `${origin}:8443/x`, 'javascript:alert(1)', `${origin}/`);
  assert.deepEqual(await createSitemapPreview(transport)(`${origin}/sitemap.xml`, [origin]), {
    pages: [{pathname: '/pricing', url: `${origin}/pricing`}, {pathname: '/a/b', url: `${origin}/a/b`}, {pathname: '/a%2Fb', url: `${origin}/a%2Fb`}, {pathname: '/', url: `${origin}/`}], duplicates: 2, excluded: 4,
  });
  assert.deepEqual(transport.resolutions, ['shop.example.com']);
  assert.deepEqual(transport.requests[0].address, publicAddress);
  assert.equal(transport.requests[0].signal.aborted, true);
});

test('page normalization preserves encoded routes and deduplicates across exact allowed origins', async () => {
  assert.deepEqual(normalizeSitemapPage(`${origin}/a%2fb///?x=1#part`, [origin]), {pathname: '/a%2fb', url: `${origin}/a%2fb`});
  assert.equal(normalizeSitemapPage(`${origin}/bad\\path`, [origin]), null);
  assert.equal(normalizeSitemapPage('https://user:secret@shop.example.com/a', [origin]), null);
  assert.equal(normalizeSitemapPage(`${origin}/x#\n`, [origin]), null);
  const transport = new Transport();
  transport.content = xml(`${origin}/same`, 'https://other.example.com/same?test=1', 'https://other.example.com/new');
  const result = await createSitemapPreview(transport)(`${origin}/sitemap.xml`, [origin, 'https://other.example.com']);
  assert.equal(result.duplicates, 1);
  assert.equal(result.pages.length, 2);
});

test('unsafe fetch URLs fail before DNS in every environment and never reflect credentials', async () => {
  const transport = new Transport();
  const preview = createSitemapPreview(transport);
  for (const value of ['http://shop.example.com/sitemap.xml', 'https://localhost/x', 'https://127.1/x', 'https://2130706433/x', 'https://[::1]/x', 'https://[::ffff:127.0.0.1]/x', 'https://user:secret@shop.example.com/x', 'https://@shop.example.com/x', 'https://%73hop.example.com/x', 'https://shop.example.com./x', `${origin}/x\\y`, `${origin}/x\n`, `${origin}/x#part`, 'https://foreign.example.com/x', 'https://metadata.google.internal/x']) {
    await assert.rejects(preview(value, [origin, 'http://localhost:3000', 'https://localhost']), error => error instanceof ValidationError && !error.message.includes('secret'), value);
  }
  assert.equal(transport.resolutions.length, 0);
  assert.equal(transport.requests.length, 0);
});

test('global address filter denies private, reserved, mapped and transition ranges', () => {
  for (const value of ['0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.254', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.0.9', '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.1.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:8.8.8.8', '64:ff9b::7f00:1', '2001:0::1', '2001:db8::1', '2002:7f00:1::', '3fff::1', '1.2.3', 'bad']) assert.equal(isPublicSitemapAddress(value), false, value);
  for (const value of ['8.8.8.8', '93.184.216.34', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicSitemapAddress(value), true, value);
});

test('one unsafe DNS answer blocks the request, including a later IPv6 answer', async () => {
  for (const addresses of [[], [publicAddress, {address: '127.0.0.1', family: 4}], [publicAddress, {address: '::ffff:7f00:1', family: 6}], [{address: '8.8.8.8', family: 6}], Array(SITEMAP_LIMITS.dnsAnswers + 1).fill(publicAddress)] as SitemapAddress[][]) {
    const transport = new Transport(); transport.addresses = addresses;
    await assert.rejects(createSitemapPreview(transport)(`${origin}/x`, [origin]), ValidationError);
    assert.equal(transport.requests.length, 0);
  }
});

test('redirects, non-success responses, compression and oversized declared lengths fail', async () => {
  for (const statusCode of [301, 302, 307, 308, 404, 500]) {
    const transport = new Transport(); transport.statusCode = statusCode; transport.headers.location = 'http://127.0.0.1/private';
    await assert.rejects(createSitemapPreview(transport)(`${origin}/x`, [origin]), ValidationError);
    assert.equal(transport.requests.length, 1);
  }
  for (const headers of [{'content-encoding': 'gzip'}, {'content-length': String(SITEMAP_LIMITS.bytes + 1)}, {'content-length': 'NaN'}, {'content-length': ['20']}]) {
    const transport = new Transport(); transport.headers = headers;
    await assert.rejects(createSitemapPreview(transport)(`${origin}/x`, [origin]), ValidationError);
  }
});

test('streamed body cap does not trust Content-Length and closes the stream on failure', async () => {
  const transport = new Transport(); transport.headers['content-length'] = '1';
  let closed = false;
  transport.body = (async function* () {
    try { yield Buffer.alloc(SITEMAP_LIMITS.bytes); yield Buffer.alloc(1); assert.fail('must not continue reading'); } finally { closed = true; }
  })();
  await assert.rejects(createSitemapPreview(transport)(`${origin}/x`, [origin]), ValidationError);
  assert.equal(closed, true);
  assert.equal(transport.requests[0].signal.aborted, true);
});

test('total deadline covers stalled DNS, headers and body and aborts the transport', async () => {
  for (const phase of ['dns', 'headers', 'body']) {
    const transport = new Transport();
    let signal: AbortSignal | undefined;
    const never = () => new Promise<never>(() => {});
    if (phase === 'dns') transport.resolve = async (_host, received?: AbortSignal) => { signal = received; return never(); };
    else if (phase === 'headers') transport.request = async (_url, _address, received) => { signal = received; return never(); };
    else transport.body = (async function* () { await never(); })();
    await assert.rejects(createSitemapPreview(transport, {deadlineMs: 10})(`${origin}/x`, [origin]), error => error instanceof VersioningError && error.code === 'SITEMAP_UNAVAILABLE');
    assert.equal((signal ?? transport.requests[0].signal).aborted, true);
  }
  assert.throws(() => createSitemapPreview(new Transport(), {deadlineMs: SITEMAP_LIMITS.deadlineMs + 1}), ValidationError);
});

test('network errors and malformed UTF-8 return safe errors', async () => {
  const transport = new Transport();
  transport.resolve = async () => { throw new Error('provider-secret'); };
  await assert.rejects(createSitemapPreview(transport)(`${origin}/x`, [origin]), error => error instanceof VersioningError && error.statusCode === 503 && !error.message.includes('provider-secret'));
  const malformed = new Transport(); malformed.content = Buffer.from([0xff]);
  await assert.rejects(createSitemapPreview(malformed)(`${origin}/x`, [origin]), ValidationError);
});

test('XML reader handles namespaces, CDATA, predefined and numeric references without loading extensions', () => {
  assert.deepEqual(parseSitemapXml(`<?xml version="1.0" encoding="UTF-8"?><sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:x="urn:extension"><!-- comment --><sm:url><sm:loc><![CDATA[${origin}/a?x=1&y=2]]></sm:loc><x:image><x:loc>https://ignored.example.com</x:loc></x:image></sm:url><sm:url><sm:loc>${origin}/&#x62;?q=&quot;x&quot;&amp;a=&#49;</sm:loc></sm:url></sm:urlset>`), [`${origin}/a?x=1&y=2`, `${origin}/b?q="x"&a=1`]);
  assert.deepEqual(parseSitemapXml('<urlset/>'), []);
});

test('XML reader fails closed for malformed XML, DTD, custom entities and sitemap indexes', () => {
  for (const value of ['', 'text', '<urlset>', '<urlset/><urlset/>', '<urlset></url>', '<urlset></urlset>junk', '<urlset><url/></urlset>', '<urlset><url><loc/></url></urlset>', '<urlset><url><loc>x</loc><loc>y</loc></url></urlset>', '<urlset><url><loc>x<inner/></loc></url></urlset>', '<!DOCTYPE urlset [<!ENTITY evil SYSTEM "file:///etc/passwd">]><urlset/>', '<urlset><url><loc>&evil;</loc></url></urlset>', '<urlset><url><loc>&amp</loc></url></urlset>', '<urlset><url><loc>&#0;</loc></url></urlset>', '<urlset><url><loc>&#xD800;</loc></url></urlset>', '<urlset><url><loc>&#x110000;</loc></url></urlset>', '<urlset><url><loc>]]></loc></url></urlset>', '<urlset a="x" a="y"/>', '<urlset a="bad &unknown;"/>', '<urlset a="<"/>', '<urlset a=x/>', '<urlset\u00a0a="x"/>', '<urlset xmlns="urn:wrong"/>', '<p:urlset/>', '<urlset xmlns:a="urn:x" xmlns:b="urn:x" a:k="1" b:k="2"/>', '<urlset xmlns:xml="urn:wrong"/>', '<urlset><!-- a--b --></urlset>', '<urlset><!-- a---></urlset>', '<urlset><![CDATA[unfinished</urlset>', '<urlset/>\u0001', '<?xml version="1.0" encoding="ISO-8859-1"?><urlset/>', '<?XML version="1.0"?><urlset/>', '<?other action?><urlset/>', '<sitemapindex><sitemap><loc>https://example.com/child.xml</loc></sitemap></sitemapindex>']) assert.throws(() => parseSitemapXml(value), ValidationError, value);
});

test('XML reader enforces entry, byte and nesting caps without returning a partial preview', () => {
  assert.throws(() => parseSitemapXml(xml(...Array(SITEMAP_LIMITS.entries + 1).fill(`${origin}/x`))), ValidationError);
  assert.throws(() => parseSitemapXml(`<urlset>${' '.repeat(SITEMAP_LIMITS.bytes)}</urlset>`), ValidationError);
  assert.throws(() => parseSitemapXml(`<urlset xmlns:x="urn:x">${'<x:n>'.repeat(SITEMAP_LIMITS.depth)}${'</x:n>'.repeat(SITEMAP_LIMITS.depth)}</urlset>`), ValidationError);
});
