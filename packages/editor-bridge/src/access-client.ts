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
}): Promise<EditingCapability | null> {
  const document = options.document ?? globalThis.document;
  const location = document?.defaultView?.location;
  if (!location) throw new Error('Editor launch exchange requires a browser location');
  const code = fragmentParams(location).get('lykar_edit');
  if (!code) return null;
  const payload = await exchange(options.apiBaseUrl, '/api/editor/exchange', code, location, options.fetch);
  if (!isRecord(payload) || !isRecord(payload.capability)) throw new Error('Invalid editor exchange response');
  removeSecretFragment(location, document, 'lykar_edit');
  return { ...(payload.capability as EditingCapability), apiBaseUrl: options.apiBaseUrl };
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
