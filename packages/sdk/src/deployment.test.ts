import {afterEach, describe, expect, it, vi} from 'vitest';
import {Lykar} from './sdk.js';
import type {LykarSdkOptions} from './types.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

function manifest(pathname: string, value: string, releaseId = `release-${pathname}`) {
  return {
    schemaVersion: 1,
    projectId: 'project-deployment',
    pageId: `page-${pathname}`,
    pathname,
    releaseId,
    version: 1,
    manifestHash: 'b'.repeat(64),
    operations: [{
      schemaVersion: 1, id: `text-${releaseId}`, kind: 'setText',
      target: {marker: 'copy'}, value,
    }],
    createdAt: '2026-09-22T00:00:00.000Z',
  };
}

function deployment(pathname: string, value: string, revision = 1, releaseId = `release-${pathname}`) {
  return {pageId: `page-${pathname}`, revision, activeReleaseId: releaseId,
    manifest: manifest(pathname, value, releaseId)};
}

const instances: Lykar[] = [];
function sdk(options: Partial<LykarSdkOptions> = {}) {
  const instance = new Lykar({
    projectKey: 'pk_deployment', apiBaseUrl: 'https://api.test', document,
    delivery: 'deployment', waitForDom: false, ...options,
  });
  instances.push(instance);
  return instance;
}

async function flushMicrotasks() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function requestedPath(input: RequestInfo | URL) {
  return new URL(String(input), window.location.origin).pathname;
}

describe('SDK opt-in deployment delivery', () => {
  afterEach(async () => {
    for (const instance of instances.splice(0)) await instance.destroy();
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
    document.body.innerHTML = '';
    window.sessionStorage.clear();
    document.head.querySelectorAll('[data-lykar-editor-asset]').forEach(node => node.remove());
  });

  it.each(['auto', 'visitor'] as const)('applies ordinary visits in %s mode without editor or analytics requests', async mode => {
    window.history.replaceState({}, '', '/pricing?campaign=autumn');
    document.body.innerHTML = '<p data-lykar-id="copy">Native</p>';
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(() =>
      Promise.resolve(response(deployment('/pricing', 'Published', 7))));
    const instance = sdk({mode, fetch, analyticsConsent: 'granted', credentials: 'include'});

    const result = await instance.start();
    expect(result).toMatchObject({mode: 'visitor', runtime: {
      applied: 1, deployment: {pageId: 'page-/pricing', revision: 7, activeReleaseId: 'release-/pricing'},
    }});
    expect(document.querySelector('p')?.textContent).toBe('Published');
    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0]!;
    const url = new URL(String(input));
    expect(url.pathname).toBe('/api/runtime/projects/pk_deployment/deployment');
    expect([...url.searchParams.entries()]).toEqual([['pathname', '/pricing']]);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    await expect(instance.track('purchase')).resolves.toMatchObject({accepted: false, code: 'NO_ACTIVE_EXPERIMENT'});
    instance.consent('granted');
    expect(fetch).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-lykar-editor-asset]')).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('memoizes start but re-resolves refresh, disable and rollback without retaining an active pointer', async () => {
    window.history.replaceState({}, '', '/pricing');
    document.body.innerHTML = '<p data-lykar-id="copy">Native</p>';
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(deployment('/pricing', 'Release one', 1, 'release-one')))
      .mockResolvedValueOnce(response(deployment('/pricing', 'Release two', 2, 'release-two')))
      .mockResolvedValueOnce(response({pageId: 'page-/pricing', revision: 3, activeReleaseId: null, manifest: null}))
      .mockResolvedValueOnce(response(deployment('/pricing', 'Release one', 4, 'release-one')));
    const instance = sdk({fetch});
    const first = instance.start();
    const repeated = instance.start();
    await expect(first).resolves.toMatchObject({mode: 'visitor'});
    await expect(repeated).resolves.toMatchObject({mode: 'visitor'});
    await instance.start();
    expect(fetch).toHaveBeenCalledOnce();
    expect(document.querySelector('p')?.textContent).toBe('Release one');

    await expect(instance.refresh()).resolves.toMatchObject({mode: 'visitor', runtime: {deployment: {revision: 2}}});
    expect(document.querySelector('p')?.textContent).toBe('Release two');
    await expect(instance.refresh()).resolves.toMatchObject({mode: 'native', reason: 'NO_ACTIVE_DEPLOYMENT'});
    expect(document.querySelector('p')?.textContent).toBe('Native');
    instance.consent('granted');
    await expect(instance.track('purchase')).resolves.toEqual({accepted: false, code: 'NO_ACTIVE_RUNTIME'});
    await expect(instance.refresh()).resolves.toMatchObject({mode: 'visitor', runtime: {deployment: {revision: 4}}});
    expect(document.querySelector('p')?.textContent).toBe('Release one');
    expect(fetch).toHaveBeenCalledTimes(4);
    await instance.destroy();
    expect(document.querySelector('p')?.textContent).toBe('Native');
  });

  it('retires a never-settling A request immediately and applies only B when A resolves late', async () => {
    document.body.innerHTML = '<main id="a"><p data-lykar-id="copy">A native</p></main><main id="b"><p data-lykar-id="copy">B native</p></main>';
    const rootA = document.querySelector('#a')!;
    const rootB = document.querySelector('#b')!;
    let resolveA!: (value: Response) => void;
    const reports = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const pathname = new URL(String(input)).searchParams.get('pathname');
      return pathname === '/a'
        ? new Promise(resolve => { resolveA = resolve; })
        : Promise.resolve(response(deployment('/b', 'B published')));
    });
    const instance = sdk({fetch, pathname: '/a', root: rootA, onReport: reports});
    const a = instance.start();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await expect(instance.navigate({pathname: '/b', root: rootB})).resolves.toMatchObject({mode: 'visitor'});
    await expect(a).resolves.toMatchObject({mode: 'native', reason: 'PAGE_SESSION_STALE'});
    resolveA(response(deployment('/a', 'A late')));
    await flushMicrotasks();
    expect(rootA.textContent).toContain('A native');
    expect(rootB.textContent).toContain('B published');
    expect(reports).toHaveBeenCalledOnce();
    expect(reports).toHaveBeenCalledWith(expect.objectContaining({pageId: 'page-/b'}));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(['fetch', 'body'] as const)('enforces its deadline when %s ignores abort forever', async stage => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p data-lykar-id="copy">Native</p>';
    const fetch = vi.fn<typeof globalThis.fetch>(() => stage === 'fetch'
      ? new Promise<Response>(() => {})
      : Promise.resolve(new Response(new ReadableStream({start() {}}), {status: 200})));
    const instance = sdk({fetch, networkTimeoutMs: 10});
    let result: Awaited<ReturnType<Lykar['start']>> | undefined;
    const pending = instance.start().then(value => { result = value; });
    await flushMicrotasks();
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(11);
    await flushMicrotasks();
    expect(result).toMatchObject({mode: 'native'});
    expect(['NETWORK_UNAVAILABLE', 'DEPLOYMENT_UNAVAILABLE']).toContain(result?.reason);
    await pending;
    expect(document.querySelector('p')?.textContent).toBe('Native');
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it.each([NaN, Infinity, 0, -1])('keeps an invalid timeout %s within the default budget', async networkTimeoutMs => {
    vi.useFakeTimers();
    const fetch = vi.fn<typeof globalThis.fetch>(() => new Promise<Response>(() => {}));
    const instance = sdk({fetch, networkTimeoutMs});
    let result: Awaited<ReturnType<Lykar['start']>> | undefined;
    const pending = instance.start().then(value => { result = value; });
    await flushMicrotasks();
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5_001);
    await flushMicrotasks();
    expect(result).toMatchObject({mode: 'native'});
    await pending;
  });

  it.each([
    {revision: -1}, {revision: 1.5}, {revision: '1'}, {pageId: 'different-page'},
    {activeReleaseId: 'different-release'}, {activeReleaseId: null}, {manifest: null},
  ])('fails open for inconsistent deployment metadata %j', async patch => {
    document.body.innerHTML = '<p data-lykar-id="copy">Native</p>';
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({...deployment('/', 'Bad'), ...patch}));
    await expect(sdk({fetch}).start()).resolves.toMatchObject({mode: 'native', reason: 'DEPLOYMENT_UNAVAILABLE'});
    expect(document.querySelector('p')?.textContent).toBe('Native');
  });

  it('fails open when deployment replay cannot apply and leaves native DOM', async () => {
    document.body.innerHTML = '<p data-lykar-id="copy">Native</p>';
    const payload = deployment('/', 'Published');
    payload.manifest.operations[0]!.target.marker = 'missing';
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(payload));
    await expect(sdk({fetch}).start()).resolves.toMatchObject({mode: 'native', reason: 'DEPLOYMENT_APPLY_FAILED'});
    expect(document.querySelector('p')?.textContent).toBe('Native');
  });

  it('preserves newer host styles on destroy while restoring SDK-owned text', async () => {
    document.body.innerHTML = '<p data-lykar-id="copy" style="color: red">Native</p>';
    const payload = deployment('/', 'Published');
    const styledManifest = {...payload.manifest, operations: [...payload.manifest.operations, {
      schemaVersion: 1, id: 'color', kind: 'setStyle', target: {marker: 'copy'}, property: 'color', value: 'blue',
    }]};
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({...payload, manifest: styledManifest}));
    const instance = sdk({fetch});
    await expect(instance.start()).resolves.toMatchObject({mode: 'visitor'});
    const copy = document.querySelector('p')!;
    expect(copy.style.color).toBe('blue');
    copy.style.color = 'green';
    await instance.destroy();
    expect(copy.textContent).toBe('Native');
    expect(copy.style.color).toBe('green');
  });

  it.each([
    '/?version=', '/?version=bad', '/?version=0', '/?version=1&version=1',
    '/?lykar_variant=', '/?lykar_variant=x&lykar_variant=y',
    '/?lykar_experiment=', '/?lykar_experiment=x&lykar_experiment=y',
    '/?version=1&lykar_variant=x', '/#lykar_edit=', '/#lykar_share=',
  ])('never resolves deployment for malformed or ambiguous selection %s', async url => {
    window.history.replaceState({}, '', url);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, {status: 403}));
    await sdk({fetch}).start();
    expect(fetch.mock.calls.every(([input]) => !requestedPath(input).endsWith('/deployment'))).toBe(true);
  });

  it.each([
    {version: 3}, {variantToken: 'invalid-token'}, {experimentToken: 'invalid-token'},
    {mode: 'variant' as const}, {mode: 'experiment' as const}, {mode: 'editor' as const}, {mode: 'share' as const},
  ])('never falls back to deployment for explicit configuration %j', async options => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, {status: 403}));
    await sdk({...options, fetch}).start();
    expect(fetch.mock.calls.every(([input]) => !requestedPath(input).endsWith('/deployment'))).toBe(true);
  });

  it('requests the legacy manifest endpoint for an invalid variant token without deployment fallback', async () => {
    window.history.replaceState({}, '', '/?lykar_variant=invalid-token');
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, {status: 403}));
    await expect(sdk({fetch}).start()).resolves.toMatchObject({mode: 'native', reason: 'ACCESS_UNAVAILABLE'});
    expect(fetch).toHaveBeenCalledOnce();
    expect(requestedPath(fetch.mock.calls[0]![0])).toBe('/api/runtime/projects/pk_deployment/manifest');
  });

  it('rejects conflicting configuration and URL selectors before transport', async () => {
    window.history.replaceState({}, '', '/?lykar_variant=url-token');
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(sdk({fetch, version: 3}).start()).resolves.toMatchObject({mode: 'error', reason: 'AMBIGUOUS_ACCESS_MODE'});
    expect(fetch).not.toHaveBeenCalled();
  });
});
