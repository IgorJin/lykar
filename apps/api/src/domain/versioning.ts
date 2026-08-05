import { randomBytes, randomUUID } from 'node:crypto';

import { validateOperationV1 } from '@lykar/protocol';
import type { OperationV1, PublishedManifestV1 } from '@lykar/protocol';

export const DEFAULT_ENVIRONMENT = 'production';

export class VersioningError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'VersioningError';
  }
}

export class ValidationError extends VersioningError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends VersioningError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends VersioningError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFLICT', 409, details);
  }
}

export type ProjectRecord = {
  id: string;
  name: string;
  publicKey: string;
  origins: string[];
  createdAt: string;
};

export type DraftRecord = {
  id: string;
  projectId: string;
  baseReleaseId: string | null;
  publishedReleaseId: string | null;
  status: 'open' | 'published' | 'abandoned';
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type AppendOperationsResult = {
  draftId: string;
  revision: number;
  appended: number;
};

export type DraftDetails = {
  draft: DraftRecord;
  operations: OperationV1[];
};

export type ReleaseRecord = {
  id: string;
  projectId: string;
  version: number;
  baseReleaseId: string | null;
  manifestHash: string;
  operationCount: number;
  createdAt: string;
};

export type PublishResult = {
  draft: DraftRecord;
  release: ReleaseRecord;
  environment: string;
};

export type ActivationResult = {
  projectId: string;
  environment: string;
  previousReleaseId: string | null;
  releaseId: string;
};

export type RuntimeManifest = PublishedManifestV1;

export interface VersioningRepository {
  createProject(input: {
    id: string;
    name: string;
    publicKey: string;
    origins: Array<{ id: string; origin: string }>;
    environmentId: string;
  }): Promise<ProjectRecord>;

  listProjects(): Promise<ProjectRecord[]>;

  createDraft(input: {
    id: string;
    projectId: string;
    baseReleaseId?: string;
  }): Promise<DraftRecord>;

  listDrafts(projectId: string, status?: DraftRecord['status']): Promise<DraftRecord[]>;

  getDraft(draftId: string): Promise<DraftDetails>;

  appendOperations(input: {
    draftId: string;
    expectedRevision: number;
    operations: OperationV1[];
  }): Promise<AppendOperationsResult>;

  publishDraft(input: {
    draftId: string;
    expectedRevision: number;
    environment: string;
    releaseId: string;
    environmentId: string;
    activationId: string;
  }): Promise<PublishResult>;

  activateRelease(input: {
    projectId: string;
    releaseId: string;
    environment: string;
    environmentId: string;
    activationId: string;
  }): Promise<ActivationResult>;

  listReleases(projectId: string): Promise<ReleaseRecord[]>;

  resolveRuntimeManifest(input: {
    publicKey: string;
    version?: number;
    environment: string;
  }): Promise<RuntimeManifest>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`${field} must be a UUID`);
  }
  return value;
}

function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ValidationError('expectedRevision must be a non-negative integer');
  }
  return value as number;
}

function requireEnvironment(value: unknown): string {
  const environment = value === undefined ? DEFAULT_ENVIRONMENT : value;
  if (typeof environment !== 'string' || !ENVIRONMENT_PATTERN.test(environment)) {
    throw new ValidationError('environment must start with a letter and contain only lowercase letters, digits, or hyphens');
  }
  return environment;
}

export function normalizeProjectOrigin(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Every project origin must be a string');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`Invalid project origin: ${value}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`Project origin must use http or https: ${value}`);
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new ValidationError(`Project origin must not contain credentials, path, query, or hash: ${value}`);
  }

  return url.origin;
}

export class VersioningService {
  constructor(private readonly repository: VersioningRepository) {}

  async createProject(nameValue: unknown, originsValue: unknown): Promise<ProjectRecord> {
    if (typeof nameValue !== 'string' || !nameValue.trim() || nameValue.trim().length > 120) {
      throw new ValidationError('name must contain between 1 and 120 characters');
    }
    if (!Array.isArray(originsValue) || originsValue.length === 0 || originsValue.length > 20) {
      throw new ValidationError('origins must contain between 1 and 20 entries');
    }

    const origins = [...new Set(originsValue.map(normalizeProjectOrigin))];

    return this.repository.createProject({
      id: randomUUID(),
      name: nameValue.trim(),
      publicKey: `pk_${randomBytes(18).toString('base64url')}`,
      origins: origins.map(origin => ({ id: randomUUID(), origin })),
      environmentId: randomUUID(),
    });
  }

  listProjects(): Promise<ProjectRecord[]> {
    return this.repository.listProjects();
  }

  createDraft(projectIdValue: unknown, baseReleaseIdValue?: unknown): Promise<DraftRecord> {
    const projectId = requireUuid(projectIdValue, 'projectId');
    const baseReleaseId = baseReleaseIdValue === undefined || baseReleaseIdValue === null
      ? undefined
      : requireUuid(baseReleaseIdValue, 'baseReleaseId');

    return this.repository.createDraft({ id: randomUUID(), projectId, baseReleaseId });
  }

  listDrafts(projectIdValue: unknown, statusValue?: unknown): Promise<DraftRecord[]> {
    const projectId = requireUuid(projectIdValue, 'projectId');
    let status: DraftRecord['status'] | undefined;

    if (statusValue !== undefined) {
      if (statusValue !== 'open' && statusValue !== 'published' && statusValue !== 'abandoned') {
        throw new ValidationError('status must be open, published, or abandoned');
      }
      status = statusValue;
    }

    return this.repository.listDrafts(projectId, status);
  }

  getDraft(draftIdValue: unknown): Promise<DraftDetails> {
    return this.repository.getDraft(requireUuid(draftIdValue, 'draftId'));
  }

  appendOperations(
    draftIdValue: unknown,
    expectedRevisionValue: unknown,
    operationsValue: unknown,
  ): Promise<AppendOperationsResult> {
    const draftId = requireUuid(draftIdValue, 'draftId');
    const expectedRevision = requireRevision(expectedRevisionValue);

    if (!Array.isArray(operationsValue) || operationsValue.length === 0 || operationsValue.length > 100) {
      throw new ValidationError('operations must contain between 1 and 100 entries');
    }

    const operations: OperationV1[] = [];
    const operationIds = new Set<string>();

    operationsValue.forEach((operation, index) => {
      const result = validateOperationV1(operation);
      if (!result.ok) {
        throw new ValidationError(`operations[${index}] is invalid`, result.errors);
      }
      if (operationIds.has(result.value.id)) {
        throw new ValidationError(`Duplicate operation id in request: ${result.value.id}`);
      }
      operationIds.add(result.value.id);
      operations.push(result.value);
    });

    return this.repository.appendOperations({ draftId, expectedRevision, operations });
  }

  publishDraft(
    draftIdValue: unknown,
    expectedRevisionValue: unknown,
    environmentValue?: unknown,
  ): Promise<PublishResult> {
    return this.repository.publishDraft({
      draftId: requireUuid(draftIdValue, 'draftId'),
      expectedRevision: requireRevision(expectedRevisionValue),
      environment: requireEnvironment(environmentValue),
      releaseId: randomUUID(),
      environmentId: randomUUID(),
      activationId: randomUUID(),
    });
  }

  activateRelease(
    projectIdValue: unknown,
    releaseIdValue: unknown,
    environmentValue?: unknown,
  ): Promise<ActivationResult> {
    return this.repository.activateRelease({
      projectId: requireUuid(projectIdValue, 'projectId'),
      releaseId: requireUuid(releaseIdValue, 'releaseId'),
      environment: requireEnvironment(environmentValue),
      environmentId: randomUUID(),
      activationId: randomUUID(),
    });
  }

  listReleases(projectIdValue: unknown): Promise<ReleaseRecord[]> {
    return this.repository.listReleases(requireUuid(projectIdValue, 'projectId'));
  }

  resolveRuntimeManifest(
    publicKeyValue: unknown,
    versionValue?: unknown,
    environmentValue?: unknown,
  ): Promise<RuntimeManifest> {
    if (typeof publicKeyValue !== 'string' || !publicKeyValue.startsWith('pk_')) {
      throw new ValidationError('publicKey is invalid');
    }

    let version: number | undefined;
    if (versionValue !== undefined) {
      const parsed = typeof versionValue === 'string' ? Number(versionValue) : versionValue;
      if (!Number.isSafeInteger(parsed) || (parsed as number) <= 0) {
        throw new ValidationError('version must be a positive integer');
      }
      version = parsed as number;
    }

    return this.repository.resolveRuntimeManifest({
      publicKey: publicKeyValue,
      version,
      environment: requireEnvironment(environmentValue),
    });
  }
}
