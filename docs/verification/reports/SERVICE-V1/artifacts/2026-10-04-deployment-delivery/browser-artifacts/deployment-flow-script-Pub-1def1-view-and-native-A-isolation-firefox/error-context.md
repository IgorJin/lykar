# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deployment-flow.spec.ts >> script: Publish → Deploy → refresh → Disable → Rollback; preview and native A isolation
- Location: tests/e2e/deployment-flow.spec.ts:51:7

# Error details

```
Error: /api/admin/experiments/cdad9907-c272-4324-8fc4-66b8947ecc1f/activate: {"error":{"code":"CONFLICT","message":"Another experiment is already active on this page"}}

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - banner [ref=f1e2]:
    - link "Northstar" [ref=f1e3] [cursor=pointer]:
      - /url: /
    - navigation "Основная навигация" [ref=f1e4]:
      - link "Главная" [ref=f1e5] [cursor=pointer]:
        - /url: /
      - link "Тарифы" [ref=f1e6] [cursor=pointer]:
        - /url: /pricing
    - link "Выбрать тариф" [ref=f1e7] [cursor=pointer]:
      - /url: "#plans"
  - main [ref=f1e8]:
    - generic [ref=f1e9]:
      - generic [ref=f1e10]: Отдельная страница · /pricing
      - heading "Second script" [level=1] [ref=f1e11]
      - paragraph [ref=f1e12]: Эта страница имеет независимые backend draft, releases и прямые version-ссылки.
    - generic [ref=f1e13]:
      - article [ref=f1e14]:
        - heading "Starter" [level=2] [ref=f1e15]
        - generic [ref=f1e16]: €0
        - paragraph [ref=f1e17]: Локальные эксперименты и один проект.
        - button "Начать" [ref=f1e18] [cursor=pointer]
      - article [ref=f1e19]:
        - generic [ref=f1e20]: Популярный
        - heading "Pro" [level=2] [ref=f1e21]
        - generic [ref=f1e22]: €29
        - paragraph [ref=f1e23]: Версии, публикация и share previews.
        - button "Выбрать Pro" [ref=f1e24] [cursor=pointer]
      - article [ref=f1e25]:
        - heading "Team" [level=2] [ref=f1e26]
        - generic [ref=f1e27]: Позже
        - paragraph [ref=f1e28]: Совместная работа появится после первого MVP.
        - button "Недоступно" [disabled] [ref=f1e29] [cursor=pointer]
  - contentinfo [ref=f1e30]: Northstar pricing · independent page fixture
  - complementary [ref=f1e31]:
    - strong [ref=f1e32]: Lykar E2E status
    - generic [ref=f1e33]:
      - text: Editor capability отсутствует. Войдите в админку, выберите нужную страницу и нажмите «Открыть редактор».
      - link "Открыть админку" [ref=f1e34] [cursor=pointer]:
        - /url: http://127.0.0.1:54334/admin/
        - text: http://127.0.0.1:54334/admin/
    - button "Перезапустить редактор" [ref=f1e35] [cursor=pointer]
```

# Test source

```ts
  1   | import {randomUUID} from 'node:crypto';
  2   | import type {BrowserContext, Page} from '@playwright/test';
  3   | import {test, expect, required} from './fixtures.js';
  4   | 
  5   | async function post(owner: BrowserContext, path: string, data: unknown = {}) {
  6   |   const response = await owner.request.post(`${required('LYKAR_E2E_API_BASE_URL')}${path}`, {data});
> 7   |   expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
      |                                                              ^ Error: /api/admin/experiments/cdad9907-c272-4324-8fc4-66b8947ecc1f/activate: {"error":{"code":"CONFLICT","message":"Another experiment is already active on this page"}}
  8   |   return response.json();
  9   | }
  10  | async function setup(owner: BrowserContext, pathname: string) {
  11  |   await post(owner, '/api/auth/dev-login');
  12  |   const projects = await (await owner.request.get(`${required('LYKAR_E2E_API_BASE_URL')}/api/admin/projects`)).json();
  13  |   const project = projects.projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  14  |   const pages = await (await owner.request.get(`${required('LYKAR_E2E_API_BASE_URL')}/api/admin/projects/${project.id}/pages`)).json();
  15  |   let record = pages.pages.find((item: {pathname: string}) => item.pathname === pathname);
  16  |   if (!record) record = (await post(owner, `/api/admin/projects/${project.id}/pages`, {name: 'Deployment browser', pathname})).page;
  17  |   let revision = (await (await owner.request.get(`${required('LYKAR_E2E_API_BASE_URL')}/api/admin/pages/${record.id}/deployment`)).json()).deployment.revision;
  18  |   return {
  19  |     pageId: record.id,
  20  |     async publish(value: string, css: string, conditional = false) {
  21  |       const {draft} = await post(owner, `/api/admin/pages/${record.id}/drafts`);
  22  |       await post(owner, `/api/admin/drafts/${draft.id}/operations`, {
  23  |         expectedRevision: 0, idempotencyKey: randomUUID(),
  24  |         sourceSnapshot: {algorithm: 'lykar-dom-v1', pageHash: 'c'.repeat(64), capturedAt: '2026-10-04T00:00:00.000Z'},
  25  |         operations: [{schemaVersion: conditional ? 2 : 1, id: randomUUID(), kind: 'setText', target: {selectors: {css}}, value,
  26  |           ...(conditional ? {condition: {id: 'alpha', text: 'Alpha native copy'}} : {})}],
  27  |       });
  28  |       return (await post(owner, `/api/admin/drafts/${draft.id}/publish`, {expectedRevision: 1})).release;
  29  |     },
  30  |     async change(action: string, releaseId?: string) {
  31  |       const result = await post(owner, `/api/admin/pages/${record.id}/deployment/${action}`, {
  32  |         expectedRevision: revision, idempotencyKey: randomUUID(), reason: `Browser ${action}`, ...(releaseId ? {releaseId} : {}),
  33  |       });
  34  |       revision = result.deployment.revision;
  35  |       return revision;
  36  |     },
  37  |   };
  38  | }
  39  | async function refresh(page: Page) {
  40  |   return page.evaluate(async () => {
  41  |     const state = window as unknown as {__LYKAR_SDK__: {refresh(): Promise<unknown>}; __LYKAR_SDK_RESULT__: unknown};
  42  |     return state.__LYKAR_SDK_RESULT__ = await state.__LYKAR_SDK__.refresh();
  43  |   });
  44  | }
  45  | async function ready(page: Page, mode: string) {
  46  |   await expect.poll(() => page.evaluate(() => (window as unknown as {__LYKAR_SDK_RESULT__?: {mode: string}}).__LYKAR_SDK_RESULT__?.mode)).toBe(mode);
  47  | }
  48  | function url(path: string) { return `${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}${path}`; }
  49  | 
  50  | for (const loader of ['script', 'module']) {
  51  |   test(`${loader}: Publish → Deploy → refresh → Disable → Rollback; preview and native A isolation`, async ({newContext}) => {
  52  |     test.setTimeout(60_000);
  53  |     const owner = await newContext();
  54  |     const visitor = await newContext();
  55  |     const api = await setup(owner, '/pricing');
  56  |     await api.change('disable');
  57  |     const release = await api.publish(`Published ${loader}`, '[data-lykar-id="pricing-title"]');
  58  |     const second = await api.publish(`Second ${loader}`, '[data-lykar-id="pricing-title"]');
  59  |     const target = url(`/pricing?lykar_delivery=deployment&lykar_sdk=${loader}`);
  60  |     const page = await visitor.newPage();
  61  |     const requests: string[] = [];
  62  |     page.on('request', request => requests.push(new URL(request.url()).pathname));
  63  |     await page.goto(target);
  64  |     await ready(page, 'native');
  65  |     const title = page.locator('[data-lykar-id="pricing-title"]');
  66  |     await expect(title).toHaveText('Простой тариф для первого релиза');
  67  |     await api.change('deploy', release.id);
  68  |     // Existing tabs retain the resolved generation until refresh/navigation/reload.
  69  |     await expect(title).toHaveText('Простой тариф для первого релиза');
  70  |     expect(await refresh(page)).toMatchObject({mode: 'visitor', runtime: {deployment: {activeReleaseId: release.id}}});
  71  |     await expect(title).toHaveText(`Published ${loader}`);
  72  |     await api.change('deploy', second.id);
  73  |     await expect(title).toHaveText(`Published ${loader}`);
  74  |     await page.reload();
  75  |     await ready(page, 'visitor');
  76  |     await expect(title).toHaveText(`Second ${loader}`);
  77  | 
  78  |     const {url: shareUrl} = await post(owner, `/api/admin/pages/${api.pageId}/shares`, {releaseId: release.id});
  79  |     const preview = await visitor.newPage();
  80  |     await preview.addInitScript(() => {
  81  |       if (location.pathname !== '/pricing') return;
  82  |       const target = new URL(location.href);
  83  |       target.searchParams.set('lykar_delivery', 'deployment');
  84  |       history.replaceState(history.state, '', target);
  85  |     });
  86  |     await preview.goto(shareUrl);
  87  |     await ready(preview, 'share');
  88  |     await expect(preview.locator('[data-lykar-id="pricing-title"]')).toHaveText(`Published ${loader}`);
  89  |     const {experiment} = await post(owner, `/api/admin/pages/${api.pageId}/experiments`, {
  90  |       name: 'Deployment native A', variants: [{key: 'A', releaseId: null}, {key: 'B', releaseId: release.id}],
  91  |     });
  92  |     await post(owner, `/api/admin/experiments/${experiment.id}/activate`);
  93  |     const link = await post(owner, `/api/admin/experiments/${experiment.id}/variants/A/links`);
  94  |     const nativeUrl = new URL(link.url);
  95  |     nativeUrl.searchParams.set('lykar_delivery', 'deployment');
  96  |     nativeUrl.searchParams.set('lykar_sdk', loader);
  97  |     const control = await visitor.newPage();
  98  |     await control.goto(nativeUrl.toString());
  99  |     await ready(control, 'variant');
  100 |     await expect(control.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
  101 |     await expect(control.locator('[data-lykar-editor-root]')).toHaveCount(0);
  102 |     await post(owner, `/api/admin/experiments/${experiment.id}/complete`, {winnerVariantKey: 'A'});
  103 |     for (const selector of ['version=bad', 'lykar_variant=', 'version=1&lykar_variant=x']) {
  104 |       await control.goto(`${target}&${selector}`);
  105 |       await ready(control, 'error');
  106 |       await expect(control.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
  107 |     }
```