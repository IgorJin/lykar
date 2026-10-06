import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

import { ValidationError } from './versioning';

export type VerifiableOrigin = {
  origin: string;
  hostname: string;
  local: boolean;
  recordName: string;
};

const RECORD_PREFIX = '_lykar-verification.';
const INTERNAL_SUFFIXES = new Set(['localhost', 'local', 'internal', 'home', 'lan', 'test', 'invalid', 'onion']);
const DEADLINE_MS = 3000;
const MAX_RECORDS = 64;
const MAX_CHUNKS_PER_RECORD = 16;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_EXPECTED_BYTES = 1024;

function publicDnsHostname(hostname: string): boolean {
  const labels = hostname.split('.');
  return hostname.length <= 253 - RECORD_PREFIX.length && labels.length >= 2
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    && /^[a-z]{2,63}$/.test(labels[labels.length - 1])
    && !INTERNAL_SUFFIXES.has(labels[labels.length - 1]);
}

/** Only origin syntax is accepted; the URL parser must not repair paths or IP aliases. */
export function normalizeVerifiableOrigin(value: unknown, allowLoopback: boolean): VerifiableOrigin {
  const invalid = () => new ValidationError('Origin must be an HTTPS origin with a public DNS hostname');
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) throw invalid();
  const input = /^(https?):\/\/([^/?#]+)$/i.exec(value);
  if (!input) throw invalid();
  const authority = /^(\[[^\]]+\]|[^:@]+)(?::([0-9]{1,5}))?$/.exec(input[2]);
  if (!authority) throw invalid();
  const rawHostname = authority[1].toLowerCase();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw invalid();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const local = rawHostname === 'localhost' || rawHostname === '127.0.0.1' || rawHostname === '[::1]';
  if (local) {
    if (!allowLoopback) throw invalid();
  } else if (url.protocol !== 'https:' || isIP(hostname) !== 0 || rawHostname !== hostname || !publicDnsHostname(hostname)) {
    throw invalid();
  }
  return {origin: url.origin, hostname, local, recordName: `${RECORD_PREFIX}${hostname}`};
}

export type DnsTxtVerifier = (hostname: string, expectedValue: string) => Promise<'match' | 'missing' | 'unavailable'>;
export interface DnsTxtResolver {
  resolveTxt(recordName: string): Promise<string[][]>;
  cancel(): void;
}

function inspectRecords(records: string[][], expectedValue: string): Awaited<ReturnType<DnsTxtVerifier>> {
  if (!Array.isArray(records) || records.length > MAX_RECORDS) return 'unavailable';
  let bytes = 0;
  let match = false;
  for (const chunks of records) {
    if (!Array.isArray(chunks) || chunks.length === 0 || chunks.length > MAX_CHUNKS_PER_RECORD) return 'unavailable';
    for (const chunk of chunks) {
      if (typeof chunk !== 'string') return 'unavailable';
      const size = Buffer.byteLength(chunk, 'utf8');
      bytes += size;
      if (size > 255 || bytes > MAX_RESPONSE_BYTES) return 'unavailable';
    }
    // DNS TXT strings are chunks of one record, not separate candidates.
    if (chunks.join('') === expectedValue) match = true;
  }
  return match ? 'match' : 'missing';
}

/** The factory and deadline are server-owned injection points, never request parameters. */
export function createDnsTxtVerifier(
  createResolver: () => DnsTxtResolver,
  options: {deadlineMs?: number} = {},
): DnsTxtVerifier {
  const deadlineMs = options.deadlineMs ?? DEADLINE_MS;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > DEADLINE_MS) {
    throw new ValidationError('DNS deadline must be between 1 and 3000 milliseconds');
  }
  return async (hostname, expectedValue) => {
    if (typeof hostname !== 'string' || hostname !== hostname.toLowerCase() || !publicDnsHostname(hostname)
      || typeof expectedValue !== 'string' || !expectedValue || Buffer.byteLength(expectedValue, 'utf8') > MAX_EXPECTED_BYTES) {
      return 'unavailable';
    }
    let resolver: DnsTxtResolver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      resolver = createResolver();
      const deadline = new Promise<'unavailable'>(resolve => {
        timer = setTimeout(() => resolve('unavailable'), deadlineMs);
      });
      const query = resolver.resolveTxt(`${RECORD_PREFIX}${hostname}`).then(records => inspectRecords(records, expectedValue));
      return await Promise.race([query, deadline]);
    } catch (error) {
      const code = error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      return code === 'ENODATA' || code === 'ENOTFOUND' ? 'missing' : 'unavailable';
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      try {
        resolver?.cancel();
      } catch {
        // Cleanup errors must not replace the safe verification result.
      }
    }
  };
}

// Query only TXT through the system DNS configuration. No HTTP requests or A/AAAA lookups.
export const verifyDnsTxt: DnsTxtVerifier = createDnsTxtVerifier(() => new Resolver({timeout: 1000, tries: 2}));
