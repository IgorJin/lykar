# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deployment-admin.spec.ts >> Owner separately deploys, rolls back and disables; actor/reasons remain readable on mobile and keyboard
- Location: tests/e2e/deployment-admin.spec.ts:84:5

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('region', { name: 'На действующем сайте' }).getByRole('button', { name: 'Включить версию', exact: true })
Expected: focused
Received: inactive
Timeout:  7000ms

Call log:
  - Expect "toBeFocused" getByRole('region', { name: 'На действующем сайте' }).getByRole('button', { name: 'Включить версию', exact: true }) with timeout 7000ms
  - waiting for getByRole('region', { name: 'На действующем сайте' }).getByRole('button', { name: 'Включить версию', exact: true })
    18 × locator resolved to <button type="button" class="primary">Включить версию</button>
       - unexpected value "inactive"

```

```yaml
- button "Включить версию"
```

# Test source

```ts
  3   | import {test, expect, required} from './fixtures.js';
  4   | 
  5   | type Release = {id: string; version: number};
  6   | type State = {revision: number; activeReleaseId: string | null};
  7   | type Activation = {action: string; reason: string; actorUserId: string; releaseId: string | null; revision: number};
  8   | type Command = {releaseId?: string; expectedRevision: number; idempotencyKey: string; reason: string};
  9   | const nativeTitle = 'Простой тариф для первого релиза';
  10  | 
  11  | function apiUrl(path: string) { return `${required('LYKAR_E2E_API_BASE_URL')}${path}`; }
  12  | async function post<T>(owner: BrowserContext, path: string, data: unknown = {}): Promise<T> {
  13  |   const response = await owner.request.post(apiUrl(path), {data});
  14  |   expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  15  |   return response.json();
  16  | }
  17  | async function get<T>(owner: BrowserContext, path: string): Promise<T> {
  18  |   const response = await owner.request.get(apiUrl(path));
  19  |   expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  20  |   return response.json();
  21  | }
  22  | 
  23  | async function prepare(owner: BrowserContext) {
  24  |   const {user} = await post<{user: {id: string; email: string}}>(owner, '/api/auth/dev-login');
  25  |   const {projects} = await get<{projects: Array<{id: string; name: string}>}>(owner, '/api/admin/projects');
  26  |   const project = projects.find(item => item.name === 'Northstar E2E');
  27  |   expect(project).toBeTruthy();
  28  |   // This existing playground alias serves pricing.html with the real SDK. A new Page
  29  |   // prevents inherited operations and preserves the seeded /pricing draft.
  30  |   const pathname = `/__e2e__/s3-pricing-admin-${randomUUID()}`;
  31  |   const {page} = await post<{page: {id: string; name: string}}>(owner,
  32  |     `/api/admin/projects/${project!.id}/pages`, {name: 'Deployment admin pricing', pathname});
  33  |   const endpoint = `/api/admin/pages/${page.id}/deployment`;
  34  |   return {
  35  |     user, page, pathname, endpoint,
  36  |     visitorUrl: `${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}${pathname}?lykar_delivery=deployment`,
  37  |     async state() { return (await get<{deployment: State}>(owner, endpoint)).deployment; },
  38  |     async history() { return (await get<{activations: Activation[]}>(owner, `${endpoint}/activations`)).activations; },
  39  |     async publish(value: string, css = '[data-lykar-id="pricing-title"]'): Promise<Release> {
  40  |       const {draft} = await post<{draft: {id: string; revision: number}}>(owner, `/api/admin/pages/${page.id}/drafts`);
  41  |       const saved = await post<{draft: {revision: number}}>(owner, `/api/admin/drafts/${draft.id}/operations`, {
  42  |         expectedRevision: draft.revision, idempotencyKey: randomUUID(),
  43  |         operations: [{schemaVersion: 1, id: randomUUID(), kind: 'setText', target: {selectors: {css}}, value}],
  44  |       });
  45  |       return (await post<{release: Release}>(owner, `/api/admin/drafts/${draft.id}/publish`,
  46  |         {expectedRevision: saved.draft.revision})).release;
  47  |     },
  48  |     async change(context: BrowserContext, action: 'deploy' | 'disable' | 'rollback', reason: string, releaseId?: string) {
  49  |       const {deployment} = await get<{deployment: State}>(context, endpoint);
  50  |       return post<{deployment: State; replayed: boolean}>(context, `${endpoint}/${action}`, {
  51  |         expectedRevision: deployment.revision, idempotencyKey: randomUUID(), reason, ...(releaseId ? {releaseId} : {}),
  52  |       });
  53  |     },
  54  |     async cleanup() {
  55  |       const {deployment} = await get<{deployment: State}>(owner, endpoint);
  56  |       if (deployment.activeReleaseId) await post(owner, `${endpoint}/disable`, {
  57  |         expectedRevision: deployment.revision, idempotencyKey: randomUUID(), reason: 'E2E cleanup',
  58  |       });
  59  |     },
  60  |   };
  61  | }
  62  | 
  63  | async function openPanel(owner: BrowserContext, fixture: Awaited<ReturnType<typeof prepare>>) {
  64  |   const admin = await owner.newPage();
  65  |   await admin.goto(apiUrl('/admin/'));
  66  |   await admin.locator('.list-item').filter({hasText: 'Northstar E2E'}).click();
  67  |   await admin.getByRole('button', {name: `${fixture.page.name} ${fixture.pathname}`, exact: true}).click();
  68  |   const panel = admin.getByRole('region', {name: 'На действующем сайте'});
  69  |   await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toBeEnabled();
  70  |   return {admin, panel};
  71  | }
  72  | async function choose(panel: Locator, release: Release, reason: string) {
  73  |   await panel.getByRole('combobox', {name: 'Версия для публикации'}).selectOption(release.id);
  74  |   await panel.getByRole('textbox', {name: 'Причина публикации'}).fill(reason);
  75  | }
  76  | async function active(panel: Locator, release: Release) {
  77  |   await expect(panel.locator('.deployment-current strong')).toHaveText(`Версия ${release.version} включена`);
  78  |   await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toBeEnabled();
  79  | }
  80  | async function title(page: Page, value: string) {
  81  |   await expect(page.locator('[data-lykar-id="pricing-title"]')).toHaveText(value);
  82  | }
  83  | 
  84  | test('Owner separately deploys, rolls back and disables; actor/reasons remain readable on mobile and keyboard', async ({newContext}, testInfo) => {
  85  |   test.setTimeout(60_000);
  86  |   const owner = await newContext();
  87  |   const fixture = await prepare(owner);
  88  |   try {
  89  |     const first = await fixture.publish('Admin first pricing');
  90  |     const second = await fixture.publish('Admin second pricing');
  91  |     expect((await fixture.state()).activeReleaseId).toBeNull();
  92  |     const visitor = await (await newContext()).newPage();
  93  |     await visitor.goto(fixture.visitorUrl);
  94  |     await title(visitor, nativeTitle);
  95  |     const {admin, panel} = await openPanel(owner, fixture);
  96  |     await admin.setViewportSize({width: 390, height: 844});
  97  |     await expect(panel.getByText('Не проверено.', {exact: true})).toBeVisible();
  98  |     await choose(panel, first, 'Первое включение с клавиатуры');
  99  |     const enable = panel.getByRole('button', {name: 'Включить версию', exact: true});
  100 |     const reason = panel.getByRole('textbox', {name: 'Причина публикации'});
  101 |     await reason.focus();
  102 |     await admin.keyboard.press('Tab');
> 103 |     await expect(enable).toBeFocused();
      |                          ^ Error: expect(locator).toBeFocused() failed
  104 |     await admin.keyboard.press('Enter');
  105 |     await active(panel, first);
  106 |     await visitor.reload();
  107 |     await title(visitor, 'Admin first pricing');
  108 | 
  109 |     await choose(panel, second, 'Второе включение');
  110 |     await enable.click();
  111 |     await active(panel, second);
  112 |     await visitor.reload();
  113 |     await title(visitor, 'Admin second pricing');
  114 |     await choose(panel, first, 'Возвращаем прежний тариф');
  115 |     await panel.getByRole('button', {name: 'Откатить на выбранную версию'}).click();
  116 |     await active(panel, first);
  117 |     await visitor.reload();
  118 |     await title(visitor, 'Admin first pricing');
  119 |     await reason.fill('Отключаем изменения');
  120 |     await panel.getByRole('button', {name: 'Отключить правки'}).click();
  121 |     await expect(panel.locator('.deployment-current strong')).toHaveText('Правки отключены: исходная страница');
  122 |     await visitor.reload();
  123 |     await title(visitor, nativeTitle);
  124 | 
  125 |     const summary = panel.locator('.deployment-history summary');
  126 |     await summary.focus();
  127 |     await admin.keyboard.press('Enter');
  128 |     const rows = panel.locator('.deployment-history li');
  129 |     await expect(rows).toHaveCount(4);
  130 |     for (const text of ['Первое включение с клавиатуры', 'Второе включение', 'Возвращаем прежний тариф', 'Отключаем изменения']) {
  131 |       const row = rows.filter({hasText: text});
  132 |       await expect(row).toContainText(fixture.user.email);
  133 |     }
  134 |     expect((await fixture.history()).map(item => ({action: item.action, reason: item.reason, actor: item.actorUserId}))).toEqual([
  135 |       {action: 'disable', reason: 'Отключаем изменения', actor: fixture.user.id},
  136 |       {action: 'rollback', reason: 'Возвращаем прежний тариф', actor: fixture.user.id},
  137 |       {action: 'deploy', reason: 'Второе включение', actor: fixture.user.id},
  138 |       {action: 'deploy', reason: 'Первое включение с клавиатуры', actor: fixture.user.id},
  139 |     ]);
  140 |     await expect.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  141 |     const screenshot = testInfo.outputPath('deployment-admin-mobile-390.png');
  142 |     await panel.screenshot({path: screenshot});
  143 |     await testInfo.attach('deployment-admin-mobile-390', {path: screenshot, contentType: 'image/png'});
  144 |   } finally { await fixture.cleanup(); }
  145 | });
  146 | 
  147 | test('real preview popup reports applicability; no report stays unchecked and missing target blocks deployment', async ({newContext}) => {
  148 |   test.setTimeout(60_000);
  149 |   const owner = await newContext();
  150 |   const fixture = await prepare(owner);
  151 |   try {
  152 |     const release = await fixture.publish('Preview checked pricing');
  153 |     const broken = await fixture.publish('Missing target', '#deployment-admin-target-does-not-exist');
  154 |     const {panel} = await openPanel(owner, fixture);
  155 |     await choose(panel, release, 'После проверки');
  156 |     // Load the genuine host HTML without booting SDK for one popup. Closing it
  157 |     // exercises the missing-report path without a synthetic postMessage report.
  158 |     await owner.route('**/playground.js', route => route.fulfill({status: 200, contentType: 'application/javascript', body: ''}), {times: 1});
  159 |     const uncheckedPopup = owner.waitForEvent('page');
  160 |     await panel.getByRole('button', {name: 'Проверить на сайте'}).click();
  161 |     const unchecked = await uncheckedPopup;
  162 |     await title(unchecked, nativeTitle);
  163 |     await unchecked.close();
  164 |     await expect(panel.getByRole('alert')).toContainText('Версия не проверена');
  165 |     await expect(panel.getByText('Не проверено.', {exact: true})).toBeVisible();
  166 | 
  167 |     const checkedPopup = owner.waitForEvent('page');
  168 |     await panel.getByRole('button', {name: 'Проверить на сайте'}).click();
  169 |     const checked = await checkedPopup;
  170 |     await title(checked, 'Preview checked pricing');
  171 |     await expect(panel.getByText('Проверено в предпросмотре', {exact: true})).toBeVisible();
  172 |     await expect(panel.locator('.deployment-operations')).toContainText('Применено');
  173 |     await expect(panel.getByRole('button', {name: 'Включить версию', exact: true})).toBeEnabled();
  174 |     expect((await fixture.state()).activeReleaseId).toBeNull();
  175 |     await checked.close();
  176 | 
  177 |     await choose(panel, broken, 'Не включать отсутствующий элемент');
  178 |     const brokenPopup = owner.waitForEvent('page');
  179 |     await panel.getByRole('button', {name: 'Проверить на сайте'}).click();
  180 |     const preview = await brokenPopup;
  181 |     await expect(panel.getByText('Есть неприменимые правки', {exact: true})).toBeVisible({timeout: 20_000});
  182 |     await expect(panel.locator('.deployment-operations')).toContainText(/Пропущено|Ошибка/);
  183 |     await expect(panel.getByRole('button', {name: 'Включить версию', exact: true})).toBeDisabled();
  184 |     await expect(panel.getByRole('button', {name: 'Откатить на выбранную версию'})).toBeDisabled();
  185 |     await expect(panel.getByRole('button', {name: 'Исправить в новом черновике'})).toBeEnabled();
  186 |     expect((await fixture.history())).toHaveLength(0);
  187 |     await preview.close();
  188 |   } finally { await fixture.cleanup(); }
  189 | });
  190 | 
  191 | test('a real second Owner revision conflict refreshes state and preserves the chosen release and reason', async ({newContext}) => {
  192 |   const owner = await newContext();
  193 |   const secondOwner = await newContext();
  194 |   await post(secondOwner, '/api/auth/dev-login');
  195 |   const fixture = await prepare(owner);
  196 |   try {
  197 |     const chosen = await fixture.publish('Chosen pricing');
  198 |     const concurrent = await fixture.publish('Concurrent pricing');
  199 |     const {admin, panel} = await openPanel(owner, fixture);
  200 |     const reason = 'Мой выбор после другого окна';
  201 |     await choose(panel, chosen, reason);
  202 |     await fixture.change(secondOwner, 'deploy', 'Включено другим окном', concurrent.id);
  203 |     const commands: Command[] = [];
```