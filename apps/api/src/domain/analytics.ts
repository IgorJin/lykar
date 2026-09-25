import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { PublishedManifestV1 } from '@lykar/protocol';

import { hashToken } from './auth';
import type { ExperimentVariantKey } from './experiments';
import { UnauthorizedError, ValidationError, normalizePathname, requireUuid } from './versioning';

export type AnalyticsConsent = 'pending' | 'granted' | 'denied';
export type AnalyticsEventType = 'exposure' | 'conversion';
export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export type ExperimentAssignment = {
  assignmentId: string;
  experimentId: string;
  variantKey: ExperimentVariantKey;
  manifest: PublishedManifestV1 | null;
};

export type ResolvedExperimentAssignment = ExperimentAssignment & { experimentLinkId: string };

export type ExperimentSelection = ExperimentAssignment & {
  capability: string;
  capabilityExpiresAt: string;
};

export type AnalyticsVariantReport = {
  key: ExperimentVariantKey;
  weightBps: number;
  visitors: number;
  views: number;
  uniqueConversions: number;
  conversions: number;
  conversionRate: number | null;
  upliftVsA: number | null;
};

export type ExperimentAnalyticsReport = {
  experimentId: string;
  generatedAt: string;
  variants: [AnalyticsVariantReport, AnalyticsVariantReport];
};

export interface AnalyticsRepository {
  resolveAssignment(input: {
    assignmentId: string;
    publicKey: string;
    pathname: string;
    tokenHash: string;
    visitorHash: string;
  }): Promise<ResolvedExperimentAssignment | null>;
  recordEvent(input: {
    id: string;
    clientEventId: string;
    assignmentId: string;
    experimentLinkId: string;
    eventType: AnalyticsEventType;
    eventName: string;
    properties: AnalyticsProperties;
    occurredAt: Date;
  }): Promise<{ duplicate: boolean }>;
  getReport(userId: string, experimentId: string): Promise<ExperimentAnalyticsReport>;
}

export type AnalyticsServiceOptions = {
  signingSecret: string;
  capabilityTtlMs?: number;
  now?: () => Date;
};

type CapabilityPayload = { v: 2; assignmentId: string; experimentLinkId: string; expiresAt: number };

const RESERVED_PROPERTY_NAMES = new Set([
  'url', 'href', 'pathname', 'html', 'outerhtml', 'innerhtml', 'text', 'content',
  'selector', 'ip', 'useragent', 'user-agent',
  '__proto__', 'prototype', 'constructor',
]);

export class AnalyticsService {
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly options: AnalyticsServiceOptions,
  ) {
    if (options.signingSecret.length < 32) {
      throw new Error('Analytics signing secret must contain at least 32 characters');
    }
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.capabilityTtlMs ?? 30 * 24 * 60 * 60 * 1000;
  }

  async resolveExperiment(
    publicKeyValue: unknown,
    pathnameValue: unknown,
    experimentTokenValue: unknown,
    anonymousIdValue: unknown,
  ): Promise<ExperimentSelection | null> {
    const publicKey = requirePublicKey(publicKeyValue);
    const experimentToken = requireOpaqueToken(experimentTokenValue, 'experimentToken');
    const anonymousId = requireUuid(anonymousIdValue, 'anonymousId');
    const assignment = await this.repository.resolveAssignment({
      assignmentId: randomUUID(),
      publicKey,
      pathname: normalizePathname(pathnameValue),
      tokenHash: hashToken(experimentToken),
      visitorHash: hashToken(anonymousId),
    });
    if (!assignment) return null;
    const expiresAt = new Date(this.now().getTime() + this.ttlMs);
    return {
      assignmentId: assignment.assignmentId,
      experimentId: assignment.experimentId,
      variantKey: assignment.variantKey,
      manifest: assignment.manifest,
      capability: this.issueCapability({
        v: 2,
        assignmentId: assignment.assignmentId,
        experimentLinkId: assignment.experimentLinkId,
        expiresAt: expiresAt.getTime(),
      }),
      capabilityExpiresAt: expiresAt.toISOString(),
    };
  }

  async recordEvent(
    capabilityValue: unknown,
    clientEventIdValue: unknown,
    eventTypeValue: unknown,
    eventNameValue: unknown,
    propertiesValue: unknown,
    occurredAtValue: unknown,
  ): Promise<{ accepted: true; duplicate: boolean }> {
    const capability = this.verifyCapability(capabilityValue);
    const eventType = requireEventType(eventTypeValue);
    const eventName = requireEventName(eventNameValue);
    if (eventType === 'exposure' && eventName !== '$exposure') {
      throw new ValidationError('exposure event name must be $exposure');
    }
    if (eventType === 'conversion' && eventName.startsWith('$')) {
      throw new ValidationError('conversion event names starting with $ are reserved');
    }
    const occurredAt = requireOccurredAt(occurredAtValue, this.now());
    const result = await this.repository.recordEvent({
      id: randomUUID(),
      clientEventId: requireUuid(clientEventIdValue, 'clientEventId'),
      assignmentId: capability.assignmentId,
      experimentLinkId: capability.experimentLinkId,
      eventType,
      eventName,
      properties: sanitizeProperties(propertiesValue),
      occurredAt,
    });
    return { accepted: true, duplicate: result.duplicate };
  }

  getReport(userIdValue: unknown, experimentIdValue: unknown): Promise<ExperimentAnalyticsReport> {
    return this.repository.getReport(
      requireUuid(userIdValue, 'userId'),
      requireUuid(experimentIdValue, 'experimentId'),
    );
  }

  private issueCapability(payload: CapabilityPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.sign(encoded)}`;
  }

  private verifyCapability(value: unknown): CapabilityPayload {
    if (typeof value !== 'string' || value.length < 32 || value.length > 1024) {
      throw new UnauthorizedError('Analytics capability is invalid');
    }
    const [encoded, suppliedSignature, extra] = value.split('.');
    if (!encoded || !suppliedSignature || extra !== undefined) {
      throw new UnauthorizedError('Analytics capability is invalid');
    }
    const expected = Buffer.from(this.sign(encoded));
    const supplied = Buffer.from(suppliedSignature);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedError('Analytics capability is invalid');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedError('Analytics capability is invalid');
    }
    if (!isRecord(parsed) || parsed.v !== 2) throw new UnauthorizedError('Analytics capability is invalid');
    const assignmentId = requireUuid(parsed.assignmentId, 'assignmentId');
    const experimentLinkId = requireUuid(parsed.experimentLinkId, 'experimentLinkId');
    if (typeof parsed.expiresAt !== 'number' || !Number.isSafeInteger(parsed.expiresAt)) {
      throw new UnauthorizedError('Analytics capability is invalid');
    }
    if (parsed.expiresAt <= this.now().getTime()) throw new UnauthorizedError('Analytics capability has expired');
    return { v: 2, assignmentId, experimentLinkId, expiresAt: parsed.expiresAt };
  }

  private sign(encoded: string): string {
    return createHmac('sha256', this.options.signingSecret).update(encoded).digest('base64url');
  }
}

export function assignmentBucket(experimentId: string, visitorHash: string): number {
  const digest = hashToken(`${experimentId}:${visitorHash}`);
  return Number.parseInt(digest.slice(0, 12), 16) % 10000;
}

function requirePublicKey(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('pk_') || value.length > 200) {
    throw new ValidationError('publicKey is invalid');
  }
  return value;
}

function requireOpaqueToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length < 32 || value.length > 256) {
    throw new ValidationError(`${field} is invalid`);
  }
  return value;
}

function requireEventType(value: unknown): AnalyticsEventType {
  if (value !== 'exposure' && value !== 'conversion') {
    throw new ValidationError('eventType must be exposure or conversion');
  }
  return value;
}

function requireEventName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) {
    throw new ValidationError('event name must contain between 1 and 120 characters');
  }
  return value.trim();
}

function requireOccurredAt(value: unknown, now: Date): Date {
  if (typeof value !== 'string') throw new ValidationError('occurredAt must be an ISO timestamp');
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) throw new ValidationError('occurredAt must be an ISO timestamp');
  const drift = Math.abs(occurredAt.getTime() - now.getTime());
  if (drift > 24 * 60 * 60 * 1000) {
    throw new ValidationError('occurredAt must be within 24 hours of server time');
  }
  return occurredAt;
}

function sanitizeProperties(value: unknown): AnalyticsProperties {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) throw new ValidationError('event properties must be an object');
  const entries = Object.entries(value);
  if (entries.length > 20) throw new ValidationError('event properties must contain at most 20 keys');
  const result: AnalyticsProperties = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.length > 64 || RESERVED_PROPERTY_NAMES.has(key.toLowerCase())) {
      throw new ValidationError(`event property ${rawKey || '(empty)'} is not allowed`);
    }
    if (typeof rawValue === 'string') {
      if (rawValue.length > 256) throw new ValidationError(`event property ${key} is too long`);
      result[key] = rawValue;
    } else if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) throw new ValidationError(`event property ${key} must be finite`);
      result[key] = rawValue;
    } else if (typeof rawValue === 'boolean' || rawValue === null) {
      result[key] = rawValue;
    } else {
      throw new ValidationError(`event property ${key} must be a scalar value`);
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
