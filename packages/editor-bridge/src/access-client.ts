import type { EditingCapability } from './editor.js';

export type ShareRuntimeAccess = {
  token: string;
  expiresAt: string;
  projectId: string;
  pageId: string;
  releaseId: string;
  version: number;
};

export async function exchangeEditorLaunch(options: {
  apiBaseUrl: string;
  document?: Document;
  fetch?: typeof fetch;
  storage?: Storage | null;
}): Promise<EditingCapability | null> {
  const document = options.document ?? globalThis.document;
  const location = document?.defaultView?.location;
  if (!location) throw new Error('Editor launch exchange requires a browser location');
  const code = fragmentParams(location).get('lykar_edit');
  const storage = options.storage === undefined ? safeSessionStorage(document) : options.storage;
  // Explicit visitor modes must not inherit a prior editor session in this tab.
  if (!code && (fragmentParams(location).has('lykar_share')
    || ['version', 'lykar_variant', 'lykar_experiment'].some(name => new URLSearchParams(location.search).has(name)))) {
    removeStoredCapability(storage, location);
    return null;
  }
  if (!code) return restoreEditingCapability(storage, location, options.apiBaseUrl);
  const payload = await exchange(options.apiBaseUrl, '/api/editor/exchange', code, location, options.fetch);
  if (!isRecord(payload) || !isRecord(payload.capability)) throw new Error('Invalid editor exchange response');
  const capability = { ...(payload.capability as EditingCapability), apiBaseUrl: options.apiBaseUrl };
  if (!validEditingCapability(capability, location, options.apiBaseUrl)) throw new Error('Invalid editor exchange capability');
  removeSecretFragment(location, document, 'lykar_edit');
  persistEditingCapability(storage, location, capability);
  return capability;
}

export async function exchangeShareAccess(options: {
  apiBaseUrl: string;
  document?: Document;
  fetch?: typeof fetch;
}): Promise<ShareRuntimeAccess | null> {
  const document = options.document ?? globalThis.document;
  const location = document?.defaultView?.location;
  if (!location) throw new Error('Share exchange requires a browser location');
  const code = fragmentParams(location).get('lykar_share');
  if (!code) return null;
  const payload = await exchange(options.apiBaseUrl, '/api/share/exchange', code, location, options.fetch);
  if (!isRecord(payload) || !isRecord(payload.access)) throw new Error('Invalid share exchange response');
  removeSecretFragment(location, document, 'lykar_share');
  return payload.access as ShareRuntimeAccess;
}

async function exchange(
  apiBaseUrl: string,
  path: string,
  code: string,
  location: Location,
  customFetch?: typeof fetch,
): Promise<unknown> {
  const fetcher = customFetch ?? globalThis.fetch;
  if (!fetcher) throw new Error('Access exchange requires fetch');
  const response = await fetcher(`${apiBaseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, pageUrl: `${location.origin}${location.pathname}` }),
  });
  if (!response.ok) throw new Error(`Access exchange returned HTTP ${response.status}`);
  return response.json();
}

function removeSecretFragment(location: Location, document: Document, name: string): void {
  const url = new URL(location.href);
  const fragments = fragmentParams(location);
  fragments.delete(name);
  url.hash = fragments.toString();
  document.defaultView?.history.replaceState(document.defaultView.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function fragmentParams(location: Location): URLSearchParams {
  return new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : location.hash);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function capabilityStorageKey(location: Location): string {
  return `lykar:editor-capability:${location.pathname}`;
}

function persistEditingCapability(storage: Storage | null, location: Location, capability: EditingCapability): void {
  try {
    storage?.setItem(capabilityStorageKey(location), JSON.stringify(capability));
  } catch { /* sessionStorage can be unavailable in hardened browser contexts */ }
}

function restoreEditingCapability(
  storage: Storage | null,
  location: Location,
  apiBaseUrl: string,
): EditingCapability | null {
  const key = capabilityStorageKey(location);
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!validEditingCapability(value, location, apiBaseUrl)) {
      removeStoredCapability(storage, location);
      return null;
    }
    return { ...value, apiBaseUrl };
  } catch {
    removeStoredCapability(storage, location);
    return null;
  }
}

function validEditingCapability(value: unknown, location: Location, apiBaseUrl: string): value is EditingCapability {
  if (!isRecord(value) || typeof value.token !== 'string' || value.token.length < 32
    || typeof value.projectId !== 'string' || !value.projectId
    || typeof value.draftId !== 'string' || !value.draftId
    || typeof value.pageUrl !== 'string' || typeof value.expiresAt !== 'string'
    || typeof value.expectedRevision !== 'number' || !Number.isSafeInteger(value.expectedRevision)
    || value.expectedRevision < 0 || !Number.isFinite(Date.parse(value.expiresAt))
    || Date.parse(value.expiresAt) <= Date.now()
    || typeof value.apiBaseUrl !== 'string'
    || value.apiBaseUrl.replace(/\/+$/, '') !== apiBaseUrl.replace(/\/+$/, '')) return false;
  try {
    const pageUrl = new URL(value.pageUrl);
    return pageUrl.origin === location.origin && pageUrl.pathname === location.pathname;
  } catch { return false; }
}

function removeStoredCapability(storage: Storage | null, location: Location): void {
  try { storage?.removeItem(capabilityStorageKey(location)); } catch { /* Storage may be disabled. */ }
}

function safeSessionStorage(document: Document): Storage | null {
  try { return document.defaultView?.sessionStorage ?? null; } catch { return null; }
}
