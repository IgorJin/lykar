export { applyOperation } from './dom-executor.js';
export { ManifestRequestError, fetchManifest } from './manifest-client.js';
export { Lykar, LykarRuntime, init } from './runtime.js';
export { resolveTarget } from './target-resolver.js';
export { matchesSha256, normalizeSha256, sha256Text } from './hash.js';
export type {
  ApplyManifestOptions,
  ApplyReport,
  FetchLike,
  LykarRuntimeConstructorOptions,
  LykarRuntimeOptions,
  ManifestClientOptions,
  OperationApplyResult,
  OperationApplyStatus,
  RuntimeManifest,
  TargetStrategy,
} from './types.js';
export type { TargetResolution } from './target-resolver.js';
