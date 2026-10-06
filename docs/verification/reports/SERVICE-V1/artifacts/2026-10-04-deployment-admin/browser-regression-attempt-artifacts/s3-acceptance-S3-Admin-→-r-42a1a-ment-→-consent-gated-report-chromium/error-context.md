# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: s3-acceptance.spec.ts >> S3 Admin → release/share → sticky experiment → consent-gated report
- Location: tests/e2e/s3-acceptance.spec.ts:11:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('revision 0')
Expected: visible
Timeout: 7000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('revision 0') with timeout 7000ms
  - waiting for getByText('revision 0')

```

```yaml
- main:
  - heading "Lykar" [level=1]
  - text: localhost owner@lykar.local
  - button "Выйти"
  - complementary:
    - heading "Новый сайт" [level=2]
    - textbox "Название"
    - textbox "http://localhost:4173"
    - button "Создать"
    - heading "Сайты" [level=2]
    - button "Northstar E2E http://127.0.0.1:53531"
  - heading "Northstar E2E" [level=2]
  - text: pk_playground_local Owner
  - button "Страницы"
  - button "Участники"
  - textbox "Новая страница"
  - textbox "/pricing"
  - button "Добавить"
  - heading "Страницы" [level=3]
  - button "Home /"
  - button "S3 Home /__e2e__/s3-c9da745d-3ee2-4b33-89de-e6472c4bf094"
  - button "Deployment admin pricing /__e2e__/s3-pricing-admin-012d02fc-50ca-4e8c-a3a1-a5e4e493379e"
  - button "Deployment admin pricing /__e2e__/s3-pricing-admin-2b9c797b-abfa-4d82-aeab-9f19576650f1"
  - button "Deployment admin pricing /__e2e__/s3-pricing-admin-8ba69544-4041-463f-804c-21428d7e6e61"
  - button "Deployment admin pricing /__e2e__/s3-pricing-admin-e2966593-ada0-459c-a573-93606af8605f"
  - button "S3 Pricing /__e2e__/s3-pricing-c9da745d-3ee2-4b33-89de-e6472c4bf094"
  - button "Deployment repair pricing /__e2e__/s3-pricing-repair-82641cdf-7bb6-4411-8782-d3ed67136bd5"
  - button "Deployment browser /__e2e__/s4-react-csr-a-deployment-chromium-1791139678990"
  - button "Deployment browser /__e2e__/s4-react-ssr-a-deployment-chromium-1791139679498"
  - button "Deployment browser /__e2e__/s4-vue-csr-a-deployment-chromium-1791139679941"
  - button "Deployment browser /__e2e__/s4-vue-ssr-a-deployment-chromium-1791139680474"
  - button "Pricing /pricing"
  - button "Версии"
  - button "Experiments"
  - region "На действующем сайте":
    - heading "На действующем сайте" [level=3]
    - button "Обновить состояние"
    - strong: "Правки отключены: исходная страница"
    - paragraph: Зафиксированная версия хранит правки. На сайт они попадут только после включения и при установленном SDK в режиме публикаций. Уже открытые вкладки обновят правки при переходе, обновлении страницы или SDK.
    - text: Версия для проверки и включения
    - combobox "Версия для публикации":
      - option "Нет зафиксированных версий" [selected]
    - text: Причина действия
    - textbox "Причина публикации":
      - /placeholder: "Например: уточнили заголовок тарифа"
    - button "Включить версию" [disabled]
    - button "Отключить правки" [disabled]
    - button "Откатить на выбранную версию" [disabled]
    - group: История публикаций
  - heading "Черновик" [level=3]
  - text: Неопубликованные правки Сохранение №0
  - button "Открыть редактор"
  - button "Зафиксировать версию"
  - heading "Ссылки на версии" [level=3]
  - paragraph: Активных ссылок пока нет.
  - heading "Зафиксированные версии" [level=3]
  - paragraph: Зафиксированных версий ещё нет.
```

# Test source

```ts
  1   | import { randomUUID } from 'node:crypto';
  2   | import { mkdir } from 'node:fs/promises';
  3   | import { resolve } from 'node:path';
  4   | 
  5   | import { expect, test, required } from './fixtures';
  6   | 
  7   | const ORIGINAL_HOME_TITLE = 'Редактируйте интерфейс, а не исходный код';
  8   | const RELEASE_ONE_TITLE = 'S3 release one';
  9   | const RELEASE_TWO_TITLE = 'S3 release two · Variant B';
  10  | 
  11  | test('S3 Admin → release/share → sticky experiment → consent-gated report', async ({ newContext }) => {
  12  |   const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  13  |   const playgroundBaseUrl = required('LYKAR_E2E_PLAYGROUND_BASE_URL');
  14  |   const owner = await newContext();
  15  |   const shareVisitor = await newContext();
  16  |   const pendingVisitor = await newContext();
  17  |   const grantedVisitor = await newContext();
  18  |   const admin = await owner.newPage();
  19  | 
  20  |   let failProjectListOnce = true;
  21  |   await admin.route(`${apiBaseUrl}/api/admin/projects`, async route => {
  22  |     if (failProjectListOnce) {
  23  |       failProjectListOnce = false;
  24  |       await route.fulfill({
  25  |         status: 503,
  26  |         headers: { 'content-type': 'application/json', 'x-lykar-e2e-fault': 'admin-load-once' },
  27  |         body: JSON.stringify({ message: 'Injected one-time project list failure' }),
  28  |       });
  29  |       return;
  30  |     }
  31  |     await route.continue();
  32  |   });
  33  |   await admin.goto(`${apiBaseUrl}/admin/`);
  34  |   await admin.getByRole('button', { name: 'Войти как локальный владелец' }).click();
  35  |   await expect(admin.getByRole('alert').filter({ hasText: 'Не удалось загрузить сайты' })).toBeVisible();
  36  |   await admin.getByRole('button', { name: 'Повторить' }).click();
  37  |   await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  38  | 
  39  |   // Use uniquely-scoped Pages so this acceptance can run beside other E2E
  40  |   // flows without changing their seeded Home or Pricing state.
  41  |   const pageSuffix = randomUUID();
  42  |   const rootPath = `/__e2e__/s3-${pageSuffix}`;
  43  |   const pricingPath = `/__e2e__/s3-pricing-${pageSuffix}`;
  44  |   const projectsResponse = await owner.request.get(`${apiBaseUrl}/api/admin/projects`);
  45  |   expect(projectsResponse.ok()).toBeTruthy();
  46  |   const projects = (await projectsResponse.json() as { projects: Array<{ id: string; name: string; publicKey: string }> }).projects;
  47  |   const project = projects.find(item => item.name === 'Northstar E2E');
  48  |   expect(project).toBeTruthy();
  49  |   const rootPageResponse = await owner.request.post(`${apiBaseUrl}/api/admin/projects/${project!.id}/pages`, {
  50  |     data: { name: 'S3 Home', pathname: rootPath },
  51  |   });
  52  |   expect(rootPageResponse.status()).toBe(201);
  53  |   const rootPage = (await rootPageResponse.json() as { page: { id: string; pathname: string } }).page;
  54  |   const pricingPageResponse = await owner.request.post(`${apiBaseUrl}/api/admin/projects/${project!.id}/pages`, {
  55  |     data: { name: 'S3 Pricing', pathname: pricingPath },
  56  |   });
  57  |   expect(pricingPageResponse.status()).toBe(201);
  58  |   const pricingPage = (await pricingPageResponse.json() as { page: { id: string; pathname: string } }).page;
  59  | 
  60  |   let failPageListOnce = true;
  61  |   await admin.route(`${apiBaseUrl}/api/admin/projects/${project!.id}/pages`, async route => {
  62  |     if (failPageListOnce) {
  63  |       failPageListOnce = false;
  64  |       await route.fulfill({
  65  |         status: 503,
  66  |         headers: { 'content-type': 'application/json', 'x-lykar-e2e-fault': 'admin-load-once' },
  67  |         body: JSON.stringify({ message: 'Injected one-time Page list failure' }),
  68  |       });
  69  |       return;
  70  |     }
  71  |     await route.continue();
  72  |   });
  73  |   await admin.reload();
  74  |   await expect(admin.getByRole('alert').filter({ hasText: 'Не удалось загрузить данные сайта' })).toBeVisible();
  75  |   await admin.getByRole('button', { name: 'Повторить' }).click();
  76  |   await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  77  |   await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  78  |   await admin.getByRole('button', { name: 'Создать черновик' }).click();
> 79  |   await expect(admin.getByText('revision 0')).toBeVisible();
      |                                               ^ Error: expect(locator).toBeVisible() failed
  80  |   await admin.getByRole('button', { name: 'Участники' }).click();
  81  |   await expect(admin.getByRole('heading', { name: 'Пригласить участника' })).toBeVisible();
  82  |   await expect(admin.locator('.member-row').getByText('owner@lykar.local')).toBeVisible();
  83  |   await expect(admin.locator('.member-row').getByText('Owner', { exact: true })).toBeVisible();
  84  |   await admin.getByRole('button', { name: 'Страницы' }).click();
  85  |   await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  86  |   await expect(admin.getByText('revision 0')).toBeVisible();
  87  | 
  88  |   // Publish the first root-page release through the editor and Admin screens.
  89  |   const firstEditorPopup = owner.waitForEvent('page');
  90  |   await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  91  |   const firstEditor = await firstEditorPopup;
  92  |   const firstPanel = firstEditor.locator('[data-lykar-editor-root="panel"]');
  93  |   const homeTitle = firstEditor.locator('[data-lykar-id="hero-title"]');
  94  |   await homeTitle.click();
  95  |   await firstPanel.locator('[data-field="text"]').fill(RELEASE_ONE_TITLE);
  96  |   await expect(homeTitle).toHaveText(RELEASE_ONE_TITLE);
  97  |   await firstPanel.locator('[data-action="apply"]').click();
  98  |   await expect(firstPanel.locator('[data-field="status"]')).toContainText('revision: 1');
  99  |   await firstEditor.close();
  100 |   await admin.reload();
  101 |   await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  102 |   await expect(admin.getByText('revision 1')).toBeVisible();
  103 |   await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  104 |   await expect(admin.locator('.release').filter({ hasText: 'Версия 1' })).toBeVisible();
  105 | 
  106 |   // Create a share in Admin, check its page binding, then preview and revoke it.
  107 |   await admin.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  108 |   await admin.locator('.release').filter({ hasText: 'Версия 1' }).getByRole('button', { name: 'Ссылка на версию' }).click();
  109 |   const shareUrlField = admin.getByRole('textbox', { name: 'Share URL' });
  110 |   await expect(shareUrlField).toBeVisible();
  111 |   await expect(admin.locator('.fresh-share')).toContainText('Ссылка создана. Скопируйте её ниже.');
  112 |   const shareUrl = await shareUrlField.inputValue();
  113 |   await expect.poll(() => shareUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/share\//);
  114 | 
  115 |   const initialShareRedirect = await owner.request.get(shareUrl, { maxRedirects: 0 });
  116 |   expect(initialShareRedirect.status()).toBe(302);
  117 |   const shareLanding = new URL(initialShareRedirect.headers().location);
  118 |   const shareCode = new URLSearchParams(shareLanding.hash.slice(1)).get('lykar_share');
  119 |   expect(shareCode).toBeTruthy();
  120 |   const wrongPageExchange = await owner.request.post(`${apiBaseUrl}/api/share/exchange`, {
  121 |     data: { code: shareCode, pageUrl: `${playgroundBaseUrl}${pricingPath}` },
  122 |   });
  123 |   expect(wrongPageExchange.status()).toBe(401);
  124 |   const correctPageExchange = await owner.request.post(`${apiBaseUrl}/api/share/exchange`, {
  125 |     data: { code: shareCode, pageUrl: `${shareLanding.origin}${shareLanding.pathname}` },
  126 |   });
  127 |   expect(correctPageExchange.status()).toBe(200);
  128 |   const shareAccess = (await correctPageExchange.json() as { access: { token: string } }).access;
  129 | 
  130 |   const shared = await shareVisitor.newPage();
  131 |   await shared.goto(shareUrl);
  132 |   await expect(shared.locator('[data-lykar-id="hero-title"]')).toHaveText(RELEASE_ONE_TITLE);
  133 |   await expect(shared.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  134 |   await expect(shared.locator('body')).toHaveAttribute('data-lykar-mode', 'share');
  135 | 
  136 |   // A stale Admin revision returns 409. The screen must refresh and allow retry.
  137 |   await admin.getByRole('button', { name: 'Создать черновик' }).click();
  138 |   await expect(admin.getByText('revision 0')).toBeVisible();
  139 |   const currentDraftsResponse = await owner.request.get(`${apiBaseUrl}/api/admin/pages/${rootPage.id}/drafts`);
  140 |   expect(currentDraftsResponse.ok()).toBeTruthy();
  141 |   const currentDrafts = (await currentDraftsResponse.json() as { drafts: Array<{ id: string; status: string; revision: number }> }).drafts;
  142 |   const secondDraft = currentDrafts.find(item => item.status === 'open');
  143 |   expect(secondDraft).toBeTruthy();
  144 |   const secondSave = await owner.request.post(`${apiBaseUrl}/api/admin/drafts/${secondDraft!.id}/operations`, {
  145 |     data: {
  146 |       idempotencyKey: `s3-save-${randomUUID()}`,
  147 |       expectedRevision: 0,
  148 |       operations: [{
  149 |         schemaVersion: 1,
  150 |         id: randomUUID(),
  151 |         kind: 'setText',
  152 |         target: { marker: 'hero-title' },
  153 |         value: RELEASE_TWO_TITLE,
  154 |       }],
  155 |     },
  156 |   });
  157 |   expect(secondSave.status()).toBe(200);
  158 |   await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  159 |   await expect(admin.getByRole('alert').filter({ hasText: /revision|измен|обнов/i })).toBeVisible();
  160 |   await expect(admin.getByText('revision 1')).toBeVisible();
  161 |   await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  162 |   await expect(admin.locator('.release').filter({ hasText: 'Версия 2' })).toBeVisible();
  163 | 
  164 |   // The second Page gets an independent Version 1 after S3 Home reaches Version 2.
  165 |   const pricingDraftResponse = await owner.request.post(`${apiBaseUrl}/api/admin/pages/${pricingPage.id}/drafts`, { data: {} });
  166 |   expect(pricingDraftResponse.status()).toBe(201);
  167 |   const pricingDraft = (await pricingDraftResponse.json() as { draft: { id: string; revision: number } }).draft;
  168 |   const pricingSave = await owner.request.post(`${apiBaseUrl}/api/admin/drafts/${pricingDraft.id}/operations`, {
  169 |     data: {
  170 |       idempotencyKey: `s3-pricing-save-${randomUUID()}`,
  171 |       expectedRevision: pricingDraft.revision,
  172 |       operations: [{
  173 |         schemaVersion: 1,
  174 |         id: randomUUID(),
  175 |         kind: 'setText',
  176 |         target: { marker: 'pricing-title' },
  177 |         value: 'S3 pricing page release one',
  178 |       }],
  179 |     },
```