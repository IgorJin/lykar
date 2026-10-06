import {randomUUID} from 'node:crypto';
import type {BrowserContext, Page} from '@playwright/test';
import {test, expect, required} from './fixtures.js';

async function post(owner: BrowserContext, path: string, data: unknown = {}) {
  const response = await owner.request.post(`${required('LYKAR_E2E_API_BASE_URL')}${path}`, {data});
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return response.json();
}
async function setup(owner: BrowserContext, pathname: string) {
  await post(owner, '/api/auth/dev-login');
  const projects = await (await owner.request.get(`${required('LYKAR_E2E_API_BASE_URL')}/api/admin/projects`)).json();
  const project = projects.projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  const pages = await (await owner.request.get(`${required('LYKAR_E2E_API_BASE_URL')}/api/admin/projects/${project.id}/pages`)).json();
  let record = pages.pages.find((item: {pathname: string}) => item.pathname === pathname);
  if (!record) record = (await post(owner, `/api/admin/projects/${project.id}/pages`, {name: 'Deployment browser', pathname})).page;
  let revision = (await (await owner.request.get(`${required('LYKAR_E2E_API_BASE_URL')}/api/admin/pages/${record.id}/deployment`)).json()).deployment.revision;
  return {
    pageId: record.id,
    async publish(value: string, css: string, conditional = false) {
      const {draft} = await post(owner, `/api/admin/pages/${record.id}/drafts`);
      await post(owner, `/api/admin/drafts/${draft.id}/operations`, {
        expectedRevision: 0, idempotencyKey: randomUUID(),
        sourceSnapshot: {algorithm: 'lykar-dom-v1', pageHash: 'c'.repeat(64), capturedAt: '2026-10-04T00:00:00.000Z'},
        operations: [{schemaVersion: conditional ? 2 : 1, id: randomUUID(), kind: 'setText', target: {selectors: {css}}, value,
          ...(conditional ? {condition: {id: 'alpha', text: 'Alpha native copy'}} : {})}],
      });
      return (await post(owner, `/api/admin/drafts/${draft.id}/publish`, {expectedRevision: 1})).release;
    },
    async change(action: string, releaseId?: string) {
      const result = await post(owner, `/api/admin/pages/${record.id}/deployment/${action}`, {
        expectedRevision: revision, idempotencyKey: randomUUID(), reason: `Browser ${action}`, ...(releaseId ? {releaseId} : {}),
      });
      revision = result.deployment.revision;
      return revision;
    },
  };
}
async function refresh(page: Page) {
  return page.evaluate(async () => {
    const state = window as unknown as {__LYKAR_SDK__: {refresh(): Promise<unknown>}; __LYKAR_SDK_RESULT__: unknown};
    return state.__LYKAR_SDK_RESULT__ = await state.__LYKAR_SDK__.refresh();
  });
}
async function ready(page: Page, mode: string) {
  await expect.poll(() => page.evaluate(() => (window as unknown as {__LYKAR_SDK_RESULT__?: {mode: string}}).__LYKAR_SDK_RESULT__?.mode)).toBe(mode);
}
function url(path: string) { return `${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}${path}`; }

for (const loader of ['script', 'module']) {
  test(`${loader}: Publish → Deploy → refresh → Disable → Rollback; preview and native A isolation`, async ({newContext}) => {
    test.setTimeout(60_000);
    const owner = await newContext();
    const visitor = await newContext();
    const api = await setup(owner, '/pricing');
    await api.change('disable');
    const release = await api.publish(`Published ${loader}`, '[data-lykar-id="pricing-title"]');
    const second = await api.publish(`Second ${loader}`, '[data-lykar-id="pricing-title"]');
    const target = url(`/pricing?lykar_delivery=deployment&lykar_sdk=${loader}`);
    const page = await visitor.newPage();
    const requests: string[] = [];
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    await page.goto(target);
    await ready(page, 'native');
    const title = page.locator('[data-lykar-id="pricing-title"]');
    await expect(title).toHaveText('Простой тариф для первого релиза');
    await api.change('deploy', release.id);
    // Existing tabs retain the resolved generation until refresh/navigation/reload.
    await expect(title).toHaveText('Простой тариф для первого релиза');
    expect(await refresh(page)).toMatchObject({mode: 'visitor', runtime: {deployment: {activeReleaseId: release.id}}});
    await expect(title).toHaveText(`Published ${loader}`);
    await api.change('deploy', second.id);
    await expect(title).toHaveText(`Published ${loader}`);
    await page.reload();
    await ready(page, 'visitor');
    await expect(title).toHaveText(`Second ${loader}`);

    const {url: shareUrl} = await post(owner, `/api/admin/pages/${api.pageId}/shares`, {releaseId: release.id});
    const preview = await visitor.newPage();
    await preview.addInitScript(() => {
      if (location.pathname !== '/pricing') return;
      const target = new URL(location.href);
      target.searchParams.set('lykar_delivery', 'deployment');
      history.replaceState(history.state, '', target);
    });
    await preview.goto(shareUrl);
    await ready(preview, 'share');
    await expect(preview.locator('[data-lykar-id="pricing-title"]')).toHaveText(`Published ${loader}`);
    const {experiment} = await post(owner, `/api/admin/pages/${api.pageId}/experiments`, {
      name: 'Deployment native A', variants: [{key: 'A', releaseId: null}, {key: 'B', releaseId: release.id}],
    });
    await post(owner, `/api/admin/experiments/${experiment.id}/activate`);
    const link = await post(owner, `/api/admin/experiments/${experiment.id}/variants/A/links`);
    const nativeUrl = new URL(link.url);
    nativeUrl.searchParams.set('lykar_delivery', 'deployment');
    nativeUrl.searchParams.set('lykar_sdk', loader);
    const control = await visitor.newPage();
    await control.goto(nativeUrl.toString());
    await ready(control, 'variant');
    await expect(control.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
    await expect(control.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
    await post(owner, `/api/admin/experiments/${experiment.id}/complete`, {winnerVariantKey: 'A'});
    for (const selector of ['version=bad', 'lykar_variant=', 'version=1&lykar_variant=x']) {
      await control.goto(`${target}&${selector}`);
      await ready(control, 'error');
      await expect(control.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
    }
    await api.change('disable');
    expect(await refresh(page)).toMatchObject({mode: 'native', reason: 'NO_ACTIVE_DEPLOYMENT'});
    await expect(title).toHaveText('Простой тариф для первого релиза');
    await api.change('rollback', release.id);
    await refresh(page);
    await expect(title).toHaveText(`Published ${loader}`);
    expect(requests.some(path => /analytics|editor|experiment/.test(path))).toBe(false);
    await api.change('disable');
  });
}

for (const framework of ['react', 'vue']) for (const rendering of ['csr', 'ssr']) {
  test(`${framework} ${rendering}: deployment respects host hydration, route transitions, remount and disable`, async ({newContext}, testInfo) => {
    const owner = await newContext();
    const pathname = `/__e2e__/s4-${framework}-${rendering}-a-deployment-${testInfo.project.name}-${Date.now()}`;
    const api = await setup(owner, pathname);
    const release = await api.publish('Deployed Alpha', '#editable-copy', true);
    await api.change('deploy', release.id);
    const page = await (await newContext()).newPage();
    const errors: string[] = [];
    page.on('console', message => {if (message.type() === 'error' || /hydration|mismatch/i.test(message.text())) errors.push(message.text());});
    await page.goto(url(`${pathname}?lykar_delivery=deployment`));
    await ready(page, 'visitor');
    await expect(page.locator('#editable-copy')).toHaveText('Deployed Alpha');
    await page.locator('#nested-action').click();
    await expect(page.locator('#nested-count')).toHaveText('1');
    await page.locator('#remount-root').click();
    await expect(page.locator('#editable-copy')).toHaveText('Deployed Alpha');
    await page.locator('#go-b').click();
    await expect(page.locator('#editable-copy')).toHaveText('Beta native copy');
    await page.locator('#back').click();
    await expect(page.locator('#editable-copy')).toHaveText('Deployed Alpha');
    await api.change('disable');
    expect(await refresh(page)).toMatchObject({mode: 'native', reason: 'NO_ACTIVE_DEPLOYMENT'});
    await expect(page.locator('#editable-copy')).toHaveText('Alpha native copy');
    await page.locator('#nested-action').click();
    await expect(page.locator('#nested-count')).toHaveText('1');
    expect(errors).toEqual([]);
  });
}

test('invalid deployment and unavailable runtime asset leave the original page visible', async ({newContext}) => {
  const page = await (await newContext()).newPage();
  await page.route('**/api/runtime/projects/*/deployment?*', route => route.fulfill({json: {manifest: 'corrupt'}}));
  await page.goto(url('/pricing?lykar_delivery=deployment'));
  await ready(page, 'native');
  await expect(page.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
  await expect(page.locator('body')).toBeVisible();
  await page.route('**/asset-manifest.json', route => route.fulfill({json: {invalid: true}}));
  await page.reload();
  await ready(page, 'native');
  await expect.poll(() => page.evaluate(() => (window as unknown as {__LYKAR_SDK_RESULT__: {reason: string}}).__LYKAR_SDK_RESULT__.reason)).toBe('RUNTIME_ASSET_UNAVAILABLE');
  await expect(page.locator('[data-lykar-id="pricing-title"]')).toBeVisible();
});


test('browser deadlines and retired requests leave the host available', async ({newContext}) => {
  const page = await (await newContext()).newPage();
  await page.goto(url('/pricing?lykar_delivery=deployment'));
  await ready(page, 'native');
  const result = await page.evaluate(async () => {
    type Result = {mode: string; reason?: string};
    type Sdk = {options: {fetch: typeof fetch; networkTimeoutMs: number}; refresh(): Promise<Result>;
      navigate(options: {pathname: string; root: Element}): Promise<Result>};
    const sdk = (window as unknown as {__LYKAR_SDK__: Sdk}).__LYKAR_SDK__;
    sdk.options.networkTimeoutMs = 20;
    const results = [];
    for (const transport of [
      () => Promise.reject(new TypeError('Simulated network loss')),
      () => Promise.resolve(new Response(null, {status: 503})),
      () => new Promise<Response>(() => {}),
      () => Promise.resolve(new Response(new ReadableStream({start() {}}))),
    ]) {
      sdk.options.fetch = transport;
      results.push(await sdk.refresh());
    }
    const rootA = document.createElement('div'); rootA.innerHTML = '<p data-lykar-id="late-copy">A native</p>';
    const rootB = document.createElement('div'); rootB.innerHTML = '<p data-lykar-id="late-copy">B native</p>';
    document.body.append(rootA, rootB);
    const payload = (pathname: string, value: string) => new Response(JSON.stringify({
      pageId: `page-${pathname}`, revision: 1, activeReleaseId: `release-${pathname}`,
      manifest: {schemaVersion: 1, projectId: 'late-project', pageId: `page-${pathname}`, pathname,
        releaseId: `release-${pathname}`, version: 1, manifestHash: 'a'.repeat(64), createdAt: '2026-10-04T00:00:00.000Z',
        operations: [{schemaVersion: 1, id: 'late-copy', kind: 'setText', target: {marker: 'late-copy'}, value}]},
    }));
    let requested!: () => void;
    const waiting = new Promise<void>(resolve => {requested = resolve;});
    let resolveLate!: (response: Response) => void;
    sdk.options.networkTimeoutMs = 5000;
    sdk.options.fetch = input => new URL(String(input)).searchParams.get('pathname') === '/late-a'
      ? new Promise(resolve => {resolveLate = resolve; requested();})
      : Promise.resolve(payload('/late-b', 'B deployed'));
    const old = sdk.navigate({pathname: '/late-a', root: rootA});
    await waiting;
    const current = await sdk.navigate({pathname: '/late-b', root: rootB});
    const retired = await old;
    resolveLate(payload('/late-a', 'A stale'));
    await new Promise(resolve => setTimeout(resolve, 30));
    return {results, current, retired, textA: rootA.textContent, textB: rootB.textContent};
  });
  expect(result.results).toHaveLength(4);
  for (const entry of result.results) expect(entry).toMatchObject({mode: 'native', reason: 'DEPLOYMENT_UNAVAILABLE'});
  expect(result.current).toMatchObject({mode: 'visitor'});
  expect(result.retired).toMatchObject({mode: 'native', reason: 'PAGE_SESSION_STALE'});
  expect(result.textA).toBe('A native');
  expect(result.textB).toBe('B deployed');
  await expect(page.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
  await expect(page.locator('body')).toBeVisible();
});
