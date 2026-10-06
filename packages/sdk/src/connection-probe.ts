import {SDK_COMPATIBILITY} from './compatibility.js';
import {isConnectionCheckRequest, type ConnectionReport} from '@lykar/protocol';

type AssetStatus = 'ready' | 'unavailable' | 'unchecked';
type CspDirective = 'connect-src' | 'script-src' | 'style-src';
export type ConnectionFrameworkMode = 'static' | 'csr' | 'hydrated' | 'streaming' | 'rsc';
type FrameworkRoot = {root: Element | Document; framework: string; phase: string; mode: string};

export function connectionReadiness(document: Document, mode?: ConnectionFrameworkMode): 'ready' | 'unsupported' | 'pending' {
  if (mode === 'streaming' || mode === 'rsc') return 'unsupported';
  if (!document.body || document.readyState === 'loading') return 'pending';
  if (mode === 'static') return 'ready';
  const roots = (document.defaultView as unknown as Record<symbol, Map<unknown, FrameworkRoot> | undefined> | null)
    ?.[Symbol.for('@lykar/framework-roots/v1')];
  const active = [...(roots?.values() ?? [])].filter(entry => entry.root === document || entry.root.isConnected);
  if (!active.length) return 'pending';
  if (active.some(entry => !['react', 'vue'].includes(entry.framework) || !['csr', 'hydrate'].includes(entry.mode))) return 'unsupported';
  if (mode && active.some(entry => entry.mode !== (mode === 'hydrated' ? 'hydrate' : 'csr'))) return 'unsupported';
  return active.every(entry => entry.phase === 'ready') ? 'ready' : 'pending';
}

/** A fresh, advisory challenge response; loading assets never starts an editor or changes page content. */
export function installConnectionProbe(options: {
  document: Document; apiBaseUrl?: string; projectKey: string; frameworkMode?: ConnectionFrameworkMode;
  assetUrls: string[]; isCurrent: () => boolean;
  runtime: () => Promise<void>; editor: () => Promise<void>;
  fetch?: typeof fetch; networkTimeoutMs?: number;
}): () => void {
  const document = options.document;
  const view = document.defaultView;
  if (!view) return () => {};
  const apiOrigin = new URL(options.apiBaseUrl || view.location.origin, view.location.href).origin;
  const assetUrls = options.assetUrls.flatMap(value => {
    try { return [new URL(value, view.location.href)]; } catch { return []; }
  });
  const csp = new Set<CspDirective>();
  const completed = new Set<string>();
  let disposed = false;
  let checking = false;
  let styleProbe = false;
  const currentPage = () => `${view.location.origin}${view.location.pathname}`;
  const initialPage = currentPage();
  const current = () => !disposed && options.isCurrent() && currentPage() === initialPage;
  const violation = (event: SecurityPolicyViolationEvent) => {
    if (!current() || event.disposition === 'report') return;
    const directive = event.effectiveDirective;
    const kind: CspDirective | undefined = directive.startsWith('connect-src') ? 'connect-src'
      : directive.startsWith('script-src') ? 'script-src'
      : directive.startsWith('style-src') ? 'style-src' : undefined;
    if (!kind) return;
    if (kind === 'style-src') {
      if (styleProbe) csp.add(kind);
      return;
    }
    let blocked: URL;
    try { blocked = new URL(event.blockedURI); } catch { return; }
    if ((kind === 'connect-src' && blocked.origin === apiOrigin)
      || assetUrls.some(asset => asset.href === blocked.href || (blocked.pathname === '/' && asset.origin === blocked.origin))) csp.add(kind);
  };
  const receive = (event: MessageEvent) => {
    if (!current() || event.origin !== apiOrigin || !event.source || event.source === view) return;
    const request: unknown = event.data;
    if (!isConnectionCheckRequest(request) || request.pageUrl !== initialPage
      || completed.has(request.nonce) || checking) return;
    const source = event.source as Window;
    const nonce = request.nonce;
    checking = true;
    void (async () => {
      let api: 'reachable' | 'unreachable' | 'unchecked' = 'unchecked';
      const fetcher = options.fetch ?? globalThis.fetch?.bind(globalThis);
      if (fetcher && current()) {
        const controller = new AbortController();
        const configured = options.networkTimeoutMs;
        const timeoutMs = configured !== undefined && Number.isFinite(configured) && configured > 0
          ? Math.min(configured, 5_000) : 5_000;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            (async () => {
              const response = await fetcher(new URL('/api/connection/ping', apiOrigin).toString(), {
                method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
                headers: {Accept: 'application/json'}, signal: controller.signal,
              });
              if (!response.ok) return false;
              const payload: unknown = await response.json();
              return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload)
                && (payload as Record<string, unknown>).ok === true
                && (payload as Record<string, unknown>).schemaVersion === 1);
            })(),
            new Promise<boolean>(resolve => {
              timer = setTimeout(() => { controller.abort(); resolve(false); }, timeoutMs);
            }),
          ]);
          api = current() ? result ? 'reachable' : 'unreachable' : 'unchecked';
        } catch { api = current() ? 'unreachable' : 'unchecked'; }
        finally { if (timer !== undefined) clearTimeout(timer); }
      }
      const check = async (load: () => Promise<void>): Promise<AssetStatus> => {
        if (!current()) return 'unchecked';
        try { await load(); return current() ? 'ready' : 'unchecked'; }
        catch { return current() ? 'unavailable' : 'unchecked'; }
      };
      // Sequential loading also respects the editor's dependency on the verified runtime core.
      const runtimeAsset = await check(options.runtime);
      const editorAsset = await check(options.editor);
      if (!current()) return;
      const style = document.createElement('style');
      const sentinel = document.createElement('div');
      sentinel.hidden = true;
      sentinel.setAttribute('data-lykar-connection-style', '');
      style.textContent = '[data-lykar-connection-style] { width: 1px !important; }';
      styleProbe = true;
      try {
        (document.head ?? document.documentElement).append(style);
        (document.body ?? document.documentElement).append(sentinel);
        // CSP events are delivered asynchronously. Do not infer a CSP violation from missing events.
        await new Promise(resolve => view.setTimeout(resolve, 0));
      } finally {
        style.remove(); sentinel.remove(); styleProbe = false;
      }
      if (!current()) return;
      completed.add(nonce);
      if (completed.size > 16) completed.delete(completed.values().next().value!);
      const report: ConnectionReport = {type: 'lykar:connection-report', schemaVersion: 1, nonce,
        pageUrl: initialPage, projectKey: options.projectKey, sdkVersion: SDK_COMPATIBILITY.sdk,
        api, runtimeAsset, editorAsset, readiness: connectionReadiness(document, options.frameworkMode),
        csp: [...csp].sort()};
      source.postMessage(report, event.origin);
    })().catch(() => { /* Advisory diagnostics must not interrupt the host page. */ })
      .finally(() => { checking = false; });
  };
  view.addEventListener('securitypolicyviolation', violation);
  view.addEventListener('message', receive);
  return () => {
    disposed = true;
    view.removeEventListener('securitypolicyviolation', violation);
    view.removeEventListener('message', receive);
  };
}
