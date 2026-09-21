import {
  Lykar as RuntimeLykar,
  ManifestRequestError,
  type FetchLike,
  type RuntimeStartResult,
} from '@lykar/runtime';
import {
  exchangeEditorLaunch,
  exchangeShareAccess,
  getLocationSelectors,
} from './access.js';
import {
  validateAssetManifest,
  type SdkAssetManifest,
} from './compatibility.js';
import {
  LykarSdkError,
  type EditorHandle,
  type LykarNavigateOptions,
  type LykarSdkConstructorOptions,
  type LykarSdkMode,
  type LykarSdkOptions,
  type LykarSdkResult,
  type SdkEditorCapability,
  type SdkShareAccess,
} from './types.js';

type GlobalEditorApi = {
  start: (options: Record<string, unknown>) => EditorHandle;
};

type EditorAsset = {
  url: string;
  integrity: string;
};

type EditorWindow = Window & {
  LykarEditor?: GlobalEditorApi;
  __LYKAR_VERIFIED_EDITOR_ASSETS__?: Record<string, string>;
};

type RuntimeRunOptions = {
  accessToken?: string;
  version?: number;
  variantToken?: string;
  experimentToken?: string;
};

function getBrowserDocument(document?: Document): Document {
  const browserDocument = document ?? globalThis.document;
  if (!browserDocument) {
    throw new LykarSdkError(
      'NO_DOCUMENT',
      'Lykar SDK start requires a browser document.',
    );
  }
  return browserDocument;
}

function resolveLocation(document: Document): Location {
  if (!document.location) {
    throw new LykarSdkError('NO_LOCATION', 'Lykar SDK requires a document location.');
  }
  return document.location;
}

function normalizeMode(mode: LykarSdkMode | undefined): LykarSdkMode {
  return mode ?? 'auto';
}

function defaultReason(result: RuntimeStartResult): string | undefined {
  return 'mode' in result && result.mode === 'native' ? result.reason : undefined;
}

function modeForRuntime(options: RuntimeRunOptions): 'visitor' | 'variant' | 'experiment' {
  if (options.experimentToken) return 'experiment';
  if (options.variantToken) return 'variant';
  return 'visitor';
}

async function waitForBody(document: Document): Promise<void> {
  if (document.body) return;
  await new Promise<void>(resolve => {
    document.addEventListener('DOMContentLoaded', () => resolve(), {once: true});
  });
}

export class Lykar {
  readonly projectKey: string;
  readonly options: LykarSdkOptions;

  private startPromise?: Promise<LykarSdkResult>;
  private editor?: EditorHandle;
  private runtime?: RuntimeLykar;
  private pathnameOverride?: string;
  private destroyed = false;

  constructor(projectKey: string, options?: LykarSdkConstructorOptions);
  constructor(options: LykarSdkOptions);
  constructor(
    projectKeyOrOptions: string | LykarSdkOptions,
    constructorOptions: LykarSdkConstructorOptions = {},
  ) {
    const options =
      typeof projectKeyOrOptions === 'string'
        ? {projectKey: projectKeyOrOptions, ...constructorOptions}
        : projectKeyOrOptions;

    if (!options.projectKey || !options.projectKey.trim()) {
      throw new LykarSdkError('PROJECT_KEY_REQUIRED', 'Lykar SDK requires a projectKey.');
    }

    this.projectKey = options.projectKey;
    this.options = {...options};
  }

  async start(): Promise<LykarSdkResult> {
    if (this.startPromise) return this.startPromise;
    this.destroyed = false;
    this.startPromise = this.startInternal();
    return this.startPromise;
  }

  async refresh(): Promise<LykarSdkResult> {
    await this.destroy();
    this.destroyed = false;
    return this.start();
  }

  async navigate(options: LykarNavigateOptions): Promise<LykarSdkResult> {
    const document = getBrowserDocument(this.options.document);
    if (!options.pathname.startsWith('/')) {
      throw new LykarSdkError(
        'PATHNAME_INVALID',
        'Lykar SDK navigation pathname must start with /.',
      );
    }
    if (options.root && options.root.ownerDocument !== document) {
      throw new LykarSdkError(
        'ROOT_DOCUMENT_MISMATCH',
        'Lykar SDK navigation root belongs to another document.',
      );
    }
    this.pathnameOverride = options.pathname;
    return this.refresh();
  }

  async destroy(): Promise<void> {
    this.editor?.destroy?.();
    this.editor = undefined;
    this.runtime = undefined;
    this.startPromise = undefined;
    this.destroyed = true;
  }

  async track(
    eventName: string,
    properties?: Record<string, string | number | boolean | null>,
  ): Promise<{accepted: boolean; duplicate?: boolean; code?: string}> {
    if (!this.runtime) {
      return {accepted: false, code: 'NO_ACTIVE_RUNTIME'};
    }
    return this.runtime.track(eventName, properties);
  }

  consent(value: 'pending' | 'granted' | 'denied'): void {
    if (value === 'pending') return;
    void this.runtime?.consent(value);
  }

  private async startInternal(): Promise<LykarSdkResult> {
    if (this.destroyed) {
      this.destroyed = false;
    }

    let document: Document;
    try {
      document = getBrowserDocument(this.options.document);
    } catch (error) {
      return this.fail(error);
    }

    const location = resolveLocation(document);
    const configuredMode = normalizeMode(this.options.mode);
    const selectors = getLocationSelectors(document);

    if (selectors.selectorCount > 1) {
      return this.fail(
        new LykarSdkError(
          'AMBIGUOUS_ACCESS_MODE',
          'Lykar URL contains more than one mutually exclusive access selector.',
        ),
      );
    }

    let selectedMode: LykarSdkMode;
    try {
      selectedMode = this.selectMode(configuredMode, selectors);
    } catch (error) {
      return this.fail(error);
    }
    if (selectedMode === 'native') {
      return {mode: 'native', reason: 'EXPLICIT_NATIVE_MODE'};
    }

    try {
      const accessOptions = {
        apiBaseUrl: this.options.apiBaseUrl,
        document,
        fetch: this.networkFetch(),
      };

      let editorCapability: SdkEditorCapability | null = null;
      if (configuredMode === 'auto' || selectedMode === 'editor') {
        editorCapability = await exchangeEditorLaunch(accessOptions);
      }

      if (editorCapability) {
        return await this.startEditor(document, editorCapability);
      }
      if (selectedMode === 'editor') {
        return this.fail(
          new LykarSdkError(
            'EDITOR_CAPABILITY_REQUIRED',
            'Editor mode requires a valid launch code or stored capability.',
          ),
        );
      }

      let shareAccess: SdkShareAccess | null = null;
      if (selectedMode === 'auto' || selectedMode === 'share') {
        shareAccess = await exchangeShareAccess(accessOptions);
      }
      if (shareAccess) {
        const runtime = await this.runRuntime({
          accessToken: shareAccess.token,
          version: shareAccess.version,
        });
        if (!runtime.runtime) return runtime;
        return {...runtime, mode: 'share', shareAccess};
      }
      if (selectedMode === 'share') {
        return this.fail(
          new LykarSdkError(
            'SHARE_ACCESS_REQUIRED',
            'Share mode requires a valid share access fragment.',
          ),
        );
      }

      const search = new URLSearchParams(location.search);
      const version = this.options.version ?? this.numberParam(search.get('version'));
      const variantToken = this.options.variantToken ?? search.get('lykar_variant') ?? undefined;
      const experimentToken =
        this.options.experimentToken ?? search.get('lykar_experiment') ?? undefined;
      const runtimeSelectorCount = [
        version !== undefined,
        Boolean(variantToken),
        Boolean(experimentToken),
      ].filter(Boolean).length;
      if (runtimeSelectorCount > 1) {
        return this.fail(
          new LykarSdkError(
            'AMBIGUOUS_ACCESS_MODE',
            'Lykar SDK received more than one mutually exclusive runtime selector.',
          ),
        );
      }

      const hasVisitorSelection =
        selectors.visitor ||
        version !== undefined ||
        Boolean(variantToken) ||
        Boolean(experimentToken) ||
        selectedMode === 'visitor' ||
        selectedMode === 'variant' ||
        selectedMode === 'experiment' ||
        this.options.delivery === 'deployment';

      if (!hasVisitorSelection && selectedMode === 'auto') {
        return {mode: 'native', reason: 'LINKS_ONLY_NATIVE'};
      }

      const runtime = await this.runRuntime({
        accessToken: this.options.accessToken,
        version,
        variantToken,
        experimentToken,
      });
      return runtime;
    } catch (error) {
      return this.fail(error);
    }
  }

  private selectMode(
    configuredMode: LykarSdkMode,
    selectors: ReturnType<typeof getLocationSelectors>,
  ): LykarSdkMode {
    if (configuredMode === 'auto') {
      if (selectors.editor) return 'editor';
      if (selectors.share) return 'share';
      if (selectors.visitor) return 'visitor';
      return 'auto';
    }

    if (
      (configuredMode === 'editor' && (selectors.share || selectors.visitor)) ||
      (configuredMode === 'share' && (selectors.editor || selectors.visitor)) ||
      (configuredMode !== 'editor' && configuredMode !== 'share' && selectors.editor) ||
      (configuredMode !== 'editor' && configuredMode !== 'share' && selectors.share)
    ) {
      throw new LykarSdkError(
        'CONFIGURATION_ACCESS_CONFLICT',
        `Configured SDK mode ${configuredMode} conflicts with the current URL.`,
      );
    }
    return configuredMode;
  }

  private async runRuntime(options: RuntimeRunOptions): Promise<LykarSdkResult> {
    try {
      this.runtime = new RuntimeLykar({
        projectKey: this.projectKey,
        apiBaseUrl: this.options.apiBaseUrl,
        version: options.version,
        variantToken: options.variantToken,
        experimentToken: options.experimentToken,
        analyticsConsent: this.options.analyticsConsent,
        pathname: this.pathnameOverride ?? this.options.pathname,
        accessToken: options.accessToken ?? this.options.accessToken,
        credentials: this.options.credentials,
        document: this.options.document,
        strict: this.options.strict,
        waitForDom: this.options.waitForDom,
        onReport: this.options.onReport,
        fetch: this.networkFetch(),
      });
      const runtime = await this.runtime.start();
      return {
        mode: modeForRuntime(options),
        reason: defaultReason(runtime),
        runtime,
      };
    } catch (error) {
      if (
        error instanceof ManifestRequestError &&
        error.status !== undefined &&
        [401, 403, 404].includes(error.status)
      ) {
        return {mode: 'native', reason: 'ACCESS_UNAVAILABLE'};
      }
      if (error instanceof ManifestRequestError && error.status === undefined) {
        return {mode: 'native', reason: 'NETWORK_UNAVAILABLE'};
      }
      throw error;
    }
  }

  private networkFetch(): FetchLike | undefined {
    const base = this.options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!base) return undefined;
    const timeoutMs = this.options.networkTimeoutMs ?? 5_000;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return base;
    return async (input, init = {}) => {
      const controller = new AbortController();
      const upstreamSignal = init.signal;
      const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
      if (upstreamSignal?.aborted) abortFromUpstream();
      else upstreamSignal?.addEventListener('abort', abortFromUpstream, {once: true});
      const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await base(input, {...init, signal: controller.signal});
        if (response.body === null || response.body === undefined) return response;
        const body = await response.arrayBuffer();
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } finally {
        globalThis.clearTimeout(timer);
        upstreamSignal?.removeEventListener('abort', abortFromUpstream);
      }
    };
  }

  private async startEditor(
    document: Document,
    capability: SdkEditorCapability,
  ): Promise<LykarSdkResult> {
    await waitForBody(document);
    const editorAsset = await this.resolveEditorAsset(document);
    const runtime = await this.runRuntime({
      accessToken: capability.token,
      version: capability.baseVersion ?? undefined,
    });
    const editorApi = await this.loadEditorApi(document, editorAsset);
    const editor = editorApi.start({
      capability,
      sourceSnapshot:
        runtime.runtime && 'sourceSnapshot' in runtime.runtime
          ? runtime.runtime.sourceSnapshot
          : undefined,
      onApply: this.options.onEditorApply,
      onCommit: this.options.onEditorCommit,
    });
    this.editor = editor;
    return {
      mode: 'editor',
      capability,
      editor,
      runtime: runtime.runtime,
    };
  }

  private async loadEditorApi(
    document: Document,
    editorAsset: EditorAsset,
  ): Promise<GlobalEditorApi> {
    const editorWindow = document.defaultView as EditorWindow | null;
    const existing = editorWindow?.LykarEditor;
    if (existing?.start) return existing;

    const script = document.createElement('script');
    script.src = editorAsset.url;
    script.integrity = editorAsset.integrity;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.dataset.lykarEditorAsset = 'true';
    const timeoutMs = this.options.editorAssetTimeoutMs ?? 10_000;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        script.remove();
        reject(
          new LykarSdkError(
            'EDITOR_ASSET_TIMEOUT',
            `Editor asset did not load within ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs);
      script.addEventListener('load', () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve();
      });
      script.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        script.remove();
        reject(new LykarSdkError('EDITOR_ASSET_LOAD_FAILED', 'Editor asset failed to load.'));
      });
      (document.head ?? document.documentElement).appendChild(script);
    });

    const loaded = editorWindow?.LykarEditor;
    if (!loaded?.start) {
      throw new LykarSdkError(
        'EDITOR_ASSET_INVALID',
        'Editor asset loaded without exposing window.LykarEditor.start.',
      );
    }
    if (editorWindow) {
      const registry = editorWindow.__LYKAR_VERIFIED_EDITOR_ASSETS__ ?? {};
      registry[editorAsset.url] = editorAsset.integrity;
      editorWindow.__LYKAR_VERIFIED_EDITOR_ASSETS__ = registry;
    }
    return loaded;
  }

  private async resolveEditorAsset(document: Document): Promise<EditorAsset> {
    const assetUrl = new URL(this.editorAssetUrl(document), document.location.href);
    const pageOrigin = new URL(document.location.href).origin;
    const allowedOrigin = this.options.editorAssetOrigin
      ? new URL(this.options.editorAssetOrigin, document.location.href).origin
      : pageOrigin;
    if (assetUrl.origin !== allowedOrigin) {
      throw new LykarSdkError(
        'EDITOR_ASSET_ORIGIN_MISMATCH',
        'Editor asset origin is not allowed by the SDK configuration.',
      );
    }

    const manifestUrl = new URL(
      this.options.assetManifestUrl ?? 'asset-manifest.json',
      assetUrl,
    );
    if (manifestUrl.origin !== allowedOrigin) {
      throw new LykarSdkError(
        'ASSET_MANIFEST_ORIGIN_MISMATCH',
        'Asset manifest origin is not allowed by the SDK configuration.',
      );
    }
    const request = this.networkFetch();
    if (!request) {
      throw new LykarSdkError(
        'NO_FETCH',
        'Lykar SDK requires fetch to verify editor assets.',
      );
    }

    let response: Response;
    try {
      response = await request(manifestUrl.toString(), {
        headers: {Accept: 'application/json'},
      });
    } catch (error) {
      throw new LykarSdkError(
        'ASSET_MANIFEST_REQUEST_FAILED',
        'Lykar asset manifest request failed.',
        error,
      );
    }
    if (!response.ok) {
      throw new LykarSdkError(
        'ASSET_MANIFEST_REQUEST_FAILED',
        'Lykar asset manifest request returned HTTP ' + response.status + '.',
      );
    }

    let manifest: SdkAssetManifest;
    try {
      manifest = validateAssetManifest(await response.json());
    } catch (error) {
      if (error instanceof LykarSdkError) throw error;
      throw new LykarSdkError(
        'ASSET_MANIFEST_INVALID',
        'Lykar asset manifest is not valid JSON.',
        error,
      );
    }
    const editor = manifest.assets['editor.iife.js'];
    const assetName = assetUrl.pathname.split('/').at(-1);
    if (assetName !== editor.path && assetName !== editor.versionedPath) {
      throw new LykarSdkError(
        'ASSET_COMPATIBILITY_MISMATCH',
        'Configured editor asset is not part of the compatible SDK asset set.',
      );
    }

    const editorWindow = document.defaultView as EditorWindow | null;
    const existing = editorWindow?.LykarEditor;
    if (existing?.start) {
      const verifiedIntegrity =
        editorWindow?.__LYKAR_VERIFIED_EDITOR_ASSETS__?.[assetUrl.toString()];
      if (verifiedIntegrity !== editor.integrity) {
        throw new LykarSdkError(
          'ASSET_COMPATIBILITY_MISMATCH',
          'An unverified or incompatible editor asset is already loaded.',
        );
      }
    }

    return {url: assetUrl.toString(), integrity: editor.integrity};
  }

  private editorAssetUrl(document: Document): string {
    if (this.options.editorAssetUrl) return this.options.editorAssetUrl;
    const currentScript = document.currentScript as HTMLScriptElement | null;
    if (currentScript?.src) {
      return new URL('editor.iife.js', currentScript.src).toString();
    }
    return new URL('/editor.iife.js', document.location.href).toString();
  }

  private numberParam(value: string | null): number | undefined {
    if (value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private fail(error: unknown): LykarSdkResult {
    const sdkError =
      error instanceof LykarSdkError
        ? error
        : new LykarSdkError(
            'SDK_START_FAILED',
            error instanceof Error ? error.message : 'Lykar SDK failed to start.',
            error,
          );
    this.options.onError?.(sdkError);
    return {mode: 'error', reason: sdkError.code, error: sdkError.message};
  }
}
