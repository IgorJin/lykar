import {afterEach, describe, expect, it, vi} from 'vitest';
import {Lykar} from './sdk.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json'},
  });
}

function assetManifest(runtime = '0.0.0') {
  return {
    schemaVersion: 1,
    package: '@lykar/sdk',
    packageVersion: '0.0.0',
    compatibility: {
      sdk: '0.0.0',
      runtime,
      editor: '0.0.0',
      protocol: '0.0.0',
      protocolSchema: 1,
      pageRelease: 'external',
    },
    assets: {
      'editor.iife.js': {
        path: 'editor.iife.js',
        bytes: 1,
        sha256: 'a'.repeat(64),
        integrity: 'sha256-qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
        versionedPath: 'editor-0.0.0.iife.js',
      },
    },
  };
}

function editorCapability() {
  return {
    capability: {
      token: 'x'.repeat(48),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      projectId: 'project-test',
      pageUrl: `${window.location.origin}${window.location.pathname}`,
      draftId: 'draft-test',
      expectedRevision: 0,
      baseVersion: null,
    },
  };
}

function pageManifest(pathname: string, value: string, releaseId = `release-${pathname}`) {
  return {
    schemaVersion: 1,
    projectId: 'project-session',
    pageId: `page-${pathname}`,
    pathname,
    releaseId,
    version: 1,
    manifestHash: 'b'.repeat(64),
    operations: [{
      schemaVersion: 1,
      id: `text-${pathname}`,
      kind: 'setText',
      target: {marker: 'copy'},
      value,
    }],
    createdAt: '2026-09-22T00:00:00.000Z',
  };
}

describe('Lykar SDK', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
    document.head.querySelectorAll('[data-lykar-editor-asset]').forEach(node => node.remove());
    delete (window as typeof window & {LykarEditor?: unknown}).LykarEditor;
    delete (window as typeof window & {__LYKAR_VERIFIED_EDITOR_ASSETS__?: unknown})
      .__LYKAR_VERIFIED_EDITOR_ASSETS__;
  });

  it('is constructible without a browser document', () => {
    expect(() => new Lykar({projectKey: 'pk_test'})).not.toThrow();
  });

  it('keeps ordinary links-only visits native without a network request', async () => {
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '<main>Original</main>';
    const fetch = vi.fn<typeof globalThis.fetch>();
    const sdk = new Lykar({projectKey: 'pk_test', document, fetch});

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'native', reason: 'LINKS_ONLY_NATIVE'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the same in-flight start and creates only one replay', async () => {
    document.body.innerHTML = '<p data-lykar-id="copy">Before</p>';
    let resolveFetch!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(resolve => { resolveFetch = resolve; }));
    const sdk = new Lykar({projectKey: 'pk_test', document, fetch, version: 1, waitForDom: false});

    const first = sdk.start();
    const second = sdk.start();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    resolveFetch(response({manifest: pageManifest('/', 'After')}));

    await expect(first).resolves.toMatchObject({mode: 'visitor'});
    await expect(second).resolves.toMatchObject({mode: 'visitor'});
    expect(document.querySelector('p')?.textContent).toBe('After');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('drops Page A after navigating to B even when the old transport ignores abort', async () => {
    document.body.innerHTML = `
      <main id="a"><p data-lykar-id="copy">A native</p></main>
      <main id="b"><p data-lykar-id="copy">B native</p></main>
    `;
    const rootA = document.querySelector('#a')!;
    const rootB = document.querySelector('#b')!;
    let resolveA!: (response: Response) => void;
    const reports: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const pathname = new URL(String(input), window.location.origin).searchParams.get('pathname');
      if (pathname === '/a') return new Promise(resolve => { resolveA = resolve; });
      if (pathname === '/b') return Promise.resolve(response({manifest: pageManifest('/b', 'B applied')}));
      throw new Error(`Unexpected pathname ${pathname}`);
    });
    const sdk = new Lykar({
      projectKey: 'pk_test', document, root: rootA, pathname: '/a', fetch,
      version: 1, waitForDom: false, onReport: report => reports.push(report.pageId),
    });

    const pageA = sdk.start();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const pageB = sdk.navigate({pathname: '/b', root: rootB});
    await expect(pageB).resolves.toMatchObject({mode: 'visitor'});
    resolveA(response({manifest: pageManifest('/a', 'A late')}));
    await expect(pageA).resolves.toMatchObject({mode: 'native', reason: 'PAGE_SESSION_STALE'});

    expect(rootA.textContent).toContain('A native');
    expect(rootB.textContent).toContain('B applied');
    expect(reports).toEqual(['page-/b']);
  });

  it('prevents late work after destroy and supports start/destroy/start', async () => {
    document.body.innerHTML = '<main id="root"><p data-lykar-id="copy">Native</p></main>';
    const root = document.querySelector('#root')!;
    let resolveFirst!: (response: Response) => void;
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      calls += 1;
      if (calls === 1) return new Promise(resolve => { resolveFirst = resolve; });
      return Promise.resolve(response({manifest: pageManifest('/', 'Restarted', 'release-restart')}));
    });
    const onReport = vi.fn();
    const sdk = new Lykar({
      projectKey: 'pk_test', document, root, fetch, version: 1, waitForDom: false, onReport,
    });

    const staleStart = sdk.start();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await sdk.destroy();
    resolveFirst(response({manifest: pageManifest('/', 'Late', 'release-late')}));
    await expect(staleStart).resolves.toMatchObject({reason: 'PAGE_SESSION_STALE'});
    expect(root.textContent).toContain('Native');
    expect(onReport).not.toHaveBeenCalled();

    await expect(sdk.start()).resolves.toMatchObject({mode: 'visitor'});
    expect(root.textContent).toContain('Restarted');
    expect(onReport).toHaveBeenCalledOnce();
  });

  it('does not persist or bootstrap a late editor capability after destroy', async () => {
    window.history.replaceState({}, '', '/#lykar_edit=late-editor-code');
    let resolveExchange!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise(resolve => { resolveExchange = resolve; }));
    const sdk = new Lykar({
      projectKey: 'pk_test', mode: 'editor', apiBaseUrl: 'https://api.test',
      document, fetch, waitForDom: false,
    });

    const started = sdk.start();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await sdk.destroy();
    resolveExchange(response(editorCapability()));
    await expect(started).resolves.toMatchObject({reason: 'PAGE_SESSION_STALE'});

    expect(window.location.hash).toBe('#lykar_edit=late-editor-code');
    expect(window.sessionStorage.length).toBe(0);
    expect(document.querySelector('[data-lykar-editor-asset]')).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects mutually exclusive URL selectors before exchanging access', async () => {
    window.history.replaceState({}, '', '/?version=3&lykar_variant=variant-code#lykar_share=share-code');
    const fetch = vi.fn<typeof globalThis.fetch>();
    const sdk = new Lykar({projectKey: 'pk_test', document, fetch});

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'error', reason: 'AMBIGUOUS_ACCESS_MODE'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs the runtime only for an explicit visitor selector', async () => {
    window.history.replaceState({}, '', '/pricing?version=3');
    document.body.innerHTML = '<main>Original</main>';
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(null, {status: 204}),
    );
    const sdk = new Lykar({projectKey: 'pk_test', document, fetch});

    const result = await sdk.start();

    expect(result.mode).toBe('visitor');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['version', {version: 3}, 'visitor'],
    ['variant token', {variantToken: 'variant-from-options'}, 'variant'],
    ['experiment token', {experimentToken: 'experiment-from-options'}, 'experiment'],
  ] as const)('honors an npm %s selector in auto mode', async (_name, selector, mode) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(null, {status: 204}),
    );
    const sdk = new Lykar({projectKey: 'pk_test', document, fetch, ...selector});

    const result = await sdk.start();

    expect(result.mode).toBe(mode);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects mutually exclusive npm runtime selectors before requesting data', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const sdk = new Lykar({
      projectKey: 'pk_test',
      document,
      fetch,
      version: 3,
      variantToken: 'variant-from-options',
    });

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'error', reason: 'AMBIGUOUS_ACCESS_MODE'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails open when an explicit runtime request exceeds its deadline', async () => {
    window.history.replaceState({}, '', '/?version=3');
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
    }));
    const sdk = new Lykar({
      projectKey: 'pk_test',
      document,
      fetch,
      networkTimeoutMs: 5,
    });

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'native', reason: 'NETWORK_UNAVAILABLE'});
  });

  it('keeps the network deadline active while reading the response body', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Timed out', 'AbortError'));
          });
        },
      });
      return Promise.resolve(new Response(body, {status: 200}));
    });
    const sdk = new Lykar({
      projectKey: 'pk_test',
      document,
      fetch,
      version: 3,
      networkTimeoutMs: 5,
    });

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'native', reason: 'NETWORK_UNAVAILABLE'});
  });

  it('reports an asynchronous editor asset timeout through onError', async () => {
    window.history.replaceState({}, '', '/#lykar_edit=editor-code');
    const onError = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const url = String(input);
      if (url === 'https://api.test/api/editor/exchange') return Promise.resolve(response(editorCapability()));
      if (url === `${window.location.origin}/asset-manifest.json`) {
        return Promise.resolve(response(assetManifest()));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const sdk = new Lykar({
      projectKey: 'pk_test',
      apiBaseUrl: 'https://api.test',
      document,
      fetch,
      editorAssetTimeoutMs: 5,
      onError,
    });

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'error', reason: 'EDITOR_ASSET_TIMEOUT'});
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({code: 'EDITOR_ASSET_TIMEOUT'}));
    expect(document.querySelector('[data-lykar-editor-asset]')).toBeNull();
  });

  it('rejects an editor manifest from an incompatible runtime before loading code', async () => {
    window.history.replaceState({}, '', '/#lykar_edit=editor-code');
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const url = String(input);
      if (url === 'https://api.test/api/editor/exchange') return Promise.resolve(response(editorCapability()));
      if (url === `${window.location.origin}/asset-manifest.json`) {
        return Promise.resolve(response(assetManifest('9.9.9')));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const sdk = new Lykar({
      projectKey: 'pk_test',
      apiBaseUrl: 'https://api.test',
      document,
      fetch,
    });

    const result = await sdk.start();

    expect(result).toMatchObject({mode: 'error', reason: 'ASSET_COMPATIBILITY_MISMATCH'});
    expect(document.querySelector('[data-lykar-editor-asset]')).toBeNull();
  });
});
