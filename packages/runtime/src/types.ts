import type { OperationKindV1, PublishedManifestV1, SourceSnapshotV1 } from '@lykar/protocol';

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type TargetStrategy = 'marker' | 'css' | 'xpath';

export type OperationApplyStatus = 'applied' | 'skipped' | 'error';

export type OperationApplyResult = {
  operationId: string;
  kind: OperationKindV1;
  status: OperationApplyStatus;
  code?: string;
  message?: string;
  targetStrategy?: TargetStrategy;
};

export type ApplyReport = {
  projectId: string;
  pageId: string;
  releaseId: string;
  version: number;
  startedAt: string;
  finishedAt: string;
  applied: number;
  skipped: number;
  errors: number;
  alreadyApplied: boolean;
  compatibility: {
    status: 'compatible' | 'drifted' | 'unknown';
    expectedPageHash?: string;
    actualPageHash?: string;
  };
  sourceSnapshot?: SourceSnapshotV1;
  operations: OperationApplyResult[];
};

export type NativePageReport = {
  mode: 'native';
  reason: 'NO_VARIANT_TOKEN' | 'NATIVE_VARIANT' | 'VARIANT_UNAVAILABLE';
  experimentId?: string;
  variantKey?: 'A' | 'B';
  startedAt: string;
  finishedAt: string;
};

export type RuntimeStartResult = ApplyReport | NativePageReport;

export type TrackEventResult = {
  accepted: false;
  code: 'EVENT_PIPELINE_NOT_IMPLEMENTED';
  event: { name: string; properties: Record<string, unknown>; occurredAt: string };
};

export type LykarRuntimeOptions = {
  projectKey: string;
  apiBaseUrl?: string;
  version?: number;
  variantToken?: string;
  pathname?: string;
  accessToken?: string;
  credentials?: RequestCredentials;
  document?: Document;
  fetch?: FetchLike;
  strict?: boolean;
  waitForDom?: boolean;
  onReport?: (report: ApplyReport) => void;
};

export type LykarRuntimeConstructorOptions = Omit<LykarRuntimeOptions, 'projectKey'>;

export type ApplyManifestOptions = {
  force?: boolean;
};

export type ManifestClientOptions = {
  projectKey: string;
  apiBaseUrl?: string;
  version?: number;
  variantToken?: string;
  pathname: string;
  accessToken?: string;
  credentials?: RequestCredentials;
  fetch: FetchLike;
};

export type RuntimeManifest = PublishedManifestV1;

export type NativeVariantSelection = {
  mode: 'native-variant';
  experimentId: string;
  variantKey: 'A' | 'B';
};

export type RuntimeSelection = RuntimeManifest | NativeVariantSelection | null;
