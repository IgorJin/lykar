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

export class UnauthorizedError extends VersioningError {
  constructor(message = 'Authentication is required') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends VersioningError {
  constructor(message = 'This account cannot access the requested resource') {
    super(message, 'FORBIDDEN', 403);
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
  createdBy: string | null;
  createdAt: string;
};

export type PageRecord = {
  id: string;
  projectId: string;
  name: string;
  pathname: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DraftRecord = {
  id: string;
  projectId: string;
  pageId: string;
  baseReleaseId: string | null;
  publishedReleaseId: string | null;
  status: 'open' | 'published' | 'abandoned';
  revision: number;
  createdBy: string | null;
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
  pageId: string;
  version: number;
  baseReleaseId: string | null;
  manifestHash: string;
  operationCount: number;
  publishedBy: string | null;
  createdAt: string;
};

export type PublishResult = {
  draft: DraftRecord;
  release: ReleaseRecord;
  environment: string;
};

export type ActivationResult = {
  projectId: string;
  pageId: string;
  environment: string;
  previousReleaseId: string | null;
  releaseId: string;
  activatedBy: string | null;
};

export type RuntimeManifest = PublishedManifestV1;

export interface VersioningRepository {
  createProject(input: {
    id: string;
    ownerUserId: string;
    name: string;
    publicKey: string;
    origins: Array<{ id: string; origin: string }>;
    rootPage: { id: string; name: string; pathname: '/'; environmentId: string };
  }): Promise<ProjectRecord>;
  listProjects(userId: string): Promise<ProjectRecord[]>;
  createPage(input: {
    id: string;
    userId: string;
    projectId: string;
    name: string;
    pathname: string;
    environmentId: string;
  }): Promise<PageRecord>;
  listPages(userId: string, projectId: string): Promise<PageRecord[]>;
  createDraft(input: { id: string; userId: string; pageId: string; baseReleaseId?: string }): Promise<DraftRecord>;
  listDrafts(userId: string, pageId: string, status?: DraftRecord['status']): Promise<DraftRecord[]>;
  getDraft(userId: string, draftId: string): Promise<DraftDetails>;
  appendOperations(input: {
    userId: string;
    draftId: string;
    expectedRevision: number;
    operations: OperationV1[];
  }): Promise<AppendOperationsResult>;
  publishDraft(input: {
    userId: string;
    draftId: string;
    expectedRevision: number;
    environment: string;
    releaseId: string;
    environmentId: string;
    activationId: string;
  }): Promise<PublishResult>;
  activateRelease(input: {
    userId: string;
    pageId: string;
    releaseId: string;
    environment: string;
    environmentId: string;
    activationId: string;
  }): Promise<ActivationResult>;
  listReleases(userId: string, pageId: string): Promise<ReleaseRecord[]>;
  resolveRuntimeManifest(input: {
    publicKey: string;
    pathname: string;
    version?: number;
    environment: string;
  }): Promise<RuntimeManifest>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError(`${field} must be a UUID`);
  }
  return value;
}

function requireName(value: unknown, field = 'name'): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ValidationError(`${field} must contain between 1 and 120 characters`);
  }
  return value.trim();
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

export function normalizePathname(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new ValidationError('pathname must start with /');
  }
  if (value.includes('?') || value.includes('#') || value.includes('\\')) {
    throw new ValidationError('pathname must not contain query, hash, or backslashes');
  }
  const normalized = value.replace(/\/{2,}/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : '/';
}

export function normalizeProjectOrigin(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('Every project origin must be a string');

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

  async createProject(userIdValue: unknown, nameValue: unknown, originsValue: unknown): Promise<ProjectRecord> {
    const ownerUserId = requireUuid(userIdValue, 'userId');
    const name = requireName(nameValue);
    if (!Array.isArray(originsValue) || originsValue.length === 0 || originsValue.length > 20) {
      throw new ValidationError('origins must contain between 1 and 20 entries');
    }
    const origins = [...new Set(originsValue.map(normalizeProjectOrigin))];

    return this.repository.createProject({
      id: randomUUID(),
      ownerUserId,
      name,
      publicKey: `pk_${randomBytes(18).toString('base64url')}`,
      origins: origins.map(origin => ({ id: randomUUID(), origin })),
      rootPage: { id: randomUUID(), name: 'Home', pathname: '/', environmentId: randomUUID() },
    });
  }

  listProjects(userIdValue: unknown): Promise<ProjectRecord[]> {
    return this.repository.listProjects(requireUuid(userIdValue, 'userId'));
  }

  createPage(userIdValue: unknown, projectIdValue: unknown, nameValue: unknown, pathnameValue: unknown): Promise<PageRecord> {
    return this.repository.createPage({
      id: randomUUID(),
      userId: requireUuid(userIdValue, 'userId'),
      projectId: requireUuid(projectIdValue, 'projectId'),
      name: requireName(nameValue),
      pathname: normalizePathname(pathnameValue),
      environmentId: randomUUID(),
    });
  }

  listPages(userIdValue: unknown, projectIdValue: unknown): Promise<PageRecord[]> {
    return this.repository.listPages(
      requireUuid(userIdValue, 'userId'),
      requireUuid(projectIdValue, 'projectId'),
    );
  }

  createDraft(userIdValue: unknown, pageIdValue: unknown, baseReleaseIdValue?: unknown): Promise<DraftRecord> {
    const baseReleaseId = baseReleaseIdValue === undefined || baseReleaseIdValue === null
      ? undefined
      : requireUuid(baseReleaseIdValue, 'baseReleaseId');
    return this.repository.createDraft({
      id: randomUUID(),
      userId: requireUuid(userIdValue, 'userId'),
      pageId: requireUuid(pageIdValue, 'pageId'),
      baseReleaseId,
    });
  }

  listDrafts(userIdValue: unknown, pageIdValue: unknown, statusValue?: unknown): Promise<DraftRecord[]> {
    let status: DraftRecord['status'] | undefined;
    if (statusValue !== undefined) {
      if (statusValue !== 'open' && statusValue !== 'published' && statusValue !== 'abandoned') {
        throw new ValidationError('status must be open, published, or abandoned');
      }
      status = statusValue;
    }
    return this.repository.listDrafts(
      requireUuid(userIdValue, 'userId'),
      requireUuid(pageIdValue, 'pageId'),
      status,
    );
  }

  getDraft(userIdValue: unknown, draftIdValue: unknown): Promise<DraftDetails> {
    return this.repository.getDraft(
      requireUuid(userIdValue, 'userId'),
      requireUuid(draftIdValue, 'draftId'),
    );
  }

  appendOperations(
    userIdValue: unknown,
    draftIdValue: unknown,
    expectedRevisionValue: unknown,
    operationsValue: unknown,
  ): Promise<AppendOperationsResult> {
    const operations: OperationV1[] = [];
    const operationIds = new Set<string>();
    if (!Array.isArray(operationsValue) || operationsValue.length === 0 || operationsValue.length > 100) {
      throw new ValidationError('operations must contain between 1 and 100 entries');
    }
    operationsValue.forEach((operation, index) => {
      const result = validateOperationV1(operation);
      if (!result.ok) throw new ValidationError(`operations[${index}] is invalid`, result.errors);
      if (operationIds.has(result.value.id)) {
        throw new ValidationError(`Duplicate operation id in request: ${result.value.id}`);
      }
      operationIds.add(result.value.id);
      operations.push(result.value);
    });

    return this.repository.appendOperations({
      userId: requireUuid(userIdValue, 'userId'),
      draftId: requireUuid(draftIdValue, 'draftId'),
      expectedRevision: requireRevision(expectedRevisionValue),
      operations,
    });
  }

  publishDraft(
    userIdValue: unknown,
    draftIdValue: unknown,
    expectedRevisionValue: unknown,
    environmentValue?: unknown,
  ): Promise<PublishResult> {
    return this.repository.publishDraft({
      userId: requireUuid(userIdValue, 'userId'),
      draftId: requireUuid(draftIdValue, 'draftId'),
      expectedRevision: requireRevision(expectedRevisionValue),
      environment: requireEnvironment(environmentValue),
      releaseId: randomUUID(),
      environmentId: randomUUID(),
      activationId: randomUUID(),
    });
  }

  activateRelease(
    userIdValue: unknown,
    pageIdValue: unknown,
    releaseIdValue: unknown,
    environmentValue?: unknown,
  ): Promise<ActivationResult> {
    return this.repository.activateRelease({
      userId: requireUuid(userIdValue, 'userId'),
      pageId: requireUuid(pageIdValue, 'pageId'),
      releaseId: requireUuid(releaseIdValue, 'releaseId'),
      environment: requireEnvironment(environmentValue),
      environmentId: randomUUID(),
      activationId: randomUUID(),
    });
  }

  listReleases(userIdValue: unknown, pageIdValue: unknown): Promise<ReleaseRecord[]> {
    return this.repository.listReleases(
      requireUuid(userIdValue, 'userId'),
      requireUuid(pageIdValue, 'pageId'),
    );
  }

  resolveRuntimeManifest(
    publicKeyValue: unknown,
    pathnameValue: unknown,
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
      pathname: normalizePathname(pathnameValue),
      version,
      environment: requireEnvironment(environmentValue),
    });
  }
}
