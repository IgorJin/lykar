import { createHash, randomUUID } from 'node:crypto';

import {
  normalizePathname, normalizeProjectOrigin, requireUuid, ValidationError,
  type RuntimeManifest,
} from './versioning';

export type DeploymentAction = 'deploy' | 'disable' | 'rollback';
export type DeploymentActivation = {
  id: string;
  pageId: string;
  revision: number;
  previousReleaseId: string | null;
  releaseId: string | null;
  action: DeploymentAction;
  reason: string;
  actorUserId: string;
  createdAt: string;
};
export type DeploymentState = {
  pageId: string;
  revision: number;
  activeReleaseId: string | null;
  activation: DeploymentActivation | null;
};
export type DeploymentResult = { deployment: DeploymentState; replayed: boolean };
export type DeploymentHistory = { activations: DeploymentActivation[]; nextBeforeRevision: number | null };
export type DeploymentResolution = {
  pageId: string;
  revision: number;
  activeReleaseId: string | null;
  manifest: RuntimeManifest | null;
};
export type DeploymentMutation = {
  userId: string;
  pageId: string;
  action: DeploymentAction;
  releaseId: string | null;
  expectedRevision: number;
  idempotencyKey: string;
  reason: string;
};
export interface DeploymentRepository {
  getState(userId: string, pageId: string): Promise<DeploymentState>;
  listHistory(input: {userId: string; pageId: string; beforeRevision?: number; limit: number}): Promise<DeploymentHistory>;
  activate(input: DeploymentMutation & {id: string; payloadHash: string}): Promise<DeploymentResult>;
  resolve(input: {publicKey: string; pathname: string; origin: string}): Promise<DeploymentResolution | null>;
}

function revision(value: unknown, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ValidationError(`${name} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

export class DeploymentService {
  constructor(private readonly repository: DeploymentRepository) {}

  getState(userId: unknown, pageId: unknown): Promise<DeploymentState> {
    return this.repository.getState(requireUuid(userId, 'userId'), requireUuid(pageId, 'pageId'));
  }

  listHistory(userId: unknown, pageId: unknown, before?: unknown, limitValue?: unknown): Promise<DeploymentHistory> {
    const limit = limitValue === undefined ? 50 : revision(Number(limitValue), 'limit', 1);
    if (limit > 100) throw new ValidationError('limit must be <= 100');
    return this.repository.listHistory({
      userId: requireUuid(userId, 'userId'), pageId: requireUuid(pageId, 'pageId'), limit,
      ...(before === undefined ? {} : {beforeRevision: revision(Number(before), 'beforeRevision', 1)}),
    });
  }

  activate(userId: unknown, pageId: unknown, action: DeploymentAction, body: {
    releaseId?: unknown; expectedRevision: unknown; idempotencyKey: unknown; reason: unknown;
  }): Promise<DeploymentResult> {
    if (!['deploy', 'disable', 'rollback'].includes(action)) throw new ValidationError('Invalid deployment action');
    if (action === 'disable' && body.releaseId !== undefined && body.releaseId !== null) {
      throw new ValidationError('Disable must not contain a releaseId');
    }
    if (typeof body.reason !== 'string' || !body.reason.trim() || [...body.reason.trim()].length > 500) {
      throw new ValidationError('reason must contain between 1 and 500 characters');
    }
    if (typeof body.idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{16,160}$/.test(body.idempotencyKey)) {
      throw new ValidationError('idempotencyKey must contain 16 to 160 URL-safe characters');
    }
    const payload = {
      action,
      releaseId: action === 'disable' ? null : requireUuid(body.releaseId, 'releaseId'),
      expectedRevision: revision(body.expectedRevision, 'expectedRevision'),
      reason: body.reason.trim(),
    };
    return this.repository.activate({
      ...payload, userId: requireUuid(userId, 'userId'), pageId: requireUuid(pageId, 'pageId'),
      id: randomUUID(), idempotencyKey: body.idempotencyKey,
      payloadHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    });
  }

  resolve(publicKey: unknown, pathname: unknown, origin: unknown): Promise<DeploymentResolution | null> {
    if (typeof publicKey !== 'string' || !/^pk_[A-Za-z0-9_-]{1,160}$/.test(publicKey)) {
      throw new ValidationError('publicKey is invalid');
    }
    const normalizedOrigin = normalizeProjectOrigin(origin);
    if (origin !== normalizedOrigin) throw new ValidationError('Origin must be a canonical serialized origin');
    return this.repository.resolve({publicKey, pathname: normalizePathname(pathname), origin: normalizedOrigin});
  }
}
