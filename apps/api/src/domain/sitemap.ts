import { Resolver } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

import { normalizeVerifiableOrigin } from './dns-verifier';
import { normalizePathname, normalizeProjectOrigin, ValidationError, VersioningError } from './versioning';

// Server resource safety caps, not customer quotas or a performance SLA.
export const SITEMAP_LIMITS = Object.freeze({bytes: 2 * 1024 * 1024, entries: 10_000, deadlineMs: 5000, depth: 32, elements: 100_000, dnsAnswers: 64});
export type SitemapPage = {pathname: string; url: string};
export type SitemapPreview = {pages: SitemapPage[]; duplicates: number; excluded: number};
export type SitemapAddress = {address: string; family: 4 | 6};
export interface SitemapTransport {
  resolve(hostname: string, signal: AbortSignal): Promise<SitemapAddress[]>;
  request(url: URL, address: SitemapAddress, signal: AbortSignal): Promise<{
    statusCode: number; headers: Record<string, string | string[] | undefined>; body: AsyncIterable<Uint8Array>;
  }>;
}

const invalid = (message = 'Карта сайта повреждена или использует неподдерживаемый XML. Выберите XML-файл с адресами страниц (urlset) или добавьте страницу вручную.') => new ValidationError(message);
const unavailable = () => new VersioningError('Карта сайта временно недоступна. Повторите попытку или добавьте страницу вручную.', 'SITEMAP_UNAVAILABLE', 503);
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function sitemapUrl(value: string): URL {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\]/u.test(value)) throw invalid('Укажите HTTPS-адрес карты сайта на разрешённом публичном домене.');
  let url: URL;
  try { url = new URL(value); } catch { throw invalid('Укажите HTTPS-адрес карты сайта на разрешённом публичном домене.'); }
  if (url.username || url.password || url.hash || !/^https:\/\//i.test(value)) throw invalid('Укажите HTTPS-адрес карты сайта на разрешённом публичном домене.');
  // Reject URL-parser repairs of credentials, host aliases and encoded hostnames.
  const authority = /^https:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority) throw invalid();
  try {
    normalizeVerifiableOrigin(url.origin, false);
    normalizeVerifiableOrigin(`https://${authority}`, false);
  } catch { throw invalid('Укажите HTTPS-адрес карты сайта на разрешённом публичном домене. Локальные и внутренние адреса не поддерживаются.'); }
  return url;
}

function origins(values: string[]): Set<string> {
  if (!Array.isArray(values) || values.length > 1000) throw invalid('Список разрешённых адресов сайта некорректен.');
  try { return new Set(values.map(value => normalizeProjectOrigin(value))); }
  catch { throw invalid('Список разрешённых адресов сайта некорректен.'); }
}

function page(value: string, allowed: Set<string>): SitemapPage | null {
  try {
    // Hashes and queries do not participate in Page identity.
    if (typeof value !== 'string' || /[\s\\]/u.test(value)) return null;
    const url = sitemapUrl(value.replace(/#.*$/, ''));
    if (!allowed.has(url.origin)) return null;
    const pathname = normalizePathname(url.pathname);
    return {pathname, url: `${url.origin}${pathname}`};
  } catch { return null; }
}

/** Shared by preview and the transactional import's current-origin recheck. */
export function normalizeSitemapPage(value: string, allowedOrigins: string[]): SitemapPage | null {
  return page(value, origins(allowedOrigins));
}

/** Conservative global-unicast policy; mapped, transition and special-purpose IPs are denied. */
export function isPublicSitemapAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 && (c === 0 || c === 2) || b === 168 || b === 88 && c === 99))
      || (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) || (a === 203 && b === 0 && c === 113));
  }
  if (family !== 6 || address.includes('.')) return false;
  const halves = address.toLowerCase().split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  const [a, b] = groups.map(group => parseInt(group, 16));
  return a >= 0x2000 && a <= 0x3fff && a !== 0x2002
    && !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8)) && !(a === 0x3fff && b <= 0xfff);
}

const defaultTransport: SitemapTransport = {
  async resolve(hostname, signal) {
    const resolver = new Resolver({timeout: 1000, tries: 2});
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, {once: true});
    try {
      if (signal.aborted) throw unavailable();
      const answers = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
      const result: SitemapAddress[] = [];
      for (const [index, answer] of answers.entries()) {
        if (answer.status === 'fulfilled') result.push(...answer.value.map(address => ({address, family: (index === 0 ? 4 : 6) as 4 | 6})));
        // ENODATA means this family is absent; other failures cannot prove all answers safe.
        else if (!['ENODATA', 'ENOTFOUND'].includes((answer.reason as {code?: string})?.code ?? '')) throw unavailable();
      }
      return result;
    } finally { signal.removeEventListener('abort', cancel); resolver.cancel(); }
  },
  request(url, address, signal) {
    return new Promise((resolve, reject) => {
      const outgoing = request(url, {
        signal, agent: false, family: address.family, maxHeaderSize: 16 * 1024,
        headers: {accept: 'application/xml, text/xml', 'accept-encoding': 'identity'},
        // The socket never performs a second DNS resolution; TLS still verifies the original host.
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      }, incoming => resolve({statusCode: incoming.statusCode ?? 0, headers: incoming.headers, body: incoming}));
      outgoing.on('error', reject);
      outgoing.end();
    });
  },
};

function xmlCharacter(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code >= 0x20 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff;
}

function decodeXml(value: string): string {
  if (value.includes(']]>')) throw invalid();
  return value.replace(/&([^;]*);|&/g, (match, entity: string | undefined) => {
    const predefined: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
    if (entity && Object.prototype.hasOwnProperty.call(predefined, entity)) return predefined[entity];
    if (entity && /^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) {
      const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (xmlCharacter(code)) return String.fromCodePoint(code);
    }
    throw invalid();
  });
}

type XmlNode = {name: string; local: string; ns: string; namespaces: Map<string, string>; text: string; loc?: string};

/** A bounded, non-recovering XML reader for a single urlset; indexes are deliberately not fetched. */
export function parseSitemapXml(xml: string): string[] {
  if (Buffer.byteLength(xml) > SITEMAP_LIMITS.bytes) throw invalid('Карта сайта слишком большая для предпросмотра. Выберите меньший XML-файл или добавьте страницу вручную.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw invalid();
  for (const character of xml) if (!xmlCharacter(character.codePointAt(0)!)) throw invalid();
  if (xml.startsWith('\uFEFF')) xml = xml.slice(1);
  const stack: XmlNode[] = [], locations: string[] = [];
  let offset = 0, elements = 0, rootSeen = false, rootClosed = false;
  const namePattern = /^[A-Za-z_][A-Za-z0-9_.:-]*/;
  const text = (value: string, raw = false) => {
    const decoded = raw ? value : decodeXml(value);
    if (!stack.length && /[^\t\n\r ]/.test(decoded)) throw invalid();
    const current = stack[stack.length - 1];
    if (current?.local === 'loc' && (current.ns === SITEMAP_NS || current.ns === '')) current.text += decoded;
    else if (current && (current.local === 'urlset' || current.local === 'url') && decoded.trim()) throw invalid();
  };
  const close = () => {
    const node = stack.pop()!;
    const parent = stack[stack.length - 1];
    if (node.local === 'loc' && parent?.local === 'url' && node.ns === parent.ns) {
      if (parent.loc !== undefined) throw invalid();
      parent.loc = node.text.trim();
    }
    if (node.local === 'url' && parent?.local === 'urlset' && node.ns === parent.ns) {
      if (!node.loc || locations.length >= SITEMAP_LIMITS.entries) throw invalid('В карте сайта отсутствуют адреса страниц или их слишком много для предпросмотра. Проверьте XML-файл, выберите меньшую карту сайта или добавьте страницу вручную.');
      locations.push(node.loc);
    }
    if (!stack.length) rootClosed = true;
  };
  while (offset < xml.length) {
    if (xml[offset] !== '<') {
      const end = xml.indexOf('<', offset);
      text(xml.slice(offset, end === -1 ? undefined : end)); offset = end === -1 ? xml.length : end; continue;
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4);
      if (end < 0 || /--|-$/.test(xml.slice(offset + 4, end))) throw invalid();
      offset = end + 3; continue;
    }
    if (xml.startsWith('<![CDATA[', offset)) {
      const end = xml.indexOf(']]>', offset + 9);
      if (end < 0 || !stack.length) throw invalid();
      text(xml.slice(offset + 9, end), true); offset = end + 3; continue;
    }
    if (xml.startsWith('<?', offset)) {
      const end = xml.indexOf('?>', offset + 2);
      if (offset !== 0 || end < 0 || !/^<\?xml[\t\n\r ]+version[\t\n\r ]*=[\t\n\r ]*(['"])1\.0\1(?:[\t\n\r ]+encoding[\t\n\r ]*=[\t\n\r ]*(['"])[Uu][Tt][Ff]-8\2)?(?:[\t\n\r ]+standalone[\t\n\r ]*=[\t\n\r ]*(['"])(?:yes|no)\3)?[\t\n\r ]*\?>$/.test(xml.slice(offset, end + 2))) throw invalid();
      offset = end + 2; continue;
    }
    const closing = xml.startsWith('</', offset);
    offset += closing ? 2 : 1;
    const name = namePattern.exec(xml.slice(offset))?.[0];
    if (!name || name.split(':').length > 2) throw invalid();
    offset += name.length;
    if (closing) {
      while (/[\t\n\r ]/.test(xml[offset] ?? '') && offset < xml.length) offset++;
      if (xml[offset++] !== '>' || stack[stack.length - 1]?.name !== name) throw invalid();
      close(); continue;
    }
    const attributes = new Map<string, string>();
    let selfClosing = false;
    while (true) {
      const start = offset;
      while (/[\t\n\r ]/.test(xml[offset] ?? '') && offset < xml.length) offset++;
      if (xml.startsWith('/>', offset)) { offset += 2; selfClosing = true; break; }
      if (xml[offset] === '>') { offset++; break; }
      if (offset === start || attributes.size >= 64) throw invalid();
      const key = namePattern.exec(xml.slice(offset))?.[0];
      if (!key || key.split(':').length > 2 || attributes.has(key)) throw invalid();
      offset += key.length;
      while (/[\t\n\r ]/.test(xml[offset] ?? '') && offset < xml.length) offset++;
      if (xml[offset++] !== '=') throw invalid();
      while (/[\t\n\r ]/.test(xml[offset] ?? '') && offset < xml.length) offset++;
      const quote = xml[offset++];
      if (quote !== '"' && quote !== "'") throw invalid();
      const end = xml.indexOf(quote, offset);
      if (end < 0 || xml.slice(offset, end).includes('<')) throw invalid();
      attributes.set(key, decodeXml(xml.slice(offset, end))); offset = end + 1;
    }
    const namespaces = new Map<string, string>(stack[stack.length - 1]?.namespaces ?? [['xml', XML_NS]]);
    for (const [key, value] of attributes) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) {
        const prefix = key === 'xmlns' ? '' : key.slice(6);
        if (prefix && !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(prefix) || prefix === 'xmlns' || prefix === 'xml' && value !== XML_NS || value === 'http://www.w3.org/2000/xmlns/' || value === XML_NS && prefix !== 'xml' || prefix && !value) throw invalid();
        namespaces.set(prefix, value);
      }
    }
    const resolveName = (qualified: string, attribute = false) => {
      const parts = qualified.split(':');
      if (parts.some(part => !/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(part))) throw invalid();
      if (parts.length === 2 && (!namespaces.has(parts[0]) || parts[0] === 'xmlns')) throw invalid();
      return {local: parts[parts.length - 1], ns: parts.length === 2 ? namespaces.get(parts[0])! : attribute ? '' : namespaces.get('') ?? ''};
    };
    const resolvedAttributes = new Set<string>();
    for (const key of attributes.keys()) {
      if (key === 'xmlns' || key.startsWith('xmlns:')) continue;
      const resolved = resolveName(key, true), identity = `${resolved.ns}\0${resolved.local}`;
      if (resolvedAttributes.has(identity)) throw invalid();
      resolvedAttributes.add(identity);
    }
    const resolved = resolveName(name), parent = stack[stack.length - 1];
    if (++elements > SITEMAP_LIMITS.elements || stack.length >= SITEMAP_LIMITS.depth || parent?.local === 'loc') throw invalid();
    if (!parent) {
      if (rootSeen || rootClosed || resolved.local !== 'urlset' || !['', SITEMAP_NS].includes(resolved.ns)) throw invalid();
      rootSeen = true;
    } else if (resolved.ns === parent.ns && parent.local === 'urlset' && resolved.local !== 'url') throw invalid();
    else if (resolved.local === 'loc' && resolved.ns === stack[0].ns && parent.local !== 'url') throw invalid();
    stack.push({name, ...resolved, namespaces, text: ''});
    if (selfClosing) close();
  }
  if (!rootSeen || !rootClosed || stack.length) throw invalid();
  return locations;
}

/** Injection is server-owned: a request can never select a transport, deadline or bypass. */
export function createSitemapPreview(transport: SitemapTransport = defaultTransport, options: {deadlineMs?: number} = {}) {
  const deadlineMs = options.deadlineMs ?? SITEMAP_LIMITS.deadlineMs;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > SITEMAP_LIMITS.deadlineMs) throw invalid('Некорректное время ожидания карты сайта.');
  return async (value: string, allowedOrigins: string[]): Promise<SitemapPreview> => {
    const url = sitemapUrl(value), allowed = origins(allowedOrigins);
    if (!allowed.has(url.origin)) throw invalid('Адрес карты сайта не разрешён для этого проекта. Выберите карту сайта на подключённом домене.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, deadlineMs);
    });
    try {
      const fetch = async () => {
        const addresses = await transport.resolve(url.hostname, controller.signal);
        if (!addresses.length || addresses.length > SITEMAP_LIMITS.dnsAnswers || addresses.some(address => isIP(address.address) !== address.family || !isPublicSitemapAddress(address.address))) throw invalid('Карта сайта должна быть доступна по публичному IP-адресу. Локальные и внутренние адреса не поддерживаются; добавьте страницу вручную.');
        if (controller.signal.aborted) throw unavailable();
        const response = await transport.request(url, addresses[0], controller.signal);
        if (response.statusCode !== 200) throw invalid('Укажите прямой адрес XML-файла карты сайта без перенаправлений. Сервер должен вернуть успешный ответ (HTTP 200).');
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw invalid('Сжатые карты сайта (например, gzip) не поддерживаются. Укажите несжатый XML-файл или добавьте страницу вручную.');
        const length = response.headers['content-length'];
        if (length !== undefined && (typeof length !== 'string' || !/^\d+$/.test(length) || Number(length) > SITEMAP_LIMITS.bytes)) throw invalid('Карта сайта слишком большая для предпросмотра. Выберите меньший XML-файл или добавьте страницу вручную.');
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          if (!(chunk instanceof Uint8Array) || (bytes += chunk.byteLength) > SITEMAP_LIMITS.bytes) throw invalid('Карта сайта слишком большая для предпросмотра. Выберите меньший XML-файл или добавьте страницу вручную.');
          chunks.push(Buffer.from(chunk));
        }
        let xml: string;
        try { xml = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)); } catch { throw invalid(); }
        const result: SitemapPreview = {pages: [], duplicates: 0, excluded: 0}, paths = new Set<string>();
        for (const location of parseSitemapXml(xml)) {
          const candidate = page(location, allowed);
          if (!candidate) result.excluded++;
          else if (paths.has(candidate.pathname)) result.duplicates++;
          else { paths.add(candidate.pathname); result.pages.push(candidate); }
        }
        return result;
      };
      return await Promise.race([fetch(), deadline]);
    } catch (error) {
      if (error instanceof VersioningError) throw error;
      throw unavailable();
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  };
}

export const previewSitemap = createSitemapPreview();
