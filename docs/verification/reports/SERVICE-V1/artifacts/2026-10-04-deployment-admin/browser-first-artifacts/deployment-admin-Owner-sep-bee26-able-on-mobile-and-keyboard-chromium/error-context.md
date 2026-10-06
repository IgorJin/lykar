# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deployment-admin.spec.ts >> Owner separately deploys, rolls back and disables; actor/reasons remain readable on mobile and keyboard
- Location: tests/e2e/deployment-admin.spec.ts:84:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 7000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [active] [ref=f4e1]:
  - banner [ref=f4e2]:
    - link "Northstar" [ref=f4e3] [cursor=pointer]:
      - /url: /
    - navigation "Основная навигация" [ref=f4e4]:
      - link "Главная" [ref=f4e5] [cursor=pointer]:
        - /url: /
      - link "Тарифы" [ref=f4e6] [cursor=pointer]:
        - /url: /pricing
    - link "Выбрать тариф" [ref=f4e7] [cursor=pointer]:
      - /url: "#plans"
  - main [ref=f4e8]:
    - generic [ref=f4e9]:
      - generic [ref=f4e10]: Отдельная страница · /pricing
      - heading "Простой тариф для первого релиза" [level=1] [ref=f4e11]
      - paragraph [ref=f4e12]: Эта страница имеет независимые backend draft, releases и прямые version-ссылки.
    - generic [ref=f4e13]:
      - article [ref=f4e14]:
        - heading "Starter" [level=2] [ref=f4e15]
        - generic [ref=f4e16]: €0
        - paragraph [ref=f4e17]: Локальные эксперименты и один проект.
        - button "Начать" [ref=f4e18] [cursor=pointer]
      - article [ref=f4e19]:
        - generic [ref=f4e20]: Популярный
        - heading "Pro" [level=2] [ref=f4e21]
        - generic [ref=f4e22]: €29
        - paragraph [ref=f4e23]: Версии, публикация и share previews.
        - button "Выбрать Pro" [ref=f4e24] [cursor=pointer]
      - article [ref=f4e25]:
        - heading "Team" [level=2] [ref=f4e26]
        - generic [ref=f4e27]: Позже
        - paragraph [ref=f4e28]: Совместная работа появится после первого MVP.
        - button "Недоступно" [disabled] [ref=f4e29] [cursor=pointer]
  - contentinfo [ref=f4e30]: Northstar pricing · independent page fixture
  - complementary [ref=f4e31]:
    - strong [ref=f4e32]: Lykar E2E status
    - generic [ref=f4e33]:
      - text: Editor capability отсутствует. Войдите в админку, выберите нужную страницу и нажмите «Открыть редактор».
      - link "Открыть админку" [ref=f4e34] [cursor=pointer]:
        - /url: http://127.0.0.1:62009/admin/
        - text: http://127.0.0.1:62009/admin/
    - button "Перезапустить редактор" [ref=f4e35] [cursor=pointer]
```

# Test source

```ts
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
  103 |     await expect(enable).toBeFocused();
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
> 140 |     await expect.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      |                                                                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
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
  204 |     admin.on('request', request => {
  205 |       if (request.method() === 'POST' && request.url() === apiUrl(`${fixture.endpoint}/deploy`)) commands.push(request.postDataJSON() as Command);
  206 |     });
  207 |     const conflict = admin.waitForResponse(response => response.url() === apiUrl(`${fixture.endpoint}/deploy`) && response.status() === 409);
  208 |     await panel.getByRole('button', {name: 'Включить версию', exact: true}).click();
  209 |     await conflict;
  210 |     await expect(panel.getByRole('alert')).toContainText('Выбор версии и причина сохранены');
  211 |     await active(panel, concurrent);
  212 |     await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toHaveValue(chosen.id);
  213 |     await expect(panel.getByRole('textbox', {name: 'Причина публикации'})).toHaveValue(reason);
  214 |     expect((await fixture.history())).toHaveLength(1);
  215 |     await panel.getByRole('button', {name: 'Включить версию', exact: true}).click();
  216 |     await active(panel, chosen);
  217 |     expect(commands).toHaveLength(2);
  218 |     expect(commands.map(command => command.expectedRevision)).toEqual([0, 1]);
  219 |     expect(commands[0].idempotencyKey).not.toBe(commands[1].idempotencyKey);
  220 |     expect((await fixture.history()).map(item => item.reason)).toEqual([reason, 'Включено другим окном']);
  221 |   } finally { await fixture.cleanup(); }
  222 | });
  223 | 
  224 | test('a committed command with lost response retries the identical key and adds one history entry', async ({newContext}) => {
  225 |   const owner = await newContext();
  226 |   const fixture = await prepare(owner);
  227 |   try {
  228 |     const release = await fixture.publish('Idempotent pricing');
  229 |     const {admin, panel} = await openPanel(owner, fixture);
  230 |     const reason = 'Не дублировать после потери ответа';
  231 |     await choose(panel, release, reason);
  232 |     const endpoint = apiUrl(`${fixture.endpoint}/deploy`);
  233 |     const commands: Command[] = [];
  234 |     admin.on('request', request => {
  235 |       if (request.method() === 'POST' && request.url() === endpoint) commands.push(request.postDataJSON() as Command);
  236 |     });
  237 |     await admin.route(endpoint, async route => {
  238 |       const committed = await route.fetch();
  239 |       expect(committed.ok(), await committed.text()).toBe(true);
  240 |       expect((await committed.json()).replayed).toBe(false);
```