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

const appliedReleases = new WeakMap<Document, Set<string>>();
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
  private readonly fetcher?: FetchLike;
  private readonly strict: boolean;
  private readonly waitForDom: boolean;
  private readonly onReport?: (report: ApplyReport) => void;
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
    this.fetcher = options.fetch ?? (globalFetch ? globalFetch.bind(globalThis) : undefined);
    this.strict = options.strict ?? false;
    this.waitForDom = options.waitForDom ?? true;
    this.onReport = options.onReport;
    this.analyticsConsent = options.analyticsConsent ?? 'pending';
    activeRuntime = this;
  }

  async loadManifest(): Promise<RuntimeSelection> {
    if (!this.fetcher) throw new Error('Lykar runtime requires fetch to load a manifest');

    if (this.version === undefined && !this.variantToken && this.experimentToken) {
      return resolveExperimentSelection({
        projectKey: this.projectKey,
        apiBaseUrl: this.apiBaseUrl,
        pathname: this.pathname,
        experimentToken: this.experimentToken,
        document: this.document,
        credentials: this.credentials,
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
    if (this.version === undefined && !this.variantToken && !this.experimentToken) {
      return nativePageReport('NO_VARIANT_TOKEN', startedAt);
    }
    if (this.waitForDom) await domReady(this.document);
    const selection = await this.loadManifest();
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
      return result;
    }
    if (isNativeVariantSelection(selection)) {
      return nativePageReport('NATIVE_VARIANT', startedAt, selection);
    }
    return this.applyManifest(selection);
  }

  async track(name: string, properties: Record<string, unknown> = {}): Promise<TrackEventResult> {
    const event = requireAnalyticsEvent(name, properties);
    if (!this.analyticsContext) return { accepted: false, code: 'NO_ACTIVE_EXPERIMENT' };
    if (this.analyticsConsent === 'pending') return { accepted: false, code: 'CONSENT_REQUIRED' };
    if (this.analyticsConsent === 'denied') return { accepted: false, code: 'CONSENT_DENIED' };
    return this.sendEvent('conversion', event.name, event.properties);
  }

  async consent(value: Exclude<AnalyticsConsent, 'pending'>): Promise<void> {
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

  private async queueOrSendExposure(): Promise<void> {
    if (this.exposureSent || !this.analyticsContext) return;
    if (this.analyticsConsent === 'pending') {
      this.pendingExposure = true;
      return;
    }
    if (this.analyticsConsent === 'denied') return;
    const result = await this.sendEvent('exposure', '$exposure', {});
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
    if (!this.analyticsContext || !this.fetcher) return { accepted: false, code: 'NO_ACTIVE_EXPERIMENT' };
    return sendAnalyticsEvent({
      apiBaseUrl: this.apiBaseUrl,
      capability: this.analyticsContext.capability,
      eventType,
      name,
      properties,
      credentials: this.credentials,
      fetch: this.fetcher,
    });
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

function domReady(document: Document): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}
