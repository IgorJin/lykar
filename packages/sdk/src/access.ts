import { visitorTokensFromLocation } from '@lykar/runtime';

import {
  LykarSdkError,
  type SdkEditorCapability,
  type SdkShareAccess,
} from './types.js';

type AccessClientOptions = {
  apiBaseUrl?: string;
  document?: Document;
  fetch?: typeof fetch;
  storage?: Storage;
  isCurrent?: () => boolean;
};

const editorStorageKey = 'lykar:editor-capability';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getDocument(options: AccessClientOptions): Document {
  const document = options.document ?? globalThis.document;
  if (!document) {
    throw new LykarSdkError(
      'NO_DOCUMENT',
      'Lykar SDK access exchange requires a browser document.',
    );
  }
  return document;
}

function getFetch(options: AccessClientOptions): typeof fetch {
  const request = options.fetch ?? globalThis.fetch;
  if (!request) {
    throw new LykarSdkError(
      'NO_FETCH',
      'Lykar SDK access exchange requires fetch.',
    );
  }
  return request;
}

function getStorage(document: Document, options: AccessClientOptions): Storage | undefined {
  if (options.storage) return options.storage;
  try {
    return document.defaultView?.sessionStorage;
  } catch {
    return undefined;
  }
}

function apiUrl(apiBaseUrl: string | undefined, path: string): string {
  return new URL(path, apiBaseUrl || globalThis.location?.origin || 'http://localhost').toString();
}

function isCapability(value: unknown): value is SdkEditorCapability {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SdkEditorCapability>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length >= 32 &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Date.parse(candidate.expiresAt) > Date.now() &&
    typeof candidate.projectId === 'string' &&
    candidate.projectId.length > 0 &&
    typeof candidate.pageUrl === 'string' &&
    typeof candidate.draftId === 'string' &&
    candidate.draftId.length > 0 &&
    typeof candidate.expectedRevision === 'number' &&
    Number.isSafeInteger(candidate.expectedRevision) &&
    candidate.expectedRevision >= 0
  );
}

function matchesPage(
  capability: SdkEditorCapability,
  document: Document,
  apiBaseUrl: string | undefined,
): boolean {
  try {
    const expected = new URL(capability.pageUrl);
    const actual = document.location;
    if (!actual || expected.origin !== actual.origin || expected.pathname !== actual.pathname) {
      return false;
    }
    const storedApi = capability.apiBaseUrl?.replace(/\/+$/, '') ?? '';
    const configuredApi = (apiBaseUrl ?? '').replace(/\/+$/, '');
    return storedApi === configuredApi;
  } catch {
    return false;
  }
}

function isShareAccess(value: unknown): value is SdkShareAccess {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SdkShareAccess>;
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.expiresAt === 'string' &&
    typeof candidate.projectId === 'string' &&
    typeof candidate.pageId === 'string' &&
    typeof candidate.releaseId === 'string' &&
    typeof candidate.version === 'number'
  );
}

function removeFragment(document: Document, name: string): void {
  const location = document.location;
  if (!location || !document.defaultView?.history) return;
  const hash = readHash(document);
  hash.delete(name);
  const cleanUrl = `${location.pathname}${location.search}${hash.size ? `#${hash}` : ''}`;
  document.defaultView.history.replaceState({}, '', cleanUrl);
}

function readHash(document: Document): URLSearchParams {
  return new URLSearchParams(document.location?.hash.replace(/^#/, '') ?? '');
}

function hasVisitorSelector(document: Document): boolean {
  const location = document.location;
  if (!location) return false;
  const search = new URLSearchParams(location.search);
  const tokens = visitorTokensFromLocation(document);
  return (
    search.has('version') ||
    Boolean(tokens.variant) ||
    Boolean(tokens.experiment) ||
    readHash(document).has('lykar_share')
  );
}

export async function exchangeEditorLaunch(
  options: AccessClientOptions = {},
): Promise<SdkEditorCapability | null> {
  const document = getDocument(options);
  const hash = readHash(document);
  const code = hash.get('lykar_edit');
  const storage = getStorage(document, options);

  if (!code && hasVisitorSelector(document)) {
    storage?.removeItem(storageKey(document));
    return null;
  }

  if (!code) {
    const stored = storage?.getItem(storageKey(document));
    if (!stored) return null;
    try {
      const capability: unknown = JSON.parse(stored);
      return isCapability(capability) && matchesPage(capability, document, options.apiBaseUrl)
        ? capability
        : null;
    } catch {
      storage?.removeItem(storageKey(document));
      return null;
    }
  }

  const request = getFetch(options);
  const response = await request(apiUrl(options.apiBaseUrl, '/api/editor/exchange'), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      code,
      pageUrl: document.location
        ? `${document.location.origin}${document.location.pathname}`
        : '',
    }),
  });
  assertCurrent(options);

  if (!response.ok) {
    throw new LykarSdkError(
      'EDITOR_EXCHANGE_FAILED',
      `Editor launch exchange failed with status ${response.status}.`,
    );
  }

  const payload: unknown = await response.json();
  assertCurrent(options);
  const capability =
    isRecord(payload) && isRecord(payload.capability) ? payload.capability : payload;
  if (!isCapability(capability)) {
    throw new LykarSdkError(
      'EDITOR_CAPABILITY_INVALID',
      'Editor launch exchange returned an invalid capability.',
    );
  }

  const normalizedCapability: SdkEditorCapability = {
    ...capability,
    apiBaseUrl: options.apiBaseUrl ?? '',
  };
  if (!matchesPage(normalizedCapability, document, options.apiBaseUrl)) {
    throw new LykarSdkError(
      'EDITOR_CAPABILITY_SCOPE_MISMATCH',
      'Editor capability does not match the current page or API origin.',
    );
  }
  assertCurrent(options);
  storage?.setItem(storageKey(document), JSON.stringify(normalizedCapability));
  removeFragment(document, 'lykar_edit');
  return normalizedCapability;
}

export async function exchangeShareAccess(
  options: AccessClientOptions = {},
): Promise<SdkShareAccess | null> {
  const document = getDocument(options);
  const code = readHash(document).get('lykar_share');
  if (!code) return null;

  const request = getFetch(options);
  const response = await request(apiUrl(options.apiBaseUrl, '/api/share/exchange'), {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      code,
      pageUrl: document.location
        ? `${document.location.origin}${document.location.pathname}`
        : '',
    }),
  });
  assertCurrent(options);

  if (!response.ok) {
    throw new LykarSdkError(
      'SHARE_EXCHANGE_FAILED',
      `Share access exchange failed with status ${response.status}.`,
    );
  }

  const payload: unknown = await response.json();
  assertCurrent(options);
  const access = isRecord(payload) && isRecord(payload.access) ? payload.access : payload;
  if (!isShareAccess(access)) {
    throw new LykarSdkError(
      'SHARE_ACCESS_INVALID',
      'Share access exchange returned an invalid capability.',
    );
  }

  assertCurrent(options);
  removeFragment(document, 'lykar_share');
  return access;
}

function assertCurrent(options: AccessClientOptions): void {
  if (options.isCurrent?.() === false) {
    const error = new Error('Lykar access exchange belongs to a stale PageSession.');
    error.name = 'AbortError';
    throw error;
  }
}

function storageKey(document: Document): string {
  return `${editorStorageKey}:${document.location?.pathname ?? '/'}`;
}

export function getLocationSelectors(document: Document): {
  editor: boolean;
  share: boolean;
  visitor: boolean;
  version: boolean;
  variant: boolean;
  experiment: boolean;
  selectorCount: number;
} {
  const location = document.location;
  const tokens = visitorTokensFromLocation(document);
  const search = new URLSearchParams(location?.search ?? '');
  const hash = readHash(document);
  const editor = hash.has('lykar_edit');
  const share = hash.has('lykar_share');
  const version = search.has('version');
  const variant = Boolean(tokens.variant);
  const experiment = Boolean(tokens.experiment);
  const selectors = [editor, share, variant, experiment, version && !share];
  return {
    editor,
    share,
    visitor: version || variant || experiment,
    version,
    variant,
    experiment,
    selectorCount: selectors.filter(Boolean).length,
  };
}
