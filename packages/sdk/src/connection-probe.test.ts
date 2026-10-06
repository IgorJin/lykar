import {afterEach, describe, expect, it, vi} from 'vitest';
import {connectionReadiness, installConnectionProbe} from './connection-probe.js';
import {Lykar} from './sdk.js';

const apiOrigin = 'https://admin.example';
const pageUrl = () => `${window.location.origin}${window.location.pathname}`;
const nonce = 'n'.repeat(32);
const rootsKey = Symbol.for('@lykar/framework-roots/v1');
const cleanups: Array<() => void> = [];
function request(source: object | null, data: unknown = {type: 'lykar:connection-check', schemaVersion: 1, nonce, pageUrl: pageUrl()}, origin = apiOrigin) {
  window.dispatchEvent(new MessageEvent('message', {data, origin, source: source as Window | null}));
}
function violation(effectiveDirective: string, blockedURI: string, disposition = 'enforce') {
  const event = new Event('securitypolicyviolation');
  Object.assign(event, {effectiveDirective, blockedURI, disposition});
  window.dispatchEvent(event);
}
function setup(overrides: Partial<Parameters<typeof installConnectionProbe>[0]> = {}) {
  const runtime = vi.fn(async () => {});
  const editor = vi.fn(async () => {});
  const stop = installConnectionProbe({document, projectKey: 'pk_actual', apiBaseUrl: apiOrigin,
    frameworkMode: 'static', assetUrls: ['https://assets.example/editor.iife.js'],
    fetch: vi.fn(async () => new Response(JSON.stringify({ok: true, schemaVersion: 1}), {headers: {'content-type': 'application/json'}})),
    isCurrent: () => true, runtime, editor, ...overrides});
  cleanups.push(stop);
  return {runtime, editor, stop};
}
async function report(source = {postMessage: vi.fn()}) {
  request(source);
  await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledOnce());
  return source.postMessage.mock.calls[0];
}

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
  window.history.replaceState({}, '', '/');
  document.body.innerHTML = '';
  document.head.querySelectorAll('[data-lykar-editor-asset], [data-lykar-runtime-asset]').forEach(node => node.remove());
  delete (window as unknown as Record<symbol, unknown>)[rootsKey];
  vi.restoreAllMocks();
});

describe('connection probe', () => {
  it('responds from an opener-free page with public, query-free evidence and the actual key', async () => {
    window.history.replaceState({}, '', '/page?access=secret#lykar_edit=secret');
    setup();
    const [data, targetOrigin] = await report();
    expect(data).toEqual({type: 'lykar:connection-report', schemaVersion: 1, nonce, pageUrl: pageUrl(),
      projectKey: 'pk_actual', sdkVersion: '0.0.0', api: 'reachable', runtimeAsset: 'ready', editorAsset: 'ready', readiness: 'ready', csp: []});
    expect(targetOrigin).toBe(apiOrigin);
    expect(JSON.stringify(data)).not.toContain('secret');
    expect(document.querySelector('[data-lykar-connection-style]')).toBeNull();
  });

  it.each(['origin', 'null-source', 'self-source', 'nonce-short', 'nonce-long', 'page-path', 'page-query', 'schema'])('rejects invalid %s before any asset request', async kind => {
    const {runtime, editor} = setup();
    const source = {postMessage: vi.fn()};
    const data = {type: 'lykar:connection-check', schemaVersion: 1, nonce, pageUrl: pageUrl()};
    if (kind === 'nonce-short') data.nonce = 'n'.repeat(31);
    if (kind === 'nonce-long') data.nonce = 'n'.repeat(129);
    if (kind === 'page-path') data.pageUrl += 'other';
    if (kind === 'page-query') data.pageUrl += '?secret=value';
    if (kind === 'schema') data.schemaVersion = 2;
    request(kind === 'null-source' ? null : kind === 'self-source' ? window : source,
      data, kind === 'origin' ? 'https://other.example' : apiOrigin);
    await Promise.resolve();
    expect(runtime).not.toHaveBeenCalled();
    expect(editor).not.toHaveBeenCalled();
    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it.each(['runtime', 'editor'])('reports an unavailable %s separately from readiness', async target => {
    setup({[target]: async () => { throw new Error('asset failed with private details'); }});
    const [data] = await report();
    expect(data.runtimeAsset).toBe(target === 'runtime' ? 'unavailable' : 'ready');
    expect(data.editorAsset).toBe(target === 'editor' ? 'unavailable' : 'ready');
    expect(data.readiness).toBe('ready');
    expect(JSON.stringify(data)).not.toContain('private');
  });

  it('keeps unknown readiness pending and unsupported modes distinct', async () => {
    setup({frameworkMode: undefined});
    expect((await report())[0].readiness).toBe('pending');
    expect(connectionReadiness(document, 'rsc')).toBe('unsupported');
    expect(connectionReadiness(document, 'streaming')).toBe('unsupported');
  });

  it('checks anonymous API access without cookies or redirects', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ok: true, schemaVersion: 1})));
    setup({fetch});
    expect((await report())[0].api).toBe('reachable');
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${apiOrigin}/api/connection/ping`, expect.objectContaining({
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal),
    }));
  });

  it.each(['network', 'http', 'payload', 'json', 'timeout'])('reports API %s failure without hiding working assets', async kind => {
    const fetch = vi.fn(async () => {
      if (kind === 'network') throw new TypeError('failed');
      if (kind === 'timeout') return new Promise<Response>(() => {});
      if (kind === 'http') return new Response('', {status: 503});
      return new Response(kind === 'json' ? 'not-json' : JSON.stringify({ok: true, schemaVersion: 2}));
    });
    setup({fetch, networkTimeoutMs: 5});
    const [data] = await report();
    expect(data).toMatchObject({api: 'unreachable', runtimeAsset: 'ready', editorAsset: 'ready'});
  });

  it('checks actual instrumented roots, phases and modes', () => {
    const root = document.createElement('main'); document.body.append(root);
    const roots = new Map([[root, {root, framework: 'react', phase: 'pending', mode: 'csr'}]]);
    (window as unknown as Record<symbol, unknown>)[rootsKey] = roots;
    expect(connectionReadiness(document, 'csr')).toBe('pending');
    roots.get(root)!.phase = 'ready';
    expect(connectionReadiness(document, 'csr')).toBe('ready');
    expect(connectionReadiness(document, 'hydrated')).toBe('unsupported');
    roots.get(root)!.framework = 'angular';
    expect(connectionReadiness(document, 'csr')).toBe('unsupported');
    root.remove();
    expect(connectionReadiness(document, 'csr')).toBe('pending');
  });

  it('collects correlated enforced CSP diagnostics from boot and the style check', async () => {
    setup({editor: async () => {
      violation('script-src-elem', 'https://assets.example/editor.iife.js');
      violation('connect-src', apiOrigin);
      violation('script-src', 'https://unrelated.example/a.js');
      violation('connect-src', apiOrigin, 'report');
    }});
    const append = vi.spyOn(document.head, 'append');
    append.mockImplementation((...nodes) => {
      for (const node of nodes) document.head.appendChild(node as Node);
      violation('style-src-elem', 'inline');
    });
    const [data] = await report();
    expect(data.csp).toEqual(['connect-src', 'script-src', 'style-src']);
  });

  it.each(['destroyed', 'navigation', 'generation'])('suppresses stale reports after %s during loading', async kind => {
    let release!: () => void;
    let active = true;
    const {stop, editor} = setup({runtime: () => new Promise(resolve => { release = resolve; }), isCurrent: () => active});
    const source = {postMessage: vi.fn()};
    request(source);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    if (kind === 'destroyed') stop();
    if (kind === 'navigation') window.history.replaceState({}, '', '/other');
    if (kind === 'generation') active = false;
    release();
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(editor).not.toHaveBeenCalled();
    expect(source.postMessage).not.toHaveBeenCalled();
  });

  it('coalesces polling into one check and permits a fresh nonce', async () => {
    const {runtime, editor} = setup();
    const source = {postMessage: vi.fn()};
    request(source); request(source);
    await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledOnce());
    request(source);
    expect(runtime).toHaveBeenCalledOnce(); expect(editor).toHaveBeenCalledOnce();
    request(source, {type: 'lykar:connection-check', schemaVersion: 1, nonce: 'm'.repeat(32), pageUrl: pageUrl()});
    await vi.waitFor(() => expect(source.postMessage).toHaveBeenCalledTimes(2));
  });

  it('adds no network requests to an ordinary native page and never starts the editor for a probe', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ok: true, schemaVersion: 1})));
    const sdk = new Lykar({projectKey: 'pk_sdk', document, fetch, apiBaseUrl: apiOrigin, frameworkMode: 'static'});
    cleanups.push(() => void sdk.destroy());
    const internal = sdk as unknown as {ensureRuntimeCore: () => Promise<void>; resolveEditorAsset: () => Promise<unknown>; loadEditorApi: () => Promise<unknown>};
    const start = vi.fn();
    vi.spyOn(internal, 'ensureRuntimeCore').mockResolvedValue(undefined);
    vi.spyOn(internal, 'resolveEditorAsset').mockResolvedValue({url: 'https://assets.example/editor.iife.js', integrity: 'sha256-test'});
    vi.spyOn(internal, 'loadEditorApi').mockResolvedValue({start});
    expect(await sdk.start()).toMatchObject({mode: 'native', reason: 'LINKS_ONLY_NATIVE'});
    expect(fetch).not.toHaveBeenCalled();
    const [data] = await report();
    expect(data).toMatchObject({projectKey: 'pk_sdk', runtimeAsset: 'ready', editorAsset: 'ready'});
    expect(start).not.toHaveBeenCalled();
    await sdk.destroy();
    const later = {postMessage: vi.fn()}; request(later);
    await Promise.resolve(); expect(later.postMessage).not.toHaveBeenCalled();
  });
});
