export { applyOperation } from './dom-executor.js';
export type { ApplyOperationOptions } from './dom-executor.js';
export { ManifestRequestError, fetchManifest } from './manifest-client.js';
export { Lykar, LykarRuntime, consent, init, track } from './runtime.js';
export { captureSourceSnapshot } from './dom-fingerprint.js';
export { resolveTarget } from './target-resolver.js';
export { matchesSha256, normalizeSha256, sha256Text } from './hash.js';
export type {
  ApplyManifestOptions,
  ApplyReport,
  AnalyticsConsent,
  AnalyticsProperties,
  ExperimentRuntimeSelection,
  NativePageReport,
  NativeVariantSelection,
  FetchLike,
  LykarRuntimeConstructorOptions,
  LykarRuntimeOptions,
  ManifestClientOptions,
  OperationApplyResult,
  OperationApplyStatus,
  RuntimeManifest,
  RuntimeStartResult,
  RuntimeSelection,
  TrackEventResult,
  TargetStrategy,
} from './types.js';
export type {
  TargetResolution,
  TargetResolutionAttempt,
  TargetResolutionCandidateEvidence,
  TargetResolutionEvidence,
  TargetResolutionOptions,
  TargetResolutionReason,
  TargetResolutionStatus,
} from './target-resolver.js';
