import type {OperationV1, PublishedManifestV1} from '@lykar/protocol';
import {JSDOM} from 'jsdom';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {fetchDeployment} from './deployment-client.js';
import {ManifestRequestError} from './manifest-client.js';
import {Lykar} from './runtime.js';
import type {FetchLike, LykarRuntimeOptions} from './types.js';

function response(payload: unknown, status = 200): Response {
  return {ok: status >= 200 && status < 300, status, json: async () => payload} as Response;
}

function text(id: string, marker: string, value: string): OperationV1 {
  return {schemaVersion: 1, id, kind: 'setText', target: {marker}, value};
}

function manifest(operations: OperationV1[] = [text('copy', 'copy', 'Published')]): PublishedManifestV1 {
  return {
    schemaVersion: 1, projectId: 'project-deployment', pageId: 'page-deployment',
    pathname: '/page', releaseId: 'release-deployment', version: 1,
    manifestHash: 'a'.repeat(64), operations, createdAt: '2026-09-22T00:00:00.000Z',
  };
}

function payload(operations?: OperationV1[]) {
  return {pageId: 'page-deployment', revision: 3, activeReleaseId: 'release-deployment',
    manifest: manifest(operations)};
}

const instances: Lykar[] = [];
const documents: JSDOM[] = [];
function runtime(options: Partial<LykarRuntimeOptions> = {}, url = 'https://site.test/page') {
  const dom = new JSDOM('<p data-lykar-id="copy">Native</p>', {url});
  documents.push(dom);
  const instance = new Lykar({projectKey: 'pk_deployment', apiBaseUrl: 'https://api.test',
    delivery: 'deployment', document: dom.window.document, waitForDom: false, ...options});
  instances.push(instance);
  return {instance, document: dom.window.document};
}

function path(input: RequestInfo | URL) {
  return new URL(String(input), 'https://site.test').pathname;
}

describe('anonymous deployment client', () => {
  it('returns null for HTTP 204 and preserves disabled pointer metadata', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValueOnce(response(undefined, 204))
      .mockResolvedValueOnce(response({pageId: 'page-deployment', revision: 4, activeReleaseId: null, manifest: null}));
    const options = {projectKey: 'pk_deployment', pathname: '/page', fetch};
    await expect(fetchDeployment(options)).resolves.toBeNull();
    await expect(fetchDeployment(options)).resolves.toEqual({
      pageId: 'page-deployment', revision: 4, activeReleaseId: null, manifest: null,
    });
  });

  it('uses an uncached anonymous GET and passes the caller cancellation signal', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(payload()));
    const controller = new AbortController();
    await fetchDeployment({projectKey: 'pk /public', apiBaseUrl: 'https://api.test/',
      pathname: '/page', fetch, signal: controller.signal});
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/runtime/projects/pk%20%2Fpublic/deployment?pathname=%2Fpage',
      {method: 'GET', credentials: 'omit', cache: 'no-store',
        headers: {Accept: 'application/json'}, signal: controller.signal},
    );
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
  });

  it.each([
    {pageId: ''}, {pageId: 'other-page'}, {revision: -1}, {revision: 1.5},
    {revision: '3'}, {revision: 0}, {activeReleaseId: null},
    {activeReleaseId: 'other-release'}, {manifest: null},
  ])('rejects inconsistent metadata %j', async patch => {
    const fetch: FetchLike = async () => response({...payload(), ...patch});
    await expect(fetchDeployment({projectKey: 'pk_deployment', pathname: '/page', fetch}))
      .rejects.toBeInstanceOf(ManifestRequestError);
  });

  it('rejects a valid manifest returned for another pathname', async () => {
    const fetch: FetchLike = async () => response(payload());
    await expect(fetchDeployment({projectKey: 'pk_deployment', pathname: '/other', fetch}))
      .rejects.toThrow(/pointer or path/);
  });

  it.each([403, 404, 500])('rejects HTTP %s without trying another endpoint', async status => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(undefined, status));
    await expect(fetchDeployment({projectKey: 'pk_deployment', pathname: '/page', fetch}))
      .rejects.toMatchObject({status});
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('direct runtime deployment delivery', () => {
  afterEach(() => {
    for (const instance of instances.splice(0)) instance.destroy();
    for (const dom of documents.splice(0)) dom.window.close();
  });

  it.each(['unconfigured', 'disabled'] as const)('keeps %s pages native', async state => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(state === 'unconfigured'
      ? response(undefined, 204)
      : response({pageId: 'page-deployment', revision: 4, activeReleaseId: null, manifest: null}));
    const {instance, document} = runtime({fetch});
    const result = await instance.start();
    expect(result).toMatchObject({mode: 'native', reason: 'NO_ACTIVE_DEPLOYMENT'});
    if (state === 'disabled') expect(result).toMatchObject({deployment: {
      pageId: 'page-deployment', revision: 4, activeReleaseId: null,
    }});
    expect(document.querySelector('p')?.textContent).toBe('Native');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('applies the selected release with pointer metadata and sends no experiment analytics', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(payload()));
    const onReport = vi.fn();
    const {instance, document} = runtime({fetch, onReport, analyticsConsent: 'granted', credentials: 'include'});
    await expect(instance.start()).resolves.toMatchObject({applied: 1, errors: 0, deployment: {
      pageId: 'page-deployment', revision: 3, activeReleaseId: 'release-deployment',
    }});
    expect(document.querySelector('p')?.textContent).toBe('Published');
    expect(onReport).toHaveBeenCalledOnce();
    await expect(instance.track('purchase')).resolves.toEqual({accepted: false, code: 'NO_ACTIVE_EXPERIMENT'});
    await instance.consent('granted');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({credentials: 'omit', cache: 'no-store'});
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
    instance.destroy();
    expect(document.querySelector('p')?.textContent).toBe('Native');
  });

  it('compensates an earlier successful mutation when a later target is missing', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(payload([
      text('first', 'copy', 'Changed first'), text('second', 'missing', 'Cannot apply'),
    ])));
    const {instance, document} = runtime({fetch});
    await expect(instance.start()).resolves.toMatchObject({mode: 'native', reason: 'DEPLOYMENT_APPLY_FAILED',
      report: {applied: 0, operations: [
        {operationId: 'first', status: 'skipped', code: 'REPLAY_COMPENSATED', compensation: {status: 'restored'}},
        {operationId: 'second', status: 'skipped', code: 'TARGET_NOT_FOUND'},
      ]},
    });
    expect(document.querySelector('p')?.textContent).toBe('Native');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('validates every operation before mutating native DOM for unsafe payloads', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(payload([
      text('first', 'copy', 'Must never appear'),
      {schemaVersion: 1, id: 'unsafe', kind: 'setAttribute', target: {marker: 'copy'},
        name: 'onclick', value: 'alert(1)'},
    ])));
    const {instance, document} = runtime({fetch});
    await expect(instance.start()).resolves.toMatchObject({mode: 'native', reason: 'DEPLOYMENT_APPLY_FAILED'});
    expect(document.querySelector('p')?.textContent).toBe('Native');
    expect(document.querySelector('p')?.hasAttribute('onclick')).toBe(false);
  });

  it('compensates a v1 edit when an initial conditional target has unsafe nested text', async () => {
    const selectedManifest: PublishedManifestV1 = manifest([
      text('first', 'copy', 'Changed first'),
    ]);
    selectedManifest.operations.push({
      schemaVersion: 2, id: 'safe-conditional', kind: 'setText',
      target: {selectors: {css: '#safe-conditional'}},
      condition: {id: 'safe-group', text: 'Safe'}, value: 'Safe overlay',
    }, {
      schemaVersion: 2, id: 'conditional-text', kind: 'setText',
      target: {selectors: {css: '#conditional'}},
      condition: {id: 'conditional-group', text: 'Continue'}, value: 'Published CTA',
    });
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response({
      ...payload(), manifest: selectedManifest,
    }));
    const {instance, document} = runtime({fetch});
    document.body.insertAdjacentHTML('beforeend', '<div id="framework"><button id="safe-conditional">Safe</button><button id="conditional"><span>Continue</span></button></div>');

    const conditionalRoot = document.querySelector('#framework')!;
    const roots = new Map([[conditionalRoot, {root: conditionalRoot, framework: 'react', phase: 'ready', mode: 'csr', generation: 1}]]);
    (document.defaultView as unknown as Record<symbol, unknown>)[Symbol.for('@lykar/framework-roots/v1')] = roots;
    await expect(instance.start()).resolves.toMatchObject({
      mode: 'native', reason: 'DEPLOYMENT_APPLY_FAILED', report: {
        applied: 0, operations: [
          {operationId: 'first', status: 'skipped', code: 'REPLAY_COMPENSATED',
            compensation: {status: 'restored'}},
          {operationId: 'safe-conditional', status: 'skipped', code: 'CONDITIONAL_COMPENSATED'},
          {operationId: 'conditional-text', status: 'error'},
        ],
      },
    });
    expect(document.querySelector('p')?.textContent).toBe('Native');
    expect(document.querySelector('#conditional')?.innerHTML).toBe('<span>Continue</span>');
    expect(document.querySelector('#safe-conditional')?.textContent).toBe('Safe');
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(instance.conditionalState.groups).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('keeps malformed deployment responses native', async () => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response({...payload(), activeReleaseId: 'other'}));
    const {instance, document} = runtime({fetch});
    await expect(instance.start()).resolves.toMatchObject({mode: 'native', reason: 'DEPLOYMENT_UNAVAILABLE'});
    expect(document.querySelector('p')?.textContent).toBe('Native');
  });

  it.each([
    {version: 2}, {variantToken: 'preview-token'}, {experimentToken: 'experiment-token'},
  ])('uses explicit configuration %j instead of deployment', async selection => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(undefined, 204));
    const {instance} = runtime({fetch, ...selection});
    await instance.start();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls.every(([input]) => !path(input).endsWith('/deployment'))).toBe(true);
  });

  it.each([
    {accessToken: 'capability'}, {variantToken: ''}, {experimentToken: ''},
  ])('never enables deployment for explicit empty or capability configuration %j', async selection => {
    const fetch = vi.fn<FetchLike>();
    const {instance} = runtime({fetch, ...selection});
    await expect(instance.start()).resolves.toMatchObject({mode: 'native', reason: 'NO_VARIANT_TOKEN'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    '?version=2', '?version=2&version=2', '?lykar_variant=preview',
    '?lykar_variant=', '?lykar_variant=a&lykar_variant=b',
    '?lykar_experiment=', '#lykar_edit=code', '#lykar_edit=', '#lykar_share=code', '#lykar_share=',
  ])('does not use deployment for explicit URL selector %s', async suffix => {
    const fetch = vi.fn<FetchLike>().mockResolvedValue(response(undefined, 204));
    const {instance} = runtime({fetch}, `https://site.test/page${suffix}`);
    await instance.start();
    expect(fetch.mock.calls.every(([input]) => !path(input).endsWith('/deployment'))).toBe(true);
  });

  it.each(['?version=', '?version=bad', '?version=0'])('rejects invalid version %s before deployment transport', suffix => {
    const fetch = vi.fn<FetchLike>();
    expect(() => runtime({fetch}, `https://site.test/page${suffix}`)).toThrow(/positive integer/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
