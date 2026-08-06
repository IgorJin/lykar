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

export type ExperimentVariantRecord = {
  id: string;
  key: ExperimentVariantKey;
  releaseId: string | null;
  releaseVersion: number | null;
  description: string | null;
  links: ExperimentVariantLinkRecord[];
};

export type ExperimentRecord = {
  id: string;
  projectId: string;
  pageId: string;
  name: string;
  status: ExperimentStatus;
  firstActivatedAt: string | null;
  activatedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
    }>;
  }): Promise<ExperimentRecord>;
  listExperiments(userId: string, pageId: string): Promise<ExperimentRecord[]>;
  updateVariant(input: {
    userId: string;
    experimentId: string;
    key: ExperimentVariantKey;
    releaseId: string | null;
    description: string | null;
  }): Promise<ExperimentRecord>;
  transition(input: {
    userId: string;
    experimentId: string;
    action: 'activate' | 'pause' | 'complete';
  }): Promise<ExperimentRecord>;
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
  ): Promise<ExperimentRecord> {
    return this.repository.updateVariant({
      userId: requireUuid(userIdValue, 'userId'),
      experimentId: requireUuid(experimentIdValue, 'experimentId'),
      key: requireVariantKey(keyValue),
      releaseId: optionalReleaseId(releaseIdValue),
      description: optionalDescription(descriptionValue),
    });
  }

  transition(
    userIdValue: unknown,
    experimentIdValue: unknown,
    action: 'activate' | 'pause' | 'complete',
  ): Promise<ExperimentRecord> {
    return this.repository.transition({
      userId: requireUuid(userIdValue, 'userId'),
      experimentId: requireUuid(experimentIdValue, 'experimentId'),
      action,
    });
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
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Every variant must be an object');
  }
  const variant = value as Record<string, unknown>;
  return {
    key: requireVariantKey(variant.key),
    releaseId: optionalReleaseId(variant.releaseId),
    description: optionalDescription(variant.description),
  };
}

function requireVariantKey(value: unknown): ExperimentVariantKey {
  if (value !== 'A' && value !== 'B') throw new ValidationError('variant key must be A or B');
  return value;
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
