import { parsePublishedManifestV1 } from '@lykar/protocol';
import type { PublishedManifestV1 } from '@lykar/protocol';

import { applyOperation } from './dom-executor.js';
import { fetchManifest } from './manifest-client.js';
import type {
  ApplyManifestOptions,
  ApplyReport,
  FetchLike,
  LykarRuntimeConstructorOptions,
  LykarRuntimeOptions,
  OperationApplyResult,
} from './types.js';

const appliedReleases = new WeakMap<Document, Set<string>>();
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export class Lykar {
  readonly projectKey: string;
  readonly apiBaseUrl: string;
  readonly version?: number;
  readonly environment?: string;
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
    if (options.environment !== undefined && !ENVIRONMENT_PATTERN.test(options.environment)) {
      throw new Error('Lykar environment is invalid');
    }

    const document = options.document ?? globalThis.document;
    if (!document) throw new Error('Lykar runtime requires a browser document');

    const globalFetch = globalThis.fetch;
    this.projectKey = options.projectKey.trim();
    this.apiBaseUrl = options.apiBaseUrl ?? '';
    this.version = options.version ?? versionFromLocation(document);
    this.environment = options.environment;
    this.credentials = options.credentials;
    this.document = document;
    this.fetcher = options.fetch ?? (globalFetch ? globalFetch.bind(globalThis) : undefined);
    this.strict = options.strict ?? false;
    this.waitForDom = options.waitForDom ?? true;
    this.onReport = options.onReport;
  }

  async loadManifest(): Promise<PublishedManifestV1> {
    if (!this.fetcher) throw new Error('Lykar runtime requires fetch to load a manifest');

    return fetchManifest({
      projectKey: this.projectKey,
      apiBaseUrl: this.apiBaseUrl,
      version: this.version,
      environment: this.environment,
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

    if (!options.force && releaseSet.has(validatedManifest.releaseId)) {
      const operations = validatedManifest.operations.map<OperationApplyResult>(operation => ({
        operationId: operation.id,
        kind: operation.kind,
        status: 'skipped',
        code: 'RELEASE_ALREADY_APPLIED',
        message: 'This release was already applied to the document',
      }));
      return this.finishReport(validatedManifest, startedAt, operations, true);
    }

    const operations: OperationApplyResult[] = [];
    for (const operation of validatedManifest.operations) {
      const operationResult = await applyOperation(this.document, operation);
      operations.push(operationResult);
      if (this.strict && operationResult.status === 'error') break;
    }

    releaseSet.add(validatedManifest.releaseId);
    return this.finishReport(validatedManifest, startedAt, operations, false);
  }

  async start(): Promise<ApplyReport> {
    if (this.waitForDom) await domReady(this.document);
    const manifest = await this.loadManifest();
    return this.applyManifest(manifest);
  }

  private finishReport(
    manifest: PublishedManifestV1,
    startedAt: string,
    operations: OperationApplyResult[],
    alreadyApplied: boolean,
  ): ApplyReport {
    const report: ApplyReport = {
      projectId: manifest.projectId,
      releaseId: manifest.releaseId,
      version: manifest.version,
      startedAt,
      finishedAt: new Date().toISOString(),
      applied: operations.filter(operation => operation.status === 'applied').length,
      skipped: operations.filter(operation => operation.status === 'skipped').length,
      errors: operations.filter(operation => operation.status === 'error').length,
      alreadyApplied,
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

export { Lykar as LykarRuntime };

export function init(
  projectKey: string,
  options?: LykarRuntimeConstructorOptions,
): Promise<ApplyReport>;
export function init(options: LykarRuntimeOptions): Promise<ApplyReport>;
export function init(
  projectKeyOrOptions: string | LykarRuntimeOptions,
  options?: LykarRuntimeConstructorOptions,
): Promise<ApplyReport> {
  return typeof projectKeyOrOptions === 'string'
    ? new Lykar(projectKeyOrOptions, options).start()
    : new Lykar(projectKeyOrOptions).start();
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

function domReady(document: Document): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(resolve => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
}
