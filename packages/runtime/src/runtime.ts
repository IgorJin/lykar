import {parsePublishedManifestV1, PROTOCOL_LIMITS} from '@lykar/protocol';
import type { PublishedManifestV1, SourceSnapshotV1 } from '@lykar/protocol';

import {applyOperation, assertOperationPayloadSafe} from './dom-executor.js';
import { captureSourceSnapshot } from './dom-fingerprint.js';
import {MutationJournal} from './mutation-journal.js';
import type {CompensationDiagnostic, JournalEntrySnapshot} from './mutation-journal.js';
import {ReplayLedger} from './replay-ledger.js';
import { resolveExperimentSelection, sendAnalyticsEvent } from './analytics-client.js';
import { fetchManifest } from './manifest-client.js';
import { visitorTokensFromLocation } from './visitor-url.js';
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
  private readonly targetRetryLimit: number;
  private readonly maxReplayMs: number;
  private readonly maxManifestBytes: number;
  private readonly maxOperations: number;
  private readonly generation?: number;
  private readonly draftId?: string;
  private readonly registerCleanup?: (cleanup: () => void) => () => void;
  private readonly journal: MutationJournal;
  private readonly compensationDiagnostics: CompensationDiagnostic[] = [];
  private readonly ownedReleaseIds = new Set<string>();
  private cleanupRegistered = false;
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
    const locationTokens = visitorTokensFromLocation(document);
    this.version = options.version ?? versionFromLocation(document);
    this.variantToken = options.variantToken ?? locationTokens.variant;
    this.experimentToken = options.experimentToken ?? locationTokens.experiment;
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
    this.targetRetryLimit = boundedInteger(options.targetRetryLimit ?? 20, 'targetRetryLimit', 0, 1_000);
    this.maxReplayMs = boundedInteger(options.maxReplayMs ?? 2_000, 'maxReplayMs', 1, 60_000);
    this.maxManifestBytes = boundedInteger(
      options.maxManifestBytes ?? PROTOCOL_LIMITS.manifestBytes,
      'maxManifestBytes',
      1,
      PROTOCOL_LIMITS.manifestBytes,
    );
    this.maxOperations = boundedInteger(
      options.maxOperations ?? PROTOCOL_LIMITS.operations,
      'maxOperations',
      1,
      PROTOCOL_LIMITS.operations,
    );
    this.generation = options.generation;
    this.draftId = options.draftId;
    this.registerCleanup = options.registerCleanup;
    this.journal = new MutationJournal(diagnostic => {
      this.compensationDiagnostics.push(diagnostic);
      try { options.onDiagnostic?.(diagnostic); } catch { /* Diagnostic hooks do not affect replay. */ }
    });
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
    this.assertManifestLimitsAndSafety(validatedManifest);
    const startedAt = new Date().toISOString();
    const replayStartedAt = Date.now();
    const releaseSet = getReleaseSet(this.root);
    const source = await sourceCompatibilityFor(this.document, this.root, validatedManifest);
    this.assertActive();
    const journalCheckpoint = this.journal.checkpoint();
    const diagnosticCheckpoint = this.compensationDiagnostics.length;

    if (!options.force && releaseSet.has(validatedManifest.releaseId)) {
      const operations = validatedManifest.operations.map<OperationApplyResult>(operation => ({
        operationId: operation.id,
        kind: operation.kind,
        target: operation.target,
        status: 'skipped',
        code: 'RELEASE_ALREADY_APPLIED',
        message: 'This release was already applied to the document',
      }));
      return this.finishReport(
        validatedManifest,
        startedAt,
        operations,
        true,
        source.compatibility,
        source.snapshot,
        [],
        [],
      );
    }

    this.ensureJournalCleanup();
    const ledger = new ReplayLedger(this.document, this.root, {
      projectId: validatedManifest.projectId,
      pageId: validatedManifest.pageId,
      releaseId: validatedManifest.releaseId,
      ...(this.draftId ? {draftId: this.draftId} : {}),
      ...(this.generation !== undefined ? {generation: this.generation} : {}),
    });
    const operations: OperationApplyResult[] = [];
    const outcomes = new Map<string, OperationApplyResult>();
    let timedOut = false;
    for (let index = 0; index < validatedManifest.operations.length; index += 1) {
      const operation = validatedManifest.operations[index];
      if (Date.now() - replayStartedAt >= this.maxReplayMs) {
        timedOut = true;
        appendReplayLimitResults(validatedManifest.operations.slice(index), operations, outcomes);
        break;
      }

      const unavailable = (operation.dependsOn ?? []).find(dependency => !dependencyAvailable(outcomes.get(dependency)));
      if (unavailable) {
        const operationResult: OperationApplyResult = {
          operationId: operation.id,
          kind: operation.kind,
          target: operation.target,
          status: 'skipped',
          code: 'DEPENDENCY_UNAVAILABLE',
          message: `Dependency ${unavailable} did not complete successfully`,
        };
        operations.push(operationResult);
        outcomes.set(operation.id, operationResult);
        continue;
      }

      const operationResult = await this.applyOperationWithRetry(operation, {
        root: this.root,
        targetRegistry: validatedManifest.targetRegistry,
        targetEnvironment: validatedManifest.targetEnvironment,
        projectId: validatedManifest.projectId,
        pageId: validatedManifest.pageId,
        signal: this.signal,
        isCurrent: this.isCurrent,
        ledger,
        journal: this.journal,
      });
      this.assertActive();
      operations.push(operationResult);
      outcomes.set(operation.id, operationResult);
      if (this.strict && operationResult.status === 'error') break;
      if (Date.now() - replayStartedAt >= this.maxReplayMs) {
        timedOut = true;
        appendReplayLimitResults(validatedManifest.operations.slice(index + 1), operations, outcomes);
        break;
      }
    }

    if (timedOut) {
      const compensation = this.journal.compensateFrom(journalCheckpoint);
      markReplayCompensated(operations, compensation);
    } else {
      releaseSet.add(validatedManifest.releaseId);
      this.ownedReleaseIds.add(validatedManifest.releaseId);
    }
    return this.finishReport(
      validatedManifest,
      startedAt,
      operations,
      false,
      source.compatibility,
      source.snapshot,
      this.journal.snapshots().slice(journalCheckpoint),
      this.compensationDiagnostics.slice(diagnosticCheckpoint),
    );
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
    journal: JournalEntrySnapshot[] = [],
    compensation: CompensationDiagnostic[] = [],
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
      journal,
      compensation,
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
    let retries = 0;
    let result = await applyOperation(this.document, operation, options);
    while (
      result.status === 'skipped'
      && result.code === 'TARGET_NOT_FOUND'
      && Date.now() < deadline
      && retries < this.targetRetryLimit
    ) {
      retries += 1;
      await waitForRootMutation(
        this.root,
        Math.min(this.targetRetryIntervalMs, Math.max(0, deadline - Date.now())),
        this.signal,
      );
      this.assertActive();
      result = await applyOperation(this.document, operation, options);
    }
    return result;
  }

  private assertManifestLimitsAndSafety(manifest: PublishedManifestV1): void {
    const bytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
    if (bytes > this.maxManifestBytes) {
      throw new Error(`Lykar manifest exceeds the configured ${this.maxManifestBytes} byte limit`);
    }
    if (manifest.operations.length > this.maxOperations) {
      throw new Error(`Lykar manifest exceeds the configured ${this.maxOperations} operation limit`);
    }
    for (const operation of manifest.operations) {
      try {
        assertOperationPayloadSafe(this.document, operation);
      } catch (error) {
        throw new Error(`Unsafe Lykar operation ${operation.id}: ${errorMessage(error)}`);
      }
    }
  }

  private ensureJournalCleanup(): void {
    if (this.cleanupRegistered || !this.registerCleanup) return;
    this.cleanupRegistered = true;
    this.registerCleanup(() => {
      this.journal.compensateAll();
      const releases = getReleaseSet(this.root);
      for (const releaseId of this.ownedReleaseIds) releases.delete(releaseId);
      this.ownedReleaseIds.clear();
      this.cleanupRegistered = false;
    });
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

function dependencyAvailable(result: OperationApplyResult | undefined): boolean {
  return result?.status === 'applied'
    || (result?.status === 'skipped' && result.code === 'OPERATION_ALREADY_APPLIED');
}

function appendReplayLimitResults(
  pending: PublishedManifestV1['operations'],
  results: OperationApplyResult[],
  outcomes: Map<string, OperationApplyResult>,
): void {
  for (const operation of pending) {
    const result: OperationApplyResult = {
      operationId: operation.id,
      kind: operation.kind,
      target: operation.target,
      status: 'skipped',
      code: 'REPLAY_TIME_LIMIT',
      message: 'Replay exceeded its configured time budget',
    };
    results.push(result);
    outcomes.set(operation.id, result);
  }
}

function markReplayCompensated(
  operations: OperationApplyResult[],
  diagnostics: CompensationDiagnostic[],
): void {
  const byOperation = new Map<string, CompensationDiagnostic>();
  for (const diagnostic of diagnostics) byOperation.set(diagnostic.operationId, diagnostic);
  for (const operation of operations) {
    if (operation.status !== 'applied') continue;
    const diagnostic = byOperation.get(operation.operationId);
    if (!diagnostic) continue;
    operation.compensation = diagnostic;
    operation.status = diagnostic.status === 'restored' ? 'skipped' : 'error';
    operation.code = diagnostic.status === 'restored' ? 'REPLAY_COMPENSATED' : diagnostic.code;
    operation.message = diagnostic.message;
  }
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

function waitForRootMutation(root: Document | Element, ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const document = root.nodeType === 9 ? root as Document : root.ownerDocument!;
    const Observer = document.defaultView?.MutationObserver;
    let observer: MutationObserver | undefined;
    const finish = () => {
      globalThis.clearTimeout(timer);
      observer?.disconnect();
      signal?.removeEventListener('abort', aborted);
      resolve();
    };
    const aborted = () => {
      globalThis.clearTimeout(timer);
      observer?.disconnect();
      reject(abortError());
    };
    const timer = globalThis.setTimeout(finish, ms);
    if (Observer) {
      observer = new Observer(records => {
        if (records.some(record => !lykarOwnedMutation(record))) finish();
      });
      observer.observe(root.nodeType === 9 ? document.documentElement : root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    }
    signal?.addEventListener('abort', aborted, {once: true});
  });
}

function lykarOwnedMutation(record: MutationRecord): boolean {
  const serviceSelector = '[data-lykar-operation-id],[data-lykar-node-id],[data-lykar-editor-root]';
  if (record.target.nodeType === 1 && (record.target as Element).closest(serviceSelector)) return true;
  if (record.target.nodeType === 8 && record.target.nodeValue?.startsWith('lykar-')) return true;
  const changed = [...record.addedNodes, ...record.removedNodes];
  return changed.length > 0 && changed.every(node => (
    (node.nodeType === 1 && ((node as Element).matches(serviceSelector) || (node as Element).closest(serviceSelector)))
    || (node.nodeType === 8 && node.nodeValue?.startsWith('lykar-'))
  ));
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

function boundedInteger(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Lykar ${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
