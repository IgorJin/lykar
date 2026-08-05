import type { OperationKindV1, PublishedManifestV1 } from '@lykar/protocol';

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
  releaseId: string;
  version: number;
  startedAt: string;
  finishedAt: string;
  applied: number;
  skipped: number;
  errors: number;
  alreadyApplied: boolean;
  operations: OperationApplyResult[];
};

export type LykarRuntimeOptions = {
  projectKey: string;
  apiBaseUrl?: string;
  version?: number;
  environment?: string;
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
  environment?: string;
  credentials?: RequestCredentials;
  fetch: FetchLike;
};

export type RuntimeManifest = PublishedManifestV1;
