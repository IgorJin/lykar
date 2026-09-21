import { parsePublishedManifestV1 } from '@lykar/protocol';

import type {
  AnalyticsProperties,
  ExperimentRuntimeSelection,
  FetchLike,
  TrackEventResult,
} from './types.js';

const ANONYMOUS_ID_COOKIE = 'lykar_anonymous_id';
const ANONYMOUS_ID_STORAGE = 'lykar:anonymous-id';
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const THIRTY_DAYS_MS = THIRTY_DAYS_SECONDS * 1000;

export type ExperimentSelectionClientOptions = {
  projectKey: string;
  apiBaseUrl: string;
  pathname: string;
  experimentToken: string;
  document: Document;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  fetch: FetchLike;
};

export async function resolveExperimentSelection(
  options: ExperimentSelectionClientOptions,
): Promise<ExperimentRuntimeSelection | null> {
  const anonymousId = getOrCreateAnonymousId(options.document);
  const response = await options.fetch(
    `${options.apiBaseUrl.replace(/\/+$/, '')}/api/runtime/projects/${encodeURIComponent(options.projectKey)}/experiments/resolve`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(options.credentials ? { credentials: options.credentials } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      body: JSON.stringify({
        pathname: options.pathname,
        experimentToken: options.experimentToken,
        anonymousId,
      }),
    },
  );
  if (response.status === 204) return null;
  if (response.status >= 400 && response.status < 500) return null;
  if (!response.ok) throw new Error(`Experiment selection returned HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.selection)) {
    throw new Error('Experiment selection response is invalid');
  }
  const selection = payload.selection;
  if (
    typeof selection.assignmentId !== 'string'
    || typeof selection.experimentId !== 'string'
    || (selection.variantKey !== 'A' && selection.variantKey !== 'B')
    || typeof selection.capability !== 'string'
    || typeof selection.capabilityExpiresAt !== 'string'
  ) {
    throw new Error('Experiment selection response is invalid');
  }
  return {
    mode: 'experiment',
    assignmentId: selection.assignmentId,
    experimentId: selection.experimentId,
    variantKey: selection.variantKey,
    capability: selection.capability,
    capabilityExpiresAt: selection.capabilityExpiresAt,
    manifest: selection.manifest === null ? null : parsePublishedManifestV1(selection.manifest),
  };
}

export async function sendAnalyticsEvent(options: {
  apiBaseUrl: string;
  capability: string;
  eventType: 'exposure' | 'conversion';
  name: string;
  properties: AnalyticsProperties;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  fetch: FetchLike;
}): Promise<TrackEventResult> {
  try {
    const response = await options.fetch(
      `${options.apiBaseUrl.replace(/\/+$/, '')}/api/runtime/analytics/events`,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(options.credentials ? { credentials: options.credentials } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        body: JSON.stringify({
          capability: options.capability,
          clientEventId: createUuid(),
          eventType: options.eventType,
          name: options.name,
          properties: options.properties,
          occurredAt: new Date().toISOString(),
        }),
      },
    );
    if (!response.ok) return { accepted: false, code: 'EVENT_SEND_FAILED' };
    const payload: unknown = await response.json();
    return {
      accepted: true,
      duplicate: isRecord(payload) && payload.duplicate === true,
    };
  } catch {
    return { accepted: false, code: 'EVENT_SEND_FAILED' };
  }
}

export function getOrCreateAnonymousId(document: Document): string {
  const cookieId = readCookie(document, ANONYMOUS_ID_COOKIE);
  if (isUuid(cookieId)) {
    const stored = readStorage(document);
    if (stored?.id !== cookieId) writeStorage(document, cookieId, Date.now() + THIRTY_DAYS_MS);
    return cookieId;
  }
  const stored = readStorage(document);
  const anonymousId = stored?.id ?? createUuid();
  const expiresAt = stored?.expiresAt ?? Date.now() + THIRTY_DAYS_MS;
  writeCookie(document, anonymousId, Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)));
  writeStorage(document, anonymousId, expiresAt);
  return anonymousId;
}

function readCookie(document: Document, name: string): string | undefined {
  try {
    const prefix = `${name}=`;
    return document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith(prefix))?.slice(prefix.length);
  } catch {
    return undefined;
  }
}

function writeCookie(document: Document, value: string, maxAge = THIRTY_DAYS_SECONDS): void {
  try {
    const secure = document.defaultView?.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ANONYMOUS_ID_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // localStorage remains the fallback when cookies are unavailable.
  }
}

function readStorage(document: Document): { id: string; expiresAt: number } | undefined {
  try {
    const stored = document.defaultView?.localStorage.getItem(ANONYMOUS_ID_STORAGE);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed) || !isUuid(parsed.id) || typeof parsed.expiresAt !== 'number') return undefined;
    if (parsed.expiresAt <= Date.now()) {
      document.defaultView?.localStorage.removeItem(ANONYMOUS_ID_STORAGE);
      return undefined;
    }
    return { id: parsed.id, expiresAt: parsed.expiresAt };
  } catch {
    return undefined;
  }
}

function writeStorage(document: Document, value: string, expiresAt: number): void {
  try {
    document.defaultView?.localStorage.setItem(ANONYMOUS_ID_STORAGE, JSON.stringify({
      id: value,
      expiresAt,
    }));
  } catch {
    // Cookie remains the primary store when localStorage is unavailable.
  }
}

function createUuid(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
