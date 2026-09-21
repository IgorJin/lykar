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
