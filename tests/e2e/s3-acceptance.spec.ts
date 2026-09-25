import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, required } from './fixtures';

const ORIGINAL_HOME_TITLE = 'Редактируйте интерфейс, а не исходный код';
const RELEASE_ONE_TITLE = 'S3 release one';
const RELEASE_TWO_TITLE = 'S3 release two · Variant B';

test('S3 Admin → release/share → sticky experiment → consent-gated report', async ({ newContext }) => {
  const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  const playgroundBaseUrl = required('LYKAR_E2E_PLAYGROUND_BASE_URL');
  const owner = await newContext();
  const shareVisitor = await newContext();
  const pendingVisitor = await newContext();
  const grantedVisitor = await newContext();
  const admin = await owner.newPage();

  let failProjectListOnce = true;
  await admin.route(`${apiBaseUrl}/api/admin/projects`, async route => {
    if (failProjectListOnce) {
      failProjectListOnce = false;
      await route.fulfill({
        status: 503,
        headers: { 'content-type': 'application/json', 'x-lykar-e2e-fault': 'admin-load-once' },
        body: JSON.stringify({ message: 'Injected one-time project list failure' }),
      });
      return;
    }
    await route.continue();
  });
  await admin.goto(`${apiBaseUrl}/admin/`);
  await admin.getByRole('button', { name: 'Войти как локальный владелец' }).click();
  await expect(admin.getByRole('alert').filter({ hasText: 'Не удалось загрузить сайты' })).toBeVisible();
  await admin.getByRole('button', { name: 'Повторить' }).click();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();

  // Use uniquely-scoped Pages so this acceptance can run beside other E2E
  // flows without changing their seeded Home or Pricing state.
  const pageSuffix = randomUUID();
  const rootPath = `/__e2e__/s3-${pageSuffix}`;
  const pricingPath = `/__e2e__/s3-pricing-${pageSuffix}`;
  const projectsResponse = await owner.request.get(`${apiBaseUrl}/api/admin/projects`);
  expect(projectsResponse.ok()).toBeTruthy();
  const projects = (await projectsResponse.json() as { projects: Array<{ id: string; name: string; publicKey: string }> }).projects;
  const project = projects.find(item => item.name === 'Northstar E2E');
  expect(project).toBeTruthy();
  const rootPageResponse = await owner.request.post(`${apiBaseUrl}/api/admin/projects/${project!.id}/pages`, {
    data: { name: 'S3 Home', pathname: rootPath },
  });
  expect(rootPageResponse.status()).toBe(201);
  const rootPage = (await rootPageResponse.json() as { page: { id: string; pathname: string } }).page;
  const pricingPageResponse = await owner.request.post(`${apiBaseUrl}/api/admin/projects/${project!.id}/pages`, {
    data: { name: 'S3 Pricing', pathname: pricingPath },
  });
  expect(pricingPageResponse.status()).toBe(201);
  const pricingPage = (await pricingPageResponse.json() as { page: { id: string; pathname: string } }).page;

  let failPageListOnce = true;
  await admin.route(`${apiBaseUrl}/api/admin/projects/${project!.id}/pages`, async route => {
    if (failPageListOnce) {
      failPageListOnce = false;
      await route.fulfill({
        status: 503,
        headers: { 'content-type': 'application/json', 'x-lykar-e2e-fault': 'admin-load-once' },
        body: JSON.stringify({ message: 'Injected one-time Page list failure' }),
      });
      return;
    }
    await route.continue();
  });
  await admin.reload();
  await expect(admin.getByRole('alert').filter({ hasText: 'Не удалось загрузить данные сайта' })).toBeVisible();
  await admin.getByRole('button', { name: 'Повторить' }).click();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  await admin.getByRole('button', { name: 'Создать draft' }).click();
  await expect(admin.getByText('revision 0')).toBeVisible();
  await admin.getByRole('button', { name: 'Участники' }).click();
  await expect(admin.getByRole('heading', { name: 'Пригласить участника' })).toBeVisible();
  await expect(admin.locator('.member-row').getByText('owner@lykar.local')).toBeVisible();
  await expect(admin.locator('.member-row').getByText('Owner', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Страницы' }).click();
  await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  await expect(admin.getByText('revision 0')).toBeVisible();

  // Publish the first root-page release through the editor and Admin screens.
  const firstEditorPopup = owner.waitForEvent('page');
  await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  const firstEditor = await firstEditorPopup;
  const firstPanel = firstEditor.locator('[data-lykar-editor-root="panel"]');
  const homeTitle = firstEditor.locator('[data-lykar-id="hero-title"]');
  await homeTitle.click();
  await firstPanel.locator('[data-field="text"]').fill(RELEASE_ONE_TITLE);
  await expect(homeTitle).toHaveText(RELEASE_ONE_TITLE);
  await firstPanel.locator('[data-action="apply"]').click();
  await expect(firstPanel.locator('[data-field="status"]')).toContainText('revision: 1');
  await firstEditor.close();
  await admin.reload();
  await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  await expect(admin.getByText('revision 1')).toBeVisible();
  await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  await expect(admin.locator('.release').filter({ hasText: 'Version 1' })).toBeVisible();

  // Create a share in Admin, check its page binding, then preview and revoke it.
  await admin.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await admin.locator('.release').filter({ hasText: 'Version 1' }).getByRole('button', { name: 'Share' }).click();
  const shareUrlField = admin.getByRole('textbox', { name: 'Share URL' });
  await expect(shareUrlField).toBeVisible();
  await expect(admin.locator('.fresh-share')).toContainText('Ссылка создана. Скопируйте её ниже.');
  const shareUrl = await shareUrlField.inputValue();
  await expect.poll(() => shareUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/share\//);

  const initialShareRedirect = await owner.request.get(shareUrl, { maxRedirects: 0 });
  expect(initialShareRedirect.status()).toBe(302);
  const shareLanding = new URL(initialShareRedirect.headers().location);
  const shareCode = new URLSearchParams(shareLanding.hash.slice(1)).get('lykar_share');
  expect(shareCode).toBeTruthy();
  const wrongPageExchange = await owner.request.post(`${apiBaseUrl}/api/share/exchange`, {
    data: { code: shareCode, pageUrl: `${playgroundBaseUrl}${pricingPath}` },
  });
  expect(wrongPageExchange.status()).toBe(401);
  const correctPageExchange = await owner.request.post(`${apiBaseUrl}/api/share/exchange`, {
    data: { code: shareCode, pageUrl: `${shareLanding.origin}${shareLanding.pathname}` },
  });
  expect(correctPageExchange.status()).toBe(200);
  const shareAccess = (await correctPageExchange.json() as { access: { token: string } }).access;

  const shared = await shareVisitor.newPage();
  await shared.goto(shareUrl);
  await expect(shared.locator('[data-lykar-id="hero-title"]')).toHaveText(RELEASE_ONE_TITLE);
  await expect(shared.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  await expect(shared.locator('body')).toHaveAttribute('data-lykar-mode', 'share');

  // A stale Admin revision returns 409. The screen must refresh and allow retry.
  await admin.getByRole('button', { name: 'Создать draft' }).click();
  await expect(admin.getByText('revision 0')).toBeVisible();
  const currentDraftsResponse = await owner.request.get(`${apiBaseUrl}/api/admin/pages/${rootPage.id}/drafts`);
  expect(currentDraftsResponse.ok()).toBeTruthy();
  const currentDrafts = (await currentDraftsResponse.json() as { drafts: Array<{ id: string; status: string; revision: number }> }).drafts;
  const secondDraft = currentDrafts.find(item => item.status === 'open');
  expect(secondDraft).toBeTruthy();
  const secondSave = await owner.request.post(`${apiBaseUrl}/api/admin/drafts/${secondDraft!.id}/operations`, {
    data: {
      idempotencyKey: `s3-save-${randomUUID()}`,
      expectedRevision: 0,
      operations: [{
        schemaVersion: 1,
        id: randomUUID(),
        kind: 'setText',
        target: { marker: 'hero-title' },
        value: RELEASE_TWO_TITLE,
      }],
    },
  });
  expect(secondSave.status()).toBe(200);
  await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  await expect(admin.getByRole('alert').filter({ hasText: /revision|измен|обнов/i })).toBeVisible();
  await expect(admin.getByText('revision 1')).toBeVisible();
  await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  await expect(admin.locator('.release').filter({ hasText: 'Version 2' })).toBeVisible();

  // The second Page gets an independent Version 1 after S3 Home reaches Version 2.
  const pricingDraftResponse = await owner.request.post(`${apiBaseUrl}/api/admin/pages/${pricingPage.id}/drafts`, { data: {} });
  expect(pricingDraftResponse.status()).toBe(201);
  const pricingDraft = (await pricingDraftResponse.json() as { draft: { id: string; revision: number } }).draft;
  const pricingSave = await owner.request.post(`${apiBaseUrl}/api/admin/drafts/${pricingDraft.id}/operations`, {
    data: {
      idempotencyKey: `s3-pricing-save-${randomUUID()}`,
      expectedRevision: pricingDraft.revision,
      operations: [{
        schemaVersion: 1,
        id: randomUUID(),
        kind: 'setText',
        target: { marker: 'pricing-title' },
        value: 'S3 pricing page release one',
      }],
    },
  });
  expect(pricingSave.status()).toBe(200);
  const pricingPublished = await owner.request.post(`${apiBaseUrl}/api/admin/drafts/${pricingDraft.id}/publish`, {
    data: { expectedRevision: pricingDraft.revision + 1 },
  });
  expect(pricingPublished.status()).toBe(201);

  const foreignPageManifest = await owner.request.get(
    `${apiBaseUrl}/api/runtime/projects/${project!.publicKey}/manifest?pathname=${encodeURIComponent(pricingPath)}&version=1`,
    { headers: { authorization: `Bearer ${shareAccess.token}` } },
  );
  expect(foreignPageManifest.status()).toBe(401);

  await admin.locator('.share').filter({ hasText: 'v1' }).getByRole('button', { name: 'Отозвать' }).click();
  const revokedShare = await owner.request.get(shareUrl, { maxRedirects: 0 });
  expect(revokedShare.status()).toBe(404);

  await admin.getByRole('button', { name: `S3 Pricing ${pricingPath}` }).click();
  await expect(admin.getByText('Version 1', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: `S3 Home ${rootPath}` }).click();
  await expect(admin.locator('.release').filter({ hasText: 'Version 2' })).toBeVisible();

  // Native A + immutable Release 2 B, then test sticky assignment and consent.
  await admin.getByRole('button', { name: 'Experiments' }).click();
  await admin.getByPlaceholder('Название эксперимента').fill('S3 consent report');
  const rootReleasesResponse = await owner.request.get(`${apiBaseUrl}/api/admin/pages/${rootPage.id}/releases`);
  expect(rootReleasesResponse.ok()).toBeTruthy();
  const rootReleases = (await rootReleasesResponse.json() as { releases: Array<{ id: string; version: number }> }).releases;
  const releaseTwo = rootReleases.find(item => item.version === 2);
  expect(releaseTwo).toBeTruthy();
  await admin.locator('.experiment-create label').filter({ hasText: 'Variant A' }).locator('select').selectOption('native');
  await admin.locator('.experiment-create label').filter({ hasText: 'Variant B' }).locator('select').selectOption(releaseTwo!.id);
  let failExperimentRefreshOnce = true;
  await admin.route(`${apiBaseUrl}/api/admin/pages/${rootPage.id}/experiments`, async route => {
    if (failExperimentRefreshOnce && route.request().method() === 'GET') {
      failExperimentRefreshOnce = false;
      await route.fulfill({
        status: 503,
        headers: { 'content-type': 'application/json', 'x-lykar-e2e-fault': 'admin-load-once' },
        body: JSON.stringify({ message: 'Injected one-time experiment refresh failure' }),
      });
      return;
    }
    await route.continue();
  });
  await admin.locator('.experiment-create').getByRole('button', { name: 'Создать' }).click();
  await expect(admin.getByRole('alert').filter({ hasText: 'Действие выполнено, но данные не обновились' })).toBeVisible();
  const createdExperimentsResponse = await owner.request.get(`${apiBaseUrl}/api/admin/pages/${rootPage.id}/experiments`);
  expect(createdExperimentsResponse.ok()).toBeTruthy();
  const createdExperiments = (await createdExperimentsResponse.json() as { experiments: Array<{ name: string }> }).experiments;
  expect(createdExperiments.filter(item => item.name === 'S3 consent report')).toHaveLength(1);
  await admin.getByRole('button', { name: 'Повторить' }).click();
  await expect(admin.getByRole('heading', { name: 'S3 consent report' })).toBeVisible();
  await admin.getByRole('button', { name: 'Запустить' }).click();
  await expect(admin.getByText('active', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'Создать A/B-ссылку' }).click();
  const experimentLink = admin.getByRole('link', { name: 'Открыть A/B-ссылку' });
  await expect(experimentLink).toBeVisible();
  const experimentUrl = await experimentLink.getAttribute('href');
  expect(experimentUrl).toBeTruthy();

  const pendingPage = await pendingVisitor.newPage();
  await pendingPage.goto(experimentUrl!);
  await expect(pendingPage.locator('[data-lykar-id="hero-title"]')).toHaveText(/S3 release two · Variant B|Редактируйте интерфейс, а не исходный код/);
  const firstAssignmentTitle = await pendingPage.locator('[data-lykar-id="hero-title"]').textContent();
  await pendingPage.reload();
  await expect(pendingPage.locator('[data-lykar-id="hero-title"]')).toHaveText(firstAssignmentTitle ?? '');
  const pendingTrack = await pendingPage.evaluate(async () => {
    const sdk = (window as unknown as { __LYKAR_SDK__: { track(name: string): Promise<{ accepted: boolean; code?: string }> } }).__LYKAR_SDK__;
    return sdk.track('signup');
  });
  expect(pendingTrack).toMatchObject({ accepted: false, code: 'CONSENT_REQUIRED' });
  await pendingPage.evaluate(() => {
    const sdk = (window as unknown as { __LYKAR_SDK__: { consent(value: 'denied'): void } }).__LYKAR_SDK__;
    sdk.consent('denied');
  });
  const deniedTrack = await pendingPage.evaluate(async () => {
    const sdk = (window as unknown as { __LYKAR_SDK__: { track(name: string): Promise<{ accepted: boolean; code?: string }> } }).__LYKAR_SDK__;
    return sdk.track('signup');
  });
  expect(deniedTrack).toMatchObject({ accepted: false, code: 'CONSENT_DENIED' });

  await admin.getByRole('button', { name: 'Показать аналитику' }).click();
  await expect(admin.locator('.analytics-table')).toBeVisible();
  const experimentId = await experimentIdFromAdmin(admin, apiBaseUrl, rootPage.id);
  let reportResponse = await owner.request.get(`${apiBaseUrl}/api/admin/experiments/${experimentId}/analytics`);
  expect(reportResponse.ok()).toBeTruthy();
  let report = (await reportResponse.json() as { report: { variants: Array<{ visitors: number; views: number; uniqueConversions: number; conversions: number }> } }).report;
  expect(report.variants.reduce((sum, variant) => sum + variant.visitors + variant.views + variant.uniqueConversions + variant.conversions, 0)).toBe(0);

  const grantedPage = await grantedVisitor.newPage();
  await grantedPage.goto(experimentUrl!);
  await expect(grantedPage.locator('[data-lykar-id="hero-title"]')).toHaveText(/S3 release two · Variant B|Редактируйте интерфейс, а не исходный код/);
  const grantedTitle = await grantedPage.locator('[data-lykar-id="hero-title"]').textContent();
  await grantedPage.reload();
  await expect(grantedPage.locator('[data-lykar-id="hero-title"]')).toHaveText(grantedTitle ?? '');
  await grantedPage.evaluate(() => {
    const sdk = (window as unknown as { __LYKAR_SDK__: { consent(value: 'granted'): void } }).__LYKAR_SDK__;
    sdk.consent('granted');
  });
  const grantedTrack = await grantedPage.evaluate(async () => {
    const sdk = (window as unknown as { __LYKAR_SDK__: { track(name: string, properties: { source: string }): Promise<{ accepted: boolean }> } }).__LYKAR_SDK__;
    return sdk.track('signup', { source: 'S3 acceptance' });
  });
  expect(grantedTrack.accepted).toBe(true);

  await admin.getByRole('button', { name: 'Обновить аналитику' }).click();
  await expect.poll(async () => {
    const response = await owner.request.get(`${apiBaseUrl}/api/admin/experiments/${experimentId}/analytics`);
    if (!response.ok()) return null;
    const current = (await response.json() as { report: { variants: Array<{ visitors: number; views: number; uniqueConversions: number; conversions: number }> } }).report;
    return current.variants.reduce((sum, variant) => sum + variant.visitors + variant.views + variant.uniqueConversions + variant.conversions, 0);
  }).toBe(4);
  reportResponse = await owner.request.get(`${apiBaseUrl}/api/admin/experiments/${experimentId}/analytics`);
  report = (await reportResponse.json() as { report: { variants: Array<{ visitors: number; views: number; uniqueConversions: number; conversions: number }> } }).report;
  expect(report.variants.reduce((sum, variant) => sum + variant.visitors, 0)).toBe(1);
  expect(report.variants.reduce((sum, variant) => sum + variant.views, 0)).toBe(1);
  expect(report.variants.reduce((sum, variant) => sum + variant.uniqueConversions, 0)).toBe(1);
  expect(report.variants.reduce((sum, variant) => sum + variant.conversions, 0)).toBe(1);
  await expect(admin.locator('.analytics-table')).toContainText('100.00%');

  await admin.getByRole('button', { name: 'Завершить · B' }).click();
  await expect(admin.getByText('Победитель: B')).toBeVisible();
  const nativePage = await (await newContext()).newPage();
  await nativePage.goto(`${playgroundBaseUrl}${rootPath}`);
  await expect(nativePage.locator('[data-lykar-id="hero-title"]')).toHaveText(ORIGINAL_HOME_TITLE);
  await expect(nativePage.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);

  const reportAssets = resolve(process.cwd(), 'docs/verification/reports/S3/assets');
  await mkdir(reportAssets, { recursive: true });
  await admin.screenshot({ path: resolve(reportAssets, 'admin-experiment-report.png'), fullPage: true });
  await pendingPage.screenshot({ path: resolve(reportAssets, 'experiment-native-or-treatment.png'), fullPage: true });
  await shared.screenshot({ path: resolve(reportAssets, 'share-preview.png'), fullPage: true });

  await Promise.all([shared.close(), pendingPage.close(), grantedPage.close()]);
});

async function experimentIdFromAdmin(
  page: import('@playwright/test').Page,
  apiBaseUrl: string,
  rootPageId: string,
): Promise<string> {
  const row = page.locator('.experiment').filter({ has: page.getByRole('heading', { name: 'S3 consent report' }) });
  const heading = row.locator('h3');
  await expect(heading).toBeVisible();
  // The URL is present only in the freshly-created link; the experiment id is
  // obtained from the Admin list endpoint by looking up its unique name.
  const response = await page.request.get(`${apiBaseUrl}/api/admin/pages/${rootPageId}/experiments`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { experiments: Array<{ id: string; name: string }> };
  const experiment = payload.experiments.find(item => item.name === 'S3 consent report');
  expect(experiment).toBeTruthy();
  return experiment!.id;
}
