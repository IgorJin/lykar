import type {
  AnalyticsConsent,
  ApplyReport,
  FetchLike,
  RuntimeStartResult,
} from '@lykar/runtime';

export type LykarSdkMode =
  | 'auto'
  | 'native'
  | 'visitor'
  | 'editor'
  | 'share'
  | 'variant'
  | 'experiment';

export type LykarDeliveryMode = 'links-only' | 'deployment';

export type SdkEditorCapability = {
  token: string;
  expiresAt: string;
  projectId: string;
  pageId?: string;
  pageUrl: string;
  apiBaseUrl?: string;
  draftId?: string;
  expectedRevision?: number;
  baseVersion?: number | null;
};

export type SdkShareAccess = {
  token: string;
  expiresAt: string;
  projectId: string;
  pageId: string;
  releaseId: string;
  version: number;
};

export type EditorHandle = {
  destroy?: () => void;
  select?: (target: unknown) => void;
  exportDraft?: () => unknown;
};

export type EditorApplyHandler = (
  draft: unknown,
  report: unknown,
) => void | Promise<void>;

export type EditorCommitHandler = (
  result: unknown,
) => void | Promise<void>;

export type LykarSdkOptions = {
  projectKey: string;
  apiBaseUrl?: string;
  mode?: LykarSdkMode;
  delivery?: LykarDeliveryMode;
  version?: number;
  variantToken?: string;
  experimentToken?: string;
  analyticsConsent?: AnalyticsConsent;
  pathname?: string;
  accessToken?: string;
  credentials?: RequestCredentials;
  networkTimeoutMs?: number;
  document?: Document;
  root?: Element;
  fetch?: FetchLike;
  strict?: boolean;
  waitForDom?: boolean;
  targetRetryMs?: number;
  targetRetryIntervalMs?: number;
  editorAssetUrl?: string;
  assetManifestUrl?: string;
  editorAssetOrigin?: string;
  editorAssetTimeoutMs?: number;
  onReport?: (report: ApplyReport) => void;
  onEditorApply?: EditorApplyHandler;
  onEditorCommit?: EditorCommitHandler;
  onError?: (error: LykarSdkError) => void;
};

export type LykarSdkConstructorOptions = Omit<LykarSdkOptions, 'projectKey'>;

export type LykarSdkResultMode =
  | 'native'
  | 'visitor'
  | 'variant'
  | 'experiment'
  | 'share'
  | 'editor'
  | 'error';

export type LykarSdkResult = {
  mode: LykarSdkResultMode;
  reason?: string;
  error?: string;
  runtime?: RuntimeStartResult;
  capability?: SdkEditorCapability;
  shareAccess?: SdkShareAccess;
  editor?: EditorHandle;
};

export type LykarNavigateOptions = {
  pathname: string;
  root?: Element;
};

export type LykarTrackResult = {
  accepted: boolean;
  duplicate?: boolean;
  code?: string;
};

export class LykarSdkError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'LykarSdkError';
    this.code = code;
    this.cause = cause;
  }
}
