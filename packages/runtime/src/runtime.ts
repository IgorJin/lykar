import { parsePublishedManifestV1 } from '@lykar/protocol';
import type { PublishedManifestV1, SourceSnapshotV1 } from '@lykar/protocol';

import { applyOperation } from './dom-executor.js';
import { captureSourceSnapshot } from './dom-fingerprint.js';
import { resolveExperimentSelection, sendAnalyticsEvent } from './analytics-client.js';
import { fetchManifest } from './manifest-client.js';
import type {
  ApplyManifestOptions,
  ApplyReport,
  AnalyticsConsent,
  AnalyticsProperties,
  ExperimentRuntimeSelection,
  FetchLike,
  LykarRuntimeConstructorOptions,
  LykarRuntimeOptions,
  NativePageReport,
  OperationApplyResult,
  RuntimeStartResult,
  RuntimeSelection,
  TrackEventResult,
} from './types.js';

const appliedReleases = new WeakMap<Document | Element, Set<string>>();
const sourceBaselines = new WeakMap<Document | Element, Promise<SourceSnapshotV1 | null>>();
let activeRuntime: Lykar | undefined;

export class Lykar {
  readonly projectKey: string;
  readonly apiBaseUrl: string;
  readonly version?: number;
  readonly variantToken?: string;
  readonly experimentToken?: string;
  readonly pathname: string;
  readonly accessToken?: string;
  readonly credentials?: RequestCredentials;

  private readonly document: Document;
  private readonly root: Document | Element;
  private readonly fetcher?: FetchLike;
  private readonly strict: boolean;
  private readonly waitForDom: boolean;
  private readonly onReport?: (report: ApplyReport) => void;
  private readonly signal?: AbortSignal;
  private readonly isCurrent?: () => boolean;
  private readonly targetRetryMs: number;
  private readonly targetRetryIntervalMs: number;
  private analyticsConsent: AnalyticsConsent;
  private analyticsContext?: ExperimentRuntimeSelection;
  private pendingExposure = false;
  private exposureSent = false;

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
    this.experimentToken = options.experimentToken ?? experimentTokenFromLocation(document);
    this.pathname = normalizePathname(options.pathname ?? document.defaultView?.location.pathname ?? '/');
    this.accessToken = options.accessToken;
    this.credentials = options.credentials;
    this.document = document;
    this.root = options.root ?? document;
    if (this.root.nodeType === 1 && this.root.ownerDocument !== document) {
      throw new Error('Lykar runtime root belongs to another document');
    }
    this.fetcher = options.fetch ?? (globalFetch ? globalFetch.bind(globalThis) : undefined);
    this.strict = options.strict ?? false;
    this.waitForDom = options.waitForDom ?? true;
    this.onReport = options.onReport;
    this.signal = options.signal;
    this.isCurrent = options.isCurrent;
    this.targetRetryMs = boundedDuration(options.targetRetryMs ?? 0, 'targetRetryMs');
    this.targetRetryIntervalMs = boundedDuration(options.targetRetryIntervalMs ?? 25, 'targetRetryIntervalMs');
    this.analyticsConsent = options.analyticsConsent ?? 'pending';
    activeRuntime = this;
  }

  async loadManifest(): Promise<RuntimeSelection> {
    this.assertActive();
    if (!this.fetcher) throw new Error('Lykar runtime requires fetch to load a manifest');

    if (this.version === undefined && !this.variantToken && this.experimentToken) {
      return resolveExperimentSelection({
        projectKey: this.projectKey,
        apiBaseUrl: this.apiBaseUrl,
        pathname: this.pathname,
        experimentToken: this.experimentToken,
        document: this.document,
        credentials: this.credentials,
        signal: this.signal,
        fetch: this.fetcher,
      });
    }

    return fetchManifest({
      projectKey: this.projectKey,
      apiBaseUrl: this.apiBaseUrl,
      version: this.version,
      variantToken: this.variantToken,
      pathname: this.pathname,
      accessToken: this.accessToken,
      credentials: this.credentials,
      signal: this.signal,
      fetch: this.fetcher,
    });
  }

  async applyManifest(
    manifest: PublishedManifestV1,
    options: ApplyManifestOptions = {},
  ): Promise<ApplyReport> {
    this.assertActive();
    const validatedManifest = parsePublishedManifestV1(manifest);
    const startedAt = new Date().toISOString();
    const releaseSet = getReleaseSet(this.root);
    const source = await sourceCompatibilityFor(this.document, this.root, validatedManifest);
    this.assertActive();

    if (!options.force && releaseSet.has(validatedManifest.releaseId)) {
      const operations = validatedManifest.operations.map<OperationApplyResult>(operation => ({
        operationId: operation.id,
        kind: operation.kind,
        target: operation.target,
        status: 'skipped',
        code: 'RELEASE_ALREADY_APPLIED',
        message: 'This release was already applied to the document',
      }));
      return this.finishReport(validatedManifest, startedAt, operations, true, source.compatibility, source.snapshot);
    }

    const operations: OperationApplyResult[] = [];
    for (const operation of validatedManifest.operations) {
      const operationResult = await this.applyOperationWithRetry(operation, {
        root: this.root,
        targetRegistry: validatedManifest.targetRegistry,
        targetEnvironment: validatedManifest.targetEnvironment,
        projectId: validatedManifest.projectId,
        pageId: validatedManifest.pageId,
        signal: this.signal,
        isCurrent: this.isCurrent,
      });
      this.assertActive();
      operations.push(operationResult);
      if (this.strict && operationResult.status === 'error') break;
    }

    releaseSet.add(validatedManifest.releaseId);
    return this.finishReport(validatedManifest, startedAt, operations, false, source.compatibility, source.snapshot);
  }

  async start(): Promise<RuntimeStartResult> {
    this.assertActive();
    const startedAt = new Date().toISOString();
    if (this.version === undefined && !this.variantToken && !this.experimentToken) {
      return nativePageReport('NO_VARIANT_TOKEN', startedAt);
    }
    if (this.waitForDom) await domReady(this.document, this.signal);
    this.assertActive();
    const selection = await this.loadManifest();
    this.assertActive();
    if (!selection) return nativePageReport('VARIANT_UNAVAILABLE', startedAt);
    if (isExperimentSelection(selection)) {
      this.analyticsContext = selection;
      let result: RuntimeStartResult;
      if (selection.manifest) {
        result = await this.applyManifest(selection.manifest);
      } else {
        result = nativePageReport('NATIVE_VARIANT', startedAt, selection);
      }
      await this.queueOrSendExposure();
      this.assertActive();
      return result;
    }
    if (isNativeVariantSelection(selection)) {
      return nativePageReport('NATIVE_VARIANT', startedAt, selection);
    }
    return this.applyManifest(selection);
  }

  async track(name: string, properties: Record<string, unknown> = {}): Promise<TrackEventResult> {
    this.assertActive();
    const event = requireAnalyticsEvent(name, properties);
    if (!this.analyticsContext) return { accepted: false, code: 'NO_ACTIVE_EXPERIMENT' };
    if (this.analyticsConsent === 'pending') return { accepted: false, code: 'CONSENT_REQUIRED' };
    if (this.analyticsConsent === 'denied') return { accepted: false, code: 'CONSENT_DENIED' };
    return this.sendEvent('conversion', event.name, event.properties);
  }

  async consent(value: Exclude<AnalyticsConsent, 'pending'>): Promise<void> {
    this.assertActive();
    if (value !== 'granted' && value !== 'denied') throw new Error('Lykar consent must be granted or denied');
    this.analyticsConsent = value;
    if (value === 'denied') {
      this.pendingExposure = false;
      return;
    }
    if (this.pendingExposure) await this.queueOrSendExposure();
  }

  private finishReport(
    manifest: PublishedManifestV1,
    startedAt: string,
    operations: OperationApplyResult[],
    alreadyApplied: boolean,
    compatibility: ApplyReport['compatibility'],
    sourceSnapshot?: SourceSnapshotV1,
  ): ApplyReport {
    this.assertActive();
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
      this.assertActive();
      this.onReport?.(report);
    } catch {
      // Reporting hooks must not change DOM replay semantics.
    }
    return report;
  }

  private async queueOrSendExposure(): Promise<void> {
    this.assertActive();
    if (this.exposureSent || !this.analyticsContext) return;
    if (this.analyticsConsent === 'pending') {
      this.pendingExposure = true;
      return;
    }
    if (this.analyticsConsent === 'denied') return;
    const result = await this.sendEvent('exposure', '$exposure', {});
    this.assertActive();
    if (result.accepted) {
      this.exposureSent = true;
      this.pendingExposure = false;
    }
  }

  private async sendEvent(
    eventType: 'exposure' | 'conversion',
    name: string,
    properties: AnalyticsProperties,
  ): Promise<TrackEventResult> {
    this.assertActive();
    if (!this.analyticsContext || !this.fetcher) return { accepted: false, code: 'NO_ACTIVE_EXPERIMENT' };
    const result = await sendAnalyticsEvent({
      apiBaseUrl: this.apiBaseUrl,
      capability: this.analyticsContext.capability,
      eventType,
      name,
      properties,
      credentials: this.credentials,
      signal: this.signal,
      fetch: this.fetcher,
    });
    this.assertActive();
    return result;
  }

  private async applyOperationWithRetry(
    operation: PublishedManifestV1['operations'][number],
    options: Parameters<typeof applyOperation>[2],
  ): Promise<OperationApplyResult> {
    const deadline = Date.now() + this.targetRetryMs;
    let result = await applyOperation(this.document, operation, options);
    while (
      result.status === 'skipped'
      && result.code === 'TARGET_NOT_FOUND'
      && Date.now() < deadline
    ) {
      await abortableDelay(Math.min(this.targetRetryIntervalMs, Math.max(0, deadline - Date.now())), this.signal);
      this.assertActive();
      result = await applyOperation(this.document, operation, options);
    }
    return result;
  }

  private assertActive(): void {
    if (this.signal?.aborted || this.isCurrent?.() === false) {
      const error = new Error('Runtime lifecycle generation is no longer current.');
      error.name = 'AbortError';
      throw error;
    }
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

export function track(name: string, properties: Record<string, unknown> = {}): Promise<TrackEventResult> {
  if (!activeRuntime) return Promise.resolve({ accepted: false, code: 'NO_ACTIVE_EXPERIMENT' });
  return activeRuntime.track(name, properties);
}

export function consent(value: Exclude<AnalyticsConsent, 'pending'>): Promise<void> {
  if (!activeRuntime) return Promise.resolve();
  return activeRuntime.consent(value);
}

function isExperimentSelection(
  selection: RuntimeSelection,
): selection is ExperimentRuntimeSelection {
  return selection !== null && 'mode' in selection && selection.mode === 'experiment';
}

function isNativeVariantSelection(
  selection: RuntimeSelection,
): selection is Extract<RuntimeSelection, { mode: 'native-variant' }> {
  return selection !== null && 'mode' in selection && selection.mode === 'native-variant';
}

function getReleaseSet(root: Document | Element): Set<string> {
  let releases = appliedReleases.get(root);
  if (!releases) {
    releases = new Set();
    appliedReleases.set(root, releases);
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

function experimentTokenFromLocation(document: Document): string | undefined {
  const value = document.defaultView?.location
    ? new URLSearchParams(document.defaultView.location.search).get('lykar_experiment')
    : null;
  return value?.trim() || undefined;
}

function requireAnalyticsEvent(
  name: string,
  properties: Record<string, unknown>,
): { name: string; properties: AnalyticsProperties } {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
    throw new Error('Lykar event name must contain between 1 and 120 characters');
  }
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    throw new Error('Lykar event properties must be an object');
  }
  if (Object.keys(properties).length > 20) throw new Error('Lykar event properties must contain at most 20 keys');
  const sanitized: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!key.trim() || key.length > 64) throw new Error('Lykar event property names must contain between 1 and 64 characters');
    if (typeof value === 'string') {
      if (value.length > 256) throw new Error(`Lykar event property ${key} is too long`);
      sanitized[key] = value;
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Lykar event property ${key} must be finite`);
      sanitized[key] = value;
    } else if (typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
    } else {
      throw new Error(`Lykar event property ${key} must be a scalar value`);
    }
  }
  return { name: name.trim(), properties: sanitized };
}

async function sourceCompatibilityFor(
  document: Document,
  root: Document | Element,
  manifest: PublishedManifestV1,
): Promise<{ compatibility: ApplyReport['compatibility']; snapshot?: SourceSnapshotV1 }> {
  const baseline = await cleanSourceBaseline(document, root);
  const common = { basis: 'structural' as const, visualStatus: 'unknown' as const };
  if (!baseline) return {
    compatibility: {
      ...common,
      status: 'unknown',
      baseline: 'unavailable',
      ...(manifest.sourceSnapshot ? { expectedPageHash: manifest.sourceSnapshot.pageHash } : {}),
    },
  };
  if (!manifest.sourceSnapshot) return {
    compatibility: { ...common, status: 'unknown', baseline: 'clean' },
    snapshot: baseline,
  };
  return {
    compatibility: {
      ...common,
      status: baseline.pageHash === manifest.sourceSnapshot.pageHash ? 'compatible' : 'drifted',
      baseline: 'clean',
      expectedPageHash: manifest.sourceSnapshot.pageHash,
      actualPageHash: baseline.pageHash,
    },
    snapshot: baseline,
  };
}

function cleanSourceBaseline(document: Document, root: Document | Element): Promise<SourceSnapshotV1 | null> {
  const existing = sourceBaselines.get(root);
  if (existing) return existing;

  const wasAlreadyMutated = (appliedReleases.get(root)?.size ?? 0) > 0
    || root.querySelector('[data-lykar-operation-id]') !== null;
  const baseline = wasAlreadyMutated
    ? Promise.resolve(null)
    : captureSourceSnapshot(document, root).catch(() => null);
  sourceBaselines.set(root, baseline);
  return baseline;
}

function nativePageReport(
  reason: NativePageReport['reason'],
  startedAt: string,
  selection?: Extract<RuntimeSelection, { mode: 'native-variant' | 'experiment' }>,
): NativePageReport {
  return {
    mode: 'native',
    reason,
    ...(selection ? { experimentId: selection.experimentId, variantKey: selection.variantKey } : {}),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function domReady(document: Document, signal?: AbortSignal): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ready = () => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    };
    const aborted = () => {
      document.removeEventListener('DOMContentLoaded', ready);
      reject(abortError());
    };
    document.addEventListener('DOMContentLoaded', ready, { once: true, signal });
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, {once: true});
  });
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const aborted = () => {
      globalThis.clearTimeout(timer);
      reject(abortError());
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    signal?.addEventListener('abort', aborted, {once: true});
  });
}

function abortError(): Error {
  const error = new Error('Runtime lifecycle was aborted.');
  error.name = 'AbortError';
  return error;
}

function boundedDuration(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 60_000) {
    throw new Error(`Lykar ${name} must be between 0 and 60000 milliseconds`);
  }
  return value;
}
