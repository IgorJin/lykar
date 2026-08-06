import { parsePublishedManifestV1 } from '@lykar/protocol';
import type { PublishedManifestV1, SourceSnapshotV1 } from '@lykar/protocol';

import { applyOperation } from './dom-executor.js';
import { captureSourceSnapshot } from './dom-fingerprint.js';
import { fetchManifest } from './manifest-client.js';
import type {
  ApplyManifestOptions,
  ApplyReport,
  FetchLike,
  LykarRuntimeConstructorOptions,
  LykarRuntimeOptions,
  NativePageReport,
  OperationApplyResult,
  RuntimeStartResult,
  RuntimeSelection,
  TrackEventResult,
} from './types.js';

const appliedReleases = new WeakMap<Document, Set<string>>();

export class Lykar {
  readonly projectKey: string;
  readonly apiBaseUrl: string;
  readonly version?: number;
  readonly variantToken?: string;
  readonly pathname: string;
  readonly accessToken?: string;
  readonly credentials?: RequestCredentials;

  private readonly document: Document;
  private readonly fetcher?: FetchLike;
  private readonly strict: boolean;
  private readonly waitForDom: boolean;
  private readonly onReport?: (report: ApplyReport) => void;

  constructor(projectKey: string, options?: LykarRuntimeConstructorOptions);
  constructor(options: LykarRuntimeOptions);
  constructor(
    projectKeyOrOptions: string | LykarRuntimeOptions,
    constructorOptions: LykarRuntimeConstructorOptions = {},
  ) {
    const options: LykarRuntimeOptions = typeof projectKeyOrOptions === 'string'
      ? { ...constructorOptions, projectKey: projectKeyOrOptions }
      : projectKeyOrOptions;

    if (!options.projectKey?.trim()) throw new Error('Lykar projectKey must be a non-empty string');
    if (options.version !== undefined && (!Number.isSafeInteger(options.version) || options.version <= 0)) {
      throw new Error('Lykar version must be a positive integer');
    }
    const document = options.document ?? globalThis.document;
    if (!document) throw new Error('Lykar runtime requires a browser document');

    const globalFetch = globalThis.fetch;
    this.projectKey = options.projectKey.trim();
    this.apiBaseUrl = options.apiBaseUrl ?? '';
    this.version = options.version ?? versionFromLocation(document);
    this.variantToken = options.variantToken ?? variantTokenFromLocation(document);
    this.pathname = normalizePathname(options.pathname ?? document.defaultView?.location.pathname ?? '/');
    this.accessToken = options.accessToken;
    this.credentials = options.credentials;
    this.document = document;
    this.fetcher = options.fetch ?? (globalFetch ? globalFetch.bind(globalThis) : undefined);
    this.strict = options.strict ?? false;
    this.waitForDom = options.waitForDom ?? true;
    this.onReport = options.onReport;
  }

  async loadManifest(): Promise<RuntimeSelection> {
    if (!this.fetcher) throw new Error('Lykar runtime requires fetch to load a manifest');

    return fetchManifest({
      projectKey: this.projectKey,
      apiBaseUrl: this.apiBaseUrl,
      version: this.version,
      variantToken: this.variantToken,
      pathname: this.pathname,
      accessToken: this.accessToken,
      credentials: this.credentials,
      fetch: this.fetcher,
    });
  }

  async applyManifest(
    manifest: PublishedManifestV1,
    options: ApplyManifestOptions = {},
  ): Promise<ApplyReport> {
    const validatedManifest = parsePublishedManifestV1(manifest);
    const startedAt = new Date().toISOString();
    const releaseSet = getReleaseSet(this.document);
    const source = await sourceCompatibilityFor(this.document, validatedManifest);

    if (!options.force && releaseSet.has(validatedManifest.releaseId)) {
      const operations = validatedManifest.operations.map<OperationApplyResult>(operation => ({
        operationId: operation.id,
        kind: operation.kind,
        status: 'skipped',
        code: 'RELEASE_ALREADY_APPLIED',
        message: 'This release was already applied to the document',
      }));
      return this.finishReport(validatedManifest, startedAt, operations, true, source.compatibility, source.snapshot);
    }

    const operations: OperationApplyResult[] = [];
    for (const operation of validatedManifest.operations) {
      const operationResult = await applyOperation(this.document, operation);
      operations.push(operationResult);
      if (this.strict && operationResult.status === 'error') break;
    }

    releaseSet.add(validatedManifest.releaseId);
    return this.finishReport(validatedManifest, startedAt, operations, false, source.compatibility, source.snapshot);
  }

  async start(): Promise<RuntimeStartResult> {
    const startedAt = new Date().toISOString();
    if (this.version === undefined && !this.variantToken) {
      return nativePageReport('NO_VARIANT_TOKEN', startedAt);
    }
    if (this.waitForDom) await domReady(this.document);
    const selection = await this.loadManifest();
    if (!selection) return nativePageReport('VARIANT_UNAVAILABLE', startedAt);
    if (isNativeVariantSelection(selection)) {
      return nativePageReport('NATIVE_VARIANT', startedAt, selection);
    }
    return this.applyManifest(selection);
  }

  track(name: string, properties: Record<string, unknown> = {}): TrackEventResult {
    return track(name, properties);
  }

  private finishReport(
    manifest: PublishedManifestV1,
    startedAt: string,
    operations: OperationApplyResult[],
    alreadyApplied: boolean,
    compatibility: ApplyReport['compatibility'],
    sourceSnapshot?: SourceSnapshotV1,
  ): ApplyReport {
    const report: ApplyReport = {
      projectId: manifest.projectId,
      pageId: manifest.pageId,
      releaseId: manifest.releaseId,
      version: manifest.version,
      startedAt,
      finishedAt: new Date().toISOString(),
      applied: operations.filter(operation => operation.status === 'applied').length,
      skipped: operations.filter(operation => operation.status === 'skipped').length,
      errors: operations.filter(operation => operation.status === 'error').length,
      alreadyApplied,
      compatibility,
      ...(sourceSnapshot ? { sourceSnapshot } : {}),
      operations,
    };

    try {
      this.onReport?.(report);
    } catch {
      // Reporting hooks must not change DOM replay semantics.
    }
    return report;
  }
}

function normalizePathname(value: string): string {
  if (!value.startsWith('/')) throw new Error('Lykar pathname must start with /');
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

export { Lykar as LykarRuntime };

export function init(
  projectKey: string,
  options?: LykarRuntimeConstructorOptions,
): Promise<RuntimeStartResult>;
export function init(options: LykarRuntimeOptions): Promise<RuntimeStartResult>;
export function init(
  projectKeyOrOptions: string | LykarRuntimeOptions,
  options?: LykarRuntimeConstructorOptions,
): Promise<RuntimeStartResult> {
  return typeof projectKeyOrOptions === 'string'
    ? new Lykar(projectKeyOrOptions, options).start()
    : new Lykar(projectKeyOrOptions).start();
}

export function track(name: string, properties: Record<string, unknown> = {}): TrackEventResult {
  if (!name.trim() || name.length > 120) throw new Error('Lykar event name must contain between 1 and 120 characters');
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    throw new Error('Lykar event properties must be an object');
  }
  // TODO(analytics): persist exposure and conversion events in the analytics phase.
  return {
    accepted: false,
    code: 'EVENT_PIPELINE_NOT_IMPLEMENTED',
    event: { name: name.trim(), properties, occurredAt: new Date().toISOString() },
  };
}

function isNativeVariantSelection(
  selection: RuntimeSelection,
): selection is Extract<RuntimeSelection, { mode: 'native-variant' }> {
  return selection !== null && 'mode' in selection && selection.mode === 'native-variant';
}

function getReleaseSet(document: Document): Set<string> {
  let releases = appliedReleases.get(document);
  if (!releases) {
    releases = new Set();
    appliedReleases.set(document, releases);
  }
  return releases;
}

function versionFromLocation(document: Document): number | undefined {
  const value = document.defaultView?.location
    ? new URLSearchParams(document.defaultView.location.search).get('version')
    : null;
  if (value === null) return undefined;

  const version = Number(value);
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error('Lykar version query parameter must be a positive integer');
  }
  return version;
}

function variantTokenFromLocation(document: Document): string | undefined {
  const value = document.defaultView?.location
    ? new URLSearchParams(document.defaultView.location.search).get('lykar_variant')
    : null;
  return value?.trim() || undefined;
}

async function sourceCompatibilityFor(
  document: Document,
  manifest: PublishedManifestV1,
): Promise<{ compatibility: ApplyReport['compatibility']; snapshot?: SourceSnapshotV1 }> {
  try {
    const current = await captureSourceSnapshot(document);
    if (!manifest.sourceSnapshot) return { compatibility: { status: 'unknown' }, snapshot: current };
    return { compatibility: {
      status: current.pageHash === manifest.sourceSnapshot.pageHash ? 'compatible' : 'drifted',
      expectedPageHash: manifest.sourceSnapshot.pageHash,
      actualPageHash: current.pageHash,
    }, snapshot: current };
  } catch {
    return {
      compatibility: {
        status: 'unknown',
        ...(manifest.sourceSnapshot ? { expectedPageHash: manifest.sourceSnapshot.pageHash } : {}),
      },
    };
  }
}

function nativePageReport(
  reason: NativePageReport['reason'],
  startedAt: string,
  selection?: Extract<RuntimeSelection, { mode: 'native-variant' }>,
): NativePageReport {
  return {
    mode: 'native',
    reason,
    ...(selection ? { experimentId: selection.experimentId, variantKey: selection.variantKey } : {}),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function domReady(document: Document): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}
