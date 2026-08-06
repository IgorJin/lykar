import { randomUUID } from 'node:crypto';

import type { PublishedManifestV1 } from '@lykar/protocol';

import { hashToken, issueOpaqueToken } from './auth';
import { ValidationError, normalizePathname, requireUuid } from './versioning';

export type ExperimentStatus = 'draft' | 'active' | 'paused' | 'completed';
export type ExperimentVariantKey = 'A' | 'B';

export type ExperimentVariantLinkRecord = {
  id: string;
  variantId: string;
  tokenHint: string;
  revokedAt: string | null;
  createdAt: string;
};

export type ExperimentLinkRecord = {
  id: string;
  experimentId: string;
  tokenHint: string;
  revokedAt: string | null;
  createdAt: string;
};

export type ExperimentVariantRecord = {
  id: string;
  key: ExperimentVariantKey;
  releaseId: string | null;
  releaseVersion: number | null;
  description: string | null;
  weightBps: number;
  links: ExperimentVariantLinkRecord[];
};

export type ExperimentRecord = {
  id: string;
  projectId: string;
  pageId: string;
  name: string;
  status: ExperimentStatus;
  winnerVariantKey: ExperimentVariantKey | null;
  firstActivatedAt: string | null;
  activatedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  links: ExperimentLinkRecord[];
  variants: [ExperimentVariantRecord, ExperimentVariantRecord];
};

export type VariantRuntimeResolution = {
  experimentId: string;
  variantKey: ExperimentVariantKey;
  manifest: PublishedManifestV1 | null;
};

export interface ExperimentRepository {
  createExperiment(input: {
    id: string;
    userId: string;
    pageId: string;
    name: string;
    variants: Array<{
      id: string;
      key: ExperimentVariantKey;
      releaseId: string | null;
      description: string | null;
      weightBps: number;
    }>;
  }): Promise<ExperimentRecord>;
  listExperiments(userId: string, pageId: string): Promise<ExperimentRecord[]>;
  updateVariant(input: {
    userId: string;
    experimentId: string;
    key: ExperimentVariantKey;
    releaseId: string | null;
    description: string | null;
    weightBps?: number;
  }): Promise<ExperimentRecord>;
  transition(input: {
    userId: string;
    experimentId: string;
    action: 'activate' | 'pause' | 'complete';
    winnerVariantKey: ExperimentVariantKey | null;
  }): Promise<ExperimentRecord>;
  createExperimentLink(input: {
    id: string;
    userId: string;
    experimentId: string;
    tokenHash: string;
    tokenHint: string;
  }): Promise<{ link: ExperimentLinkRecord; origin: string; pathname: string }>;
  revokeExperimentLink(userId: string, linkId: string): Promise<boolean>;
  createVariantLink(input: {
    id: string;
    userId: string;
    experimentId: string;
    key: ExperimentVariantKey;
    tokenHash: string;
    tokenHint: string;
  }): Promise<{ link: ExperimentVariantLinkRecord; origin: string; pathname: string }>;
  revokeVariantLink(userId: string, linkId: string): Promise<boolean>;
  resolveVariant(input: {
    publicKey: string;
    pathname: string;
    tokenHash: string;
  }): Promise<VariantRuntimeResolution | null>;
}

export class ExperimentService {
  constructor(private readonly repository: ExperimentRepository) {}

  createExperiment(
    userIdValue: unknown,
    pageIdValue: unknown,
    nameValue: unknown,
    variantsValue: unknown,
  ): Promise<ExperimentRecord> {
    if (!Array.isArray(variantsValue) || variantsValue.length !== 2) {
      throw new ValidationError('variants must contain exactly A and B');
    }
    const variants = variantsValue.map(parseVariantInput);
    if (variants[0].key !== 'A' || variants[1].key !== 'B') {
      throw new ValidationError('variants must be ordered as A and B');
    }
    if (variants.every(variant => variant.releaseId === null)) {
      throw new ValidationError('At least one experiment variant must reference a release');
    }
    requireCompleteWeightAllocation(variants);
    return this.repository.createExperiment({
      id: randomUUID(),
      userId: requireUuid(userIdValue, 'userId'),
      pageId: requireUuid(pageIdValue, 'pageId'),
      name: requireExperimentName(nameValue),
      variants: variants.map(variant => ({ id: randomUUID(), ...variant })),
    });
  }

  listExperiments(userIdValue: unknown, pageIdValue: unknown): Promise<ExperimentRecord[]> {
    return this.repository.listExperiments(
      requireUuid(userIdValue, 'userId'),
      requireUuid(pageIdValue, 'pageId'),
    );
  }

  updateVariant(
    userIdValue: unknown,
    experimentIdValue: unknown,
    keyValue: unknown,
    releaseIdValue: unknown,
    descriptionValue: unknown,
    weightBpsValue: unknown,
  ): Promise<ExperimentRecord> {
    return this.repository.updateVariant({
      userId: requireUuid(userIdValue, 'userId'),
      experimentId: requireUuid(experimentIdValue, 'experimentId'),
      key: requireVariantKey(keyValue),
      releaseId: optionalReleaseId(releaseIdValue),
      description: optionalDescription(descriptionValue),
      weightBps: optionalWeightBps(weightBpsValue),
    });
  }

  transition(
    userIdValue: unknown,
    experimentIdValue: unknown,
    action: 'activate' | 'pause' | 'complete',
    winnerVariantKeyValue?: unknown,
  ): Promise<ExperimentRecord> {
    return this.repository.transition({
      userId: requireUuid(userIdValue, 'userId'),
      experimentId: requireUuid(experimentIdValue, 'experimentId'),
      action,
      winnerVariantKey: action === 'complete'
        ? optionalVariantKey(winnerVariantKeyValue)
        : null,
    });
  }

  async createExperimentLink(
    userIdValue: unknown,
    experimentIdValue: unknown,
  ): Promise<{ link: ExperimentLinkRecord; url: string }> {
    const token = issueOpaqueToken();
    const result = await this.repository.createExperimentLink({
      id: randomUUID(),
      userId: requireUuid(userIdValue, 'userId'),
      experimentId: requireUuid(experimentIdValue, 'experimentId'),
      tokenHash: hashToken(token),
      tokenHint: token.slice(-8),
    });
    const url = new URL(result.pathname, result.origin);
    url.searchParams.set('lykar_experiment', token);
    return { link: result.link, url: url.toString() };
  }

  async revokeExperimentLink(userIdValue: unknown, linkIdValue: unknown): Promise<void> {
    const revoked = await this.repository.revokeExperimentLink(
      requireUuid(userIdValue, 'userId'),
      requireUuid(linkIdValue, 'linkId'),
    );
    if (!revoked) throw new ValidationError('Active experiment link was not found');
  }

  async createVariantLink(
    userIdValue: unknown,
    experimentIdValue: unknown,
    keyValue: unknown,
  ): Promise<{ link: ExperimentVariantLinkRecord; url: string }> {
    const token = issueOpaqueToken();
    const result = await this.repository.createVariantLink({
      id: randomUUID(),
      userId: requireUuid(userIdValue, 'userId'),
      experimentId: requireUuid(experimentIdValue, 'experimentId'),
      key: requireVariantKey(keyValue),
      tokenHash: hashToken(token),
      tokenHint: token.slice(-8),
    });
    const url = new URL(result.pathname, result.origin);
    url.searchParams.set('lykar_variant', token);
    return { link: result.link, url: url.toString() };
  }

  async revokeVariantLink(userIdValue: unknown, linkIdValue: unknown): Promise<void> {
    const revoked = await this.repository.revokeVariantLink(
      requireUuid(userIdValue, 'userId'),
      requireUuid(linkIdValue, 'linkId'),
    );
    if (!revoked) throw new ValidationError('Active variant link was not found');
  }

  resolveVariant(
    publicKeyValue: unknown,
    pathnameValue: unknown,
    tokenValue: unknown,
  ): Promise<VariantRuntimeResolution | null> {
    if (typeof publicKeyValue !== 'string' || !publicKeyValue.startsWith('pk_')) return Promise.resolve(null);
    if (typeof tokenValue !== 'string' || tokenValue.length < 32 || tokenValue.length > 256) return Promise.resolve(null);
    return this.repository.resolveVariant({
      publicKey: publicKeyValue,
      pathname: normalizePathname(pathnameValue),
      tokenHash: hashToken(tokenValue),
    });
  }
}

function parseVariantInput(value: unknown): {
  key: ExperimentVariantKey;
  releaseId: string | null;
  description: string | null;
  weightBps: number;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Every variant must be an object');
  }
  const variant = value as Record<string, unknown>;
  return {
    key: requireVariantKey(variant.key),
    releaseId: optionalReleaseId(variant.releaseId),
    description: optionalDescription(variant.description),
    weightBps: requireWeightBps(variant.weightBps),
  };
}

function requireVariantKey(value: unknown): ExperimentVariantKey {
  if (value !== 'A' && value !== 'B') throw new ValidationError('variant key must be A or B');
  return value;
}

function optionalVariantKey(value: unknown): ExperimentVariantKey | null {
  return value === undefined || value === null || value === '' ? null : requireVariantKey(value);
}

function requireWeightBps(value: unknown): number {
  const weight = value === undefined ? 5000 : value;
  if (!Number.isInteger(weight) || Number(weight) < 1 || Number(weight) > 9999) {
    throw new ValidationError('variant weightBps must be an integer between 1 and 9999');
  }
  return Number(weight);
}

function optionalWeightBps(value: unknown): number | undefined {
  return value === undefined ? undefined : requireWeightBps(value);
}

function requireCompleteWeightAllocation(variants: Array<{ weightBps: number }>): void {
  if (variants.reduce((sum, variant) => sum + variant.weightBps, 0) !== 10000) {
    throw new ValidationError('variant weights must add up to 10000 basis points');
  }
}

function optionalReleaseId(value: unknown): string | null {
  return value === undefined || value === null ? null : requireUuid(value, 'releaseId');
}

function optionalDescription(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 240) {
    throw new ValidationError('variant description must contain at most 240 characters');
  }
  return value.trim();
}

function requireExperimentName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ValidationError('experiment name must contain between 1 and 120 characters');
  }
  return value.trim();
}
