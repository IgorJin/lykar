import {observeNavigation} from './navigation.js';
import {installPreviewReportBridge} from './preview-report.js';
import {installConnectionProbe} from './connection-probe.js';
import {
  Lykar as RuntimeLykar,
  ManifestRequestError,
  visitorTokensFromLocation,
  type AnalyticsConsent,
  type ApplyReport,
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
  validateRuntimeAssetEntry,
  SDK_COMPATIBILITY,
  type SdkAssetManifest,
} from './compatibility.js';
import {
  PageSession,
  isPageSessionStale,
  type PageSessionContext,
} from './page-session.js';
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

type RuntimeCore = {
  Lykar: new (options: unknown) => RuntimeLykar;
  ManifestRequestError: typeof ManifestRequestError;
  compatibility: typeof SDK_COMPATIBILITY;
};

const runtimeCoreKey = Symbol.for('@lykar/runtime-core/v1');
const verifiedRuntimeAssets = new WeakMap<Window, Map<string, string>>();

function runtimeCore(document: Document): RuntimeCore | undefined {
  const view = document.defaultView;
  return view ? (view as unknown as Record<symbol, RuntimeCore | undefined>)[runtimeCoreKey] : undefined;
}

type RuntimeRunOptions = {
  deployment?: boolean;
  accessToken?: string;
  version?: number;
  variantToken?: string;
  experimentToken?: string;
};

function uuid(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, digit =>
    (Number(digit) ^ (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(digit) / 4)))).toString(16));
}

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

async function waitForBody(document: Document, signal?: AbortSignal): Promise<void> {
  if (document.body) return;
  await new Promise<void>((resolve, reject) => {
    const ready = () => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    };
    const aborted = () => {
      document.removeEventListener('DOMContentLoaded', ready);
      reject(abortError());
    };
    document.addEventListener('DOMContentLoaded', ready, {once: true, signal});
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, {once: true});
  });
}

export class Lykar {
  readonly projectKey: string;
  readonly options: LykarSdkOptions;

  private startPromise?: Promise<LykarSdkResult>;
  private pageSession?: PageSession;
  private editor?: EditorHandle;
  private readonly shareByPath = new Map<string, SdkShareAccess>();
  private runtimeLoadPromise?: Promise<void>;
  private runtimeLoadController?: AbortController;
  get conditionalState() { return this.runtime?.conditionalState ?? {groups: [], stats: null}; }

  private runtime?: RuntimeLykar;
  private analyticsConsent: AnalyticsConsent;
  private exposureEventIds = new Map<string, string>();
  private analyticsTest?: {token: string; pathname: string};
  private analyticsTestContext?: PageSessionContext;
  private pathnameOverride?: string;
  private rootOverride?: Element;
  private rotateSession = false;
  private destroyed = false;
  private stopNavigation?: () => void;
  private observedPathname?: string;
  private stopConnectionProbe?: () => void;

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
    this.analyticsConsent = options.analyticsConsent ?? 'pending';
  }

  async start(): Promise<LykarSdkResult> {
    if (this.startPromise) return this.startPromise;
    this.destroyed = false;
    let document: Document;
    try {
      document = getBrowserDocument(this.options.document);
    } catch (error) {
      return this.fail(error);
    }
    if (!this.stopNavigation && document.defaultView) {
      this.observedPathname = document.location.pathname;
      this.stopNavigation = observeNavigation(document.defaultView, () => {
        const pathname = document.location.pathname;
        if (this.destroyed || pathname === this.observedPathname) return;
        this.observedPathname = pathname;
        void this.navigate({pathname, root: this.rootOverride ?? this.options.root}).catch(error => this.fail(error));
      });
    }
    const context = this.startPageSession(document, this.rotateSession);
    this.stopConnectionProbe?.();
    this.stopConnectionProbe = context ? installConnectionProbe({
      document, apiBaseUrl: this.options.apiBaseUrl, projectKey: this.projectKey,
      frameworkMode: this.options.frameworkMode,
      fetch: this.options.fetch, networkTimeoutMs: this.options.networkTimeoutMs,
      assetUrls: this.connectionAssetUrls(document),
      isCurrent: () => !this.destroyed && context.isCurrent(),
      runtime: () => this.ensureRuntimeCore(document, context),
      editor: async () => {
        const asset = await this.resolveEditorAsset(document, context);
        context.assertCurrent();
        await this.loadEditorApi(document, asset, context);
        context.assertCurrent();
      },
    }) : undefined;
    this.rotateSession = false;
    this.startPromise = context
      ? this.pageSession!.runReplay(context, () => this.startInternal(context))
        .catch(error => this.lifecycleResult(error, context))
      : Promise.resolve(this.fail(new LykarSdkError('ROOT_DOCUMENT_MISMATCH', 'Lykar SDK root belongs to another document.')));
    return this.startPromise;
  }

  async refresh(): Promise<LykarSdkResult> {
    this.cleanupActiveHandles();
    this.startPromise = undefined;
    this.rotateSession = true;
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
    const previous = this.pageSession?.snapshot();
    if (options.pathname !== previous?.pathname || (options.root ?? this.options.root ?? document) !== previous?.root) this.exposureEventIds = new Map();
    this.pathnameOverride = options.pathname;
    this.rootOverride = options.root;
    return this.refresh();
  }

  async destroy(): Promise<void> {
    this.stopConnectionProbe?.();
    this.stopConnectionProbe = undefined;
    this.stopNavigation?.();
    this.stopNavigation = undefined;
    this.pageSession?.destroy();
    this.cleanupActiveHandles();
    this.startPromise = undefined;
    this.rotateSession = false;
    this.destroyed = true;
    this.shareByPath.clear();
    this.analyticsTest = undefined;
    this.analyticsTestContext = undefined;
    this.runtimeLoadController?.abort();
    this.runtimeLoadController = undefined;
    this.runtimeLoadPromise = undefined;
  }

  async track(
    eventName: string,
    properties?: Record<string, string | number | boolean | null>,
    options: {clientEventId?: string} = {},
  ): Promise<{accepted: boolean; duplicate?: boolean; code?: string}> {
    if (this.analyticsTest) {
      if (this.analyticsConsent !== 'granted') return {accepted: false, code: this.analyticsConsent === 'denied' ? 'CONSENT_DENIED' : 'CONSENT_REQUIRED'};
      if (typeof eventName !== 'string' || !eventName.trim() || eventName.trim().length > 120) throw new Error('Lykar event name must contain between 1 and 120 characters');
      return this.sendAnalyticsTest(eventName.trim(), options.clientEventId ?? uuid());
    }
    if (!this.runtime) {
      return {accepted: false, code: 'NO_ACTIVE_RUNTIME'};
    }
    return this.runtime.track(eventName, properties, options);
  }

  async consent(value: AnalyticsConsent): Promise<void> {
    if (!['pending', 'granted', 'denied'].includes(value)) throw new Error('Lykar consent must be pending, granted or denied');
    this.analyticsConsent = value;
    if (this.analyticsTest) {
      await this.sendAnalyticsTest();
      return;
    }
    await this.runtime?.consent(value);
  }

  private async sendAnalyticsTest(name?: string, clientEventId?: string): Promise<{accepted: boolean; code?: string}> {
    const context = this.analyticsTestContext;
    const test = this.analyticsTest;
    if (!test || !context?.isCurrent() || context.pathname !== test.pathname) return {accepted: false, code: 'ANALYTICS_TEST_UNAVAILABLE'};
    const fetch = this.networkFetch(context.signal);
    if (!fetch) return {accepted: false, code: 'EVENT_SEND_FAILED'};
    try {
      const response = await fetch(`${(this.options.apiBaseUrl ?? '').replace(/\/+$/, '')}/api/runtime/projects/${encodeURIComponent(this.projectKey)}/analytics-tests`, {
        method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        ...(this.options.credentials ? {credentials: this.options.credentials} : {}),
        signal: context.signal,
        body: JSON.stringify({token: test.token, pathname: context.pathname, consent: this.analyticsConsent,
          ...(name ? {name, clientEventId} : {})}),
      });
      context.assertCurrent();
      if (!response.ok) return {accepted: false, code: 'EVENT_SEND_FAILED'};
      const payload: unknown = await response.json();
      context.assertCurrent();
      return typeof payload === 'object' && payload !== null && 'accepted' in payload && payload.accepted === true
        && (!name || ('eventReceived' in payload && payload.eventReceived === true))
        ? {accepted: true} : {accepted: false, code: 'EVENT_SEND_FAILED'};
    } catch { return {accepted: false, code: 'EVENT_SEND_FAILED'}; }
  }

  private async startInternal(context: PageSessionContext): Promise<LykarSdkResult> {
    if (this.destroyed) {
      this.destroyed = false;
    }

    let document: Document;
    try {
      document = getBrowserDocument(this.options.document);
    } catch (error) {
      return this.fail(error);
    }
    context.assertCurrent();

    const location = resolveLocation(document);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (hash.has('lykar_analytics_test')) {
      const tokens = hash.getAll('lykar_analytics_test');
      this.analyticsTest = {token: tokens.length === 1 ? tokens[0] : '', pathname: context.pathname};
      hash.delete('lykar_analytics_test');
      try { document.defaultView?.history.replaceState(document.defaultView.history.state, '', `${location.pathname}${location.search}${hash.size ? `#${hash}` : ''}`); } catch { /* Test mode remains isolated if URL cleanup is unavailable. */ }
    }
    if (this.analyticsTest) {
      this.analyticsTestContext = context;
      await this.sendAnalyticsTest();
      context.assertCurrent();
      return {mode: 'native', reason: 'ANALYTICS_TEST'};
    }
    const configuredMode = normalizeMode(this.options.mode);
    const selectors = getLocationSelectors(document);

    const configuredSelectors = [
      selectors.editor, selectors.share,
      (selectors.version && !selectors.share) || this.options.version !== undefined,
      selectors.variant || this.options.variantToken !== undefined,
      selectors.experiment || this.options.experimentToken !== undefined,
    ].filter(Boolean).length;
    if (selectors.selectorCount > 1 || configuredSelectors > 1) {
      return this.fail(
        new LykarSdkError(
          'AMBIGUOUS_ACCESS_MODE',
          'Lykar URL contains more than one mutually exclusive access selector.',
        ),
      );
    }

    if (selectors.malformed) return this.fail(new LykarSdkError('INVALID_ACCESS_SELECTOR', 'Lykar access selector is empty, repeated or invalid.'));

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
        fetch: this.networkFetch(context.signal),
        isCurrent: context.isCurrent,
      };

      let editorCapability: SdkEditorCapability | null = null;
      if ((configuredMode === 'auto' && this.options.version === undefined
        && this.options.variantToken === undefined && this.options.experimentToken === undefined
        && this.options.accessToken === undefined) || selectedMode === 'editor') {
        editorCapability = await exchangeEditorLaunch(accessOptions);
        context.assertCurrent();
      }

      if (editorCapability) {
        this.pageSession?.updateScope(context, {
          pageId: editorCapability.pageId,
          draftId: editorCapability.draftId,
        });
        return await this.startEditor(document, editorCapability, context);
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
        context.assertCurrent();
      }
      if (shareAccess) this.rememberShare(document, shareAccess);
      else if (configuredMode === 'auto' && !selectors.editor && !selectors.share
        && !selectors.variant && !selectors.experiment
        && this.options.version === undefined && !this.options.variantToken
        && !this.options.experimentToken && !this.options.accessToken
        && this.options.delivery !== 'deployment') {
        const cached = this.cachedShare(document);
        const requestedVersions = new URLSearchParams(location.search).getAll('version');
        if (cached && (!selectors.version || (requestedVersions.length === 1
          && this.numberParam(requestedVersions[0]) === cached.version))) {
          shareAccess = cached;
        }
      }
      if (shareAccess) {
        const runtime = await this.runRuntime(context, {
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
      const tokens = visitorTokensFromLocation(document);
      const version = this.options.version ?? this.numberParam(search.get('version'));
      const variantToken = this.options.variantToken ?? tokens.variant;
      const experimentToken =
        this.options.experimentToken ?? tokens.experiment;
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

      const deployment = this.options.delivery === 'deployment'
        && (selectedMode === 'auto' || selectedMode === 'visitor')
        && selectors.selectorCount === 0 && configuredSelectors === 0
        && this.options.accessToken === undefined;
      const runtime = await this.runRuntime(context, {
        deployment,
        accessToken: this.options.accessToken,
        version,
        variantToken,
        experimentToken,
      });
      return runtime;
    } catch (error) {
      if (!context.isCurrent() || isPageSessionStale(error)) throw error;
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

  private async runRuntime(
    context: PageSessionContext,
    options: RuntimeRunOptions,
  ): Promise<LykarSdkResult> {
    let runtimeInstance: RuntimeLykar | undefined;
    try {
      if ((RuntimeLykar as unknown as {external?: boolean}).external === true) {
        await this.ensureRuntimeCore(getBrowserDocument(this.options.document), context);
      }
      runtimeInstance = new RuntimeLykar({
        delivery: options.deployment ? 'deployment' : 'links-only',
        projectKey: this.projectKey,
        apiBaseUrl: this.options.apiBaseUrl,
        version: options.version,
        variantToken: options.variantToken,
        experimentToken: options.experimentToken,
        analyticsConsent: this.analyticsConsent,
        exposureEventIds: this.exposureEventIds,
        pathname: this.pathnameOverride ?? this.options.pathname,
        accessToken: options.accessToken ?? this.options.accessToken,
        credentials: this.options.credentials,
        document: getBrowserDocument(this.options.document),
        root: context.root,
        strict: this.options.strict,
        waitForDom: this.options.waitForDom,
        signal: context.signal,
        isCurrent: context.isCurrent,
        targetRetryMs: this.options.targetRetryMs,
        targetRetryIntervalMs: this.options.targetRetryIntervalMs,
        targetRetryLimit: this.options.targetRetryLimit,
        maxReplayMs: this.options.maxReplayMs,
        maxManifestBytes: this.options.maxManifestBytes,
        maxOperations: this.options.maxOperations,
        generation: context.generation,
        draftId: context.draftId,
        registerCleanup: context.registerCleanup,
        onDiagnostic: this.options.onDiagnostic,
        onConditionalDiagnostic: this.options.onConditionalDiagnostic,
        onReport: (report: ApplyReport) => {
          context.assertCurrent();
          this.options.onReport?.(report);
        },
        fetch: this.networkFetch(context.signal),
      });
      this.runtime = runtimeInstance;
      const runtime = await runtimeInstance.start();
      context.assertCurrent();
      if (options.version !== undefined && (options.accessToken ?? this.options.accessToken) && !('mode' in runtime)) {
        context.registerCleanup(installPreviewReportBridge({document: getBrowserDocument(this.options.document),
          apiBaseUrl: this.options.apiBaseUrl, projectKey: this.projectKey, report: runtime, isCurrent: context.isCurrent}));
      }
      if (options.deployment && 'mode' in runtime) {
        runtimeInstance.destroy();
        if (this.runtime === runtimeInstance) this.runtime = undefined;
      }
      else this.runtime = runtimeInstance;
      return {
        mode: options.deployment && 'mode' in runtime ? 'native' : modeForRuntime(options),
        reason: defaultReason(runtime),
        runtime,
      };
    } catch (error) {
      runtimeInstance?.destroy();
      if (this.runtime === runtimeInstance) this.runtime = undefined;
      context.assertCurrent();
      if (error instanceof LykarSdkError && error.code.startsWith('RUNTIME_ASSET_')) {
        return {mode: 'native', reason: 'RUNTIME_ASSET_UNAVAILABLE'};
      }
      if (options.deployment) return {mode: 'native', reason: 'DEPLOYMENT_UNAVAILABLE'};
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

  private networkFetch(sessionSignal?: AbortSignal): FetchLike | undefined {
    const base = this.options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!base) return undefined;
    const configuredTimeout = this.options.networkTimeoutMs;
    const timeoutMs = configuredTimeout !== undefined && Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout : 5_000;
    return async (input, init = {}) => {
      const controller = new AbortController();
      const upstreamSignals = [init.signal, sessionSignal].filter(Boolean) as AbortSignal[];
      const abortFromUpstream = (signal: AbortSignal) => controller.abort(signal.reason);
      const abortHandlers = new Map<AbortSignal, () => void>();
      for (const signal of upstreamSignals) {
        if (signal.aborted) abortFromUpstream(signal);
        else {
          const handler = () => abortFromUpstream(signal);
          abortHandlers.set(signal, handler);
          signal.addEventListener('abort', handler, {once: true});
        }
      }
      const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await abortable((async () => {
          if (controller.signal.aborted) throw abortError();
          const response = await base(input, {...init, signal: controller.signal});
          if (response.body === null || response.body === undefined) return response;
          const body = await response.arrayBuffer();
          return new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        })(), controller.signal);
      } finally {
        if (timer !== undefined) globalThis.clearTimeout(timer);
        for (const [signal, handler] of abortHandlers) signal.removeEventListener('abort', handler);
      }
    };
  }

  private async startEditor(
    document: Document,
    capability: SdkEditorCapability,
    context: PageSessionContext,
  ): Promise<LykarSdkResult> {
    await waitForBody(document, context.signal);
    context.assertCurrent();
    const editorAsset = await this.resolveEditorAsset(document, context);
    context.assertCurrent();
    // EditorSession owns base and Draft replay together, including conditional overlays.
    if ((RuntimeLykar as unknown as {external?: boolean}).external === true) {
      try {
        await this.ensureRuntimeCore(document, context);
      } catch (error) {
        if (error instanceof LykarSdkError && error.code.startsWith('RUNTIME_ASSET_')) {
          return {mode: 'native', reason: 'RUNTIME_ASSET_UNAVAILABLE'};
        }
        throw error;
      }
    }
    context.assertCurrent();
    const editorApi = await this.loadEditorApi(document, editorAsset, context);
    context.assertCurrent();
    const editor = editorApi.start({
      capability,
      document,
      root: context.root,
      onApply: this.options.onEditorApply,
      onCommit: this.options.onEditorCommit,
    });
    context.assertCurrent();
    this.editor = editor;
    context.registerCleanup(() => editor.destroy?.());
    return {
      mode: 'editor',
      capability,
      editor,
    };
  }

  private async loadEditorApi(
    document: Document,
    editorAsset: EditorAsset,
    context: PageSessionContext,
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
    const unregisterScript = context.registerCleanup(() => script.remove());
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
      const aborted = () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        script.remove();
        reject(abortError());
      };
      context.signal.addEventListener('abort', aborted, {once: true});
      script.addEventListener('load', () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        context.signal.removeEventListener('abort', aborted);
        resolve();
      });
      script.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        context.signal.removeEventListener('abort', aborted);
        script.remove();
        reject(new LykarSdkError('EDITOR_ASSET_LOAD_FAILED', 'Editor asset failed to load.'));
      });
      (document.head ?? document.documentElement).appendChild(script);
    });
    unregisterScript();
    context.assertCurrent();

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

  private async resolveEditorAsset(
    document: Document,
    context: PageSessionContext,
  ): Promise<EditorAsset> {
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
    const request = this.networkFetch(context.signal);
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
      context.assertCurrent();
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
      context.assertCurrent();
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

  private connectionAssetUrls(document: Document): string[] {
    try {
      const editor = new URL(this.editorAssetUrl(document), document.location.href);
      return [editor.toString(),
        new URL(this.options.runtimeAssetUrl ?? 'runtime-core.iife.js', editor).toString(),
        new URL(this.options.assetManifestUrl ?? 'asset-manifest.json', editor).toString()];
    } catch { return []; }
  }

  private sharePath(document: Document): string {
    return `${document.location.origin}${this.pathnameOverride ?? this.options.pathname ?? document.location.pathname}`;
  }

  private rememberShare(document: Document, access: SdkShareAccess): void {
    const key = this.sharePath(document);
    this.shareByPath.delete(key);
    const expiry = Date.parse(access.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return;
    this.shareByPath.set(key, access);
    while (this.shareByPath.size > 16) {
      this.shareByPath.delete(this.shareByPath.keys().next().value!);
    }
  }

  private cachedShare(document: Document): SdkShareAccess | null {
    for (const [key, access] of this.shareByPath) {
      if (!Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= Date.now()) {
        this.shareByPath.delete(key);
      }
    }
    return this.shareByPath.get(this.sharePath(document)) ?? null;
  }

  private async ensureRuntimeCore(document: Document, context: PageSessionContext): Promise<void> {
    if (!this.runtimeLoadPromise) {
      const controller = new AbortController();
      this.runtimeLoadController = controller;
      const loading = this.resolveRuntimeAsset(document, controller.signal)
        .then(asset => this.loadRuntimeCore(document, asset, controller.signal));
      this.runtimeLoadPromise = loading;
      void loading.catch(() => {
        if (this.runtimeLoadPromise === loading) this.runtimeLoadPromise = undefined;
      }).finally(() => {
        if (this.runtimeLoadController === controller) this.runtimeLoadController = undefined;
      });
    }
    await abortable(this.runtimeLoadPromise, context.signal);
    context.assertCurrent();
  }

  private async resolveRuntimeAsset(document: Document, signal: AbortSignal): Promise<EditorAsset> {
    const assetUrl = new URL(
      this.options.runtimeAssetUrl ?? 'runtime-core.iife.js',
      new URL(this.editorAssetUrl(document), document.location.href),
    );
    const allowedOrigin = this.options.editorAssetOrigin
      ? new URL(this.options.editorAssetOrigin, document.location.href).origin
      : document.location.origin;
    if (assetUrl.origin !== allowedOrigin) {
      throw new LykarSdkError('RUNTIME_ASSET_ORIGIN_MISMATCH', 'Runtime asset origin is not allowed.');
    }
    const manifestUrl = new URL(this.options.assetManifestUrl ?? 'asset-manifest.json', assetUrl);
    if (manifestUrl.origin !== allowedOrigin) {
      throw new LykarSdkError('RUNTIME_ASSET_ORIGIN_MISMATCH', 'Runtime manifest origin is not allowed.');
    }
    const request = this.networkFetch(signal);
    if (!request) throw new LykarSdkError('RUNTIME_ASSET_NO_FETCH', 'Runtime asset verification requires fetch.');
    let response: Response;
    try {
      response = await request(manifestUrl.toString(), {headers: {Accept: 'application/json'}});
    } catch (error) {
      throw new LykarSdkError('RUNTIME_ASSET_MANIFEST_REQUEST_FAILED', 'Runtime asset manifest request failed.', error);
    }
    if (!response.ok) {
      throw new LykarSdkError('RUNTIME_ASSET_MANIFEST_REQUEST_FAILED',
        `Runtime asset manifest returned HTTP ${response.status}.`);
    }
    let manifest: SdkAssetManifest;
    try {
      manifest = validateAssetManifest(await response.json());
    } catch (error) {
      throw new LykarSdkError('RUNTIME_ASSET_INVALID', 'Runtime asset manifest is invalid.', error);
    }
    const entry = validateRuntimeAssetEntry(manifest);
    const filename = assetUrl.pathname.split('/').at(-1);
    if (filename !== entry.path && filename !== entry.versionedPath) {
      throw new LykarSdkError('RUNTIME_ASSET_COMPATIBILITY_MISMATCH',
        'Configured runtime asset is not in the compatible SDK asset set.');
    }
    return {url: assetUrl.toString(), integrity: entry.integrity};
  }

  private async loadRuntimeCore(document: Document, asset: EditorAsset, signal: AbortSignal): Promise<void> {
    const view = document.defaultView;
    if (!view) throw new LykarSdkError('RUNTIME_ASSET_INVALID', 'Runtime asset requires a browser window.');
    const compatible = (core: RuntimeCore | undefined) => Boolean(core
      && typeof core.Lykar === 'function'
      && typeof core.ManifestRequestError === 'function'
      && Object.entries(SDK_COMPATIBILITY).every(([key, value]) =>
        core.compatibility?.[key as keyof typeof SDK_COMPATIBILITY] === value));
    const existing = runtimeCore(document);
    if (existing) {
      if (compatible(existing) && verifiedRuntimeAssets.get(view)?.get(asset.url) === asset.integrity) return;
      throw new LykarSdkError('RUNTIME_ASSET_COMPATIBILITY_MISMATCH',
        'An unverified or incompatible runtime asset is already loaded.');
    }

    const script = document.createElement('script');
    script.src = asset.url;
    script.integrity = asset.integrity;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.dataset.lykarRuntimeAsset = 'true';
    const configuredTimeout = this.options.runtimeAssetTimeoutMs;
    const timeoutMs = configuredTimeout !== undefined && Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? Math.min(configuredTimeout, 30_000) : 10_000;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        signal.removeEventListener('abort', aborted);
        script.remove();
        if (error) reject(error);
        else resolve();
      };
      const aborted = () => finish(abortError());
      const timer = globalThis.setTimeout(() => finish(new LykarSdkError('RUNTIME_ASSET_TIMEOUT',
        `Runtime asset did not load within ${timeoutMs}ms.`)), timeoutMs);
      signal.addEventListener('abort', aborted, {once: true});
      script.addEventListener('load', () => finish());
      script.addEventListener('error', () => finish(new LykarSdkError('RUNTIME_ASSET_LOAD_FAILED',
        'Runtime asset failed to load.')));
      if (signal.aborted) aborted();
      else (document.head ?? document.documentElement).appendChild(script);
    });
    if (!compatible(runtimeCore(document))) {
      throw new LykarSdkError('RUNTIME_ASSET_INVALID', 'Runtime asset did not expose a compatible core.');
    }
    const verified = verifiedRuntimeAssets.get(view) ?? new Map<string, string>();
    verified.set(asset.url, asset.integrity);
    verifiedRuntimeAssets.set(view, verified);
  }

  private numberParam(value: string | null): number | undefined {
    if (value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  private startPageSession(document: Document, rotate: boolean): PageSessionContext | undefined {
    const root = this.rootOverride ?? this.options.root ?? document;
    if (root.nodeType === 1 && root.ownerDocument !== document) return undefined;
    const scope = {
      pathname: this.pathnameOverride ?? this.options.pathname ?? document.location?.pathname ?? '/',
      root,
    };
    this.pageSession ??= new PageSession(this.projectKey);
    return rotate ? this.pageSession.refresh(scope) : this.pageSession.start(scope);
  }

  private cleanupActiveHandles(): void {
    this.editor?.destroy?.();
    this.editor = undefined;
    this.runtime?.destroy();
    this.runtime = undefined;
  }

  private lifecycleResult(error: unknown, context: PageSessionContext): LykarSdkResult {
    if (!context.isCurrent() || isPageSessionStale(error)) {
      return {mode: 'native', reason: 'PAGE_SESSION_STALE'};
    }
    return this.fail(error);
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

function abortError(): Error {
  const error = new Error('Lykar SDK lifecycle was aborted.');
  error.name = 'AbortError';
  return error;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(abortError());
    signal.addEventListener('abort', aborted, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    if (signal.aborted) aborted();
  });
}
