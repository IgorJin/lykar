import {randomUUID} from 'node:crypto';
import type {BrowserContext, Page} from '@playwright/test';
import {test, expect, required} from './fixtures.js';

type Draft = {id: string; revision: number; status: string; baseReleaseId: string | null};
type Release = {id: string; version: number; manifestHash: string};
type Operation = {
  id: string;
  kind: string;
  target: {marker?: string};
  value?: string;
  revision?: {previousOperationId: string; reason: string};
};
type DraftDetails = {draft: Draft; operations: Operation[]; baseOperations: Operation[]};
type Deployment = {revision: number; activeReleaseId: string | null};

function apiUrl(path: string) { return `${required('LYKAR_E2E_API_BASE_URL')}${path}`; }
async function post<T>(owner: BrowserContext, path: string, data: unknown = {}): Promise<T> {
  const response = await owner.request.post(apiUrl(path), {data});
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return response.json();
}
async function get<T>(owner: BrowserContext, path: string): Promise<T> {
  const response = await owner.request.get(apiUrl(path));
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true);
  return response.json();
}
async function ready(page: Page, mode: string) {
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as {__LYKAR_SDK_RESULT__?: {mode: string}}).__LYKAR_SDK_RESULT__?.mode,
  )).toBe(mode);
}

test('SERVICE-V1-05: repair → save → new Release → preview → Deploy preserves the old Release', async ({newContext}) => {
  test.setTimeout(60_000);
  const owner = await newContext();
  await post(owner, '/api/auth/dev-login');
  const {projects} = await get<{projects: Array<{id: string; name: string}>}>(owner, '/api/admin/projects');
  const project = projects.find(item => item.name === 'Northstar E2E');
  expect(project).toBeTruthy();
  // The pricing alias uses the real host HTML and SDK, with a fresh Page per run/browser.
  const pathname = `/__e2e__/s3-pricing-repair-${randomUUID()}`;
  const {page: record} = await post<{page: {id: string; name: string}}>(owner,
    `/api/admin/projects/${project!.id}/pages`, {name: 'Deployment repair pricing', pathname});
  const endpoint = `/api/admin/pages/${record.id}/deployment`;
  const draftsUrl = `/api/admin/pages/${record.id}/drafts`;
  const releasesUrl = `/api/admin/pages/${record.id}/releases`;
  const editedTitle = 'Тариф после ручного исправления';
  const nativeTitle = 'Простой тариф для первого релиза';
  const originalOperation = {
    schemaVersion: 1, id: randomUUID(), kind: 'setText',
    target: {marker: `missing-pricing-title-${randomUUID()}`}, value: editedTitle,
  };
  const {draft} = await post<{draft: Draft}>(owner, draftsUrl);
  const saved = await post<{draft: Draft}>(owner, `/api/admin/drafts/${draft.id}/operations`, {
    expectedRevision: draft.revision, idempotencyKey: randomUUID(), operations: [originalOperation],
  });
  const {release: originalRelease} = await post<{release: Release}>(owner, `/api/admin/drafts/${draft.id}/publish`, {
    expectedRevision: saved.draft.revision,
  });
  expect((await get<{drafts: Draft[]}>(owner, draftsUrl)).drafts.filter(item => item.status === 'open')).toEqual([]);

  try {
    const visitor = await (await newContext()).newPage();
    const visitorUrl = `${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}${pathname}?lykar_delivery=deployment`;
    await visitor.goto(visitorUrl);
    await ready(visitor, 'native');
    await expect(visitor.locator('[data-lykar-id="pricing-title"]')).toHaveText(nativeTitle);

    const admin = await owner.newPage();
    async function selectPage() {
      await admin.locator('.list-item').filter({hasText: 'Northstar E2E'}).click();
      await admin.getByRole('button', {name: `${record.name} ${pathname}`, exact: true}).click();
    }
    await admin.goto(apiUrl('/admin/'));
    await selectPage();
    const deploymentPanel = admin.getByRole('region', {name: 'На действующем сайте'});
    const releaseSelector = deploymentPanel.getByRole('combobox', {name: 'Версия для публикации'});
    await releaseSelector.selectOption(originalRelease.id);
    const brokenPopup = owner.waitForEvent('page');
    await deploymentPanel.getByRole('button', {name: 'Проверить на сайте'}).click();
    const brokenPreview = await brokenPopup;
    await expect(deploymentPanel.getByText('Есть неприменимые правки', {exact: true})).toBeVisible({timeout: 20_000});
    await expect(brokenPreview.locator('[data-lykar-id="pricing-title"]')).toHaveText(nativeTitle);
    await expect(deploymentPanel.getByRole('button', {name: 'Включить версию', exact: true})).toBeDisabled();
    await brokenPreview.close();

    const repairPopup = owner.waitForEvent('page');
    await deploymentPanel.getByRole('button', {name: 'Исправить в новом черновике'}).click();
    const editor = await repairPopup;
    const editorPanel = editor.locator('[data-lykar-editor-root="panel"]');
    await expect(editorPanel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
    const repairDraft = (await get<{drafts: Draft[]}>(owner, draftsUrl)).drafts.find(item => item.status === 'open');
    expect(repairDraft).toBeTruthy();
    expect(repairDraft!.baseReleaseId).toBe(originalRelease.id);
    const beforeRepair = await get<DraftDetails>(owner, `/api/admin/drafts/${repairDraft!.id}`);
    expect(beforeRepair.baseOperations).toEqual([originalOperation]);
    expect(beforeRepair.operations).toEqual([]);

    await editorPanel.getByRole('tab', {name: 'История изменений'}).click();
    const failed = editorPanel.locator(`[data-operation-id="${originalOperation.id}"]`);
    await expect(failed).toContainText('TARGET_NOT_FOUND');
    await failed.getByRole('button', {name: `Исправить target команды ${originalOperation.id}`, exact: true}).click();
    const title = editor.locator('[data-lykar-id="pricing-title"]');
    await title.click();
    await expect(title).toHaveText(editedTitle);
    await expect(editorPanel.locator('[data-field="pending-count"]')).toHaveText('1');
    await editorPanel.locator('[data-action="apply"]').click();
    await expect(editorPanel.locator('[data-field="status"]')).toContainText('revision: 1');
    const repaired = await get<DraftDetails>(owner, `/api/admin/drafts/${repairDraft!.id}`);
    expect(repaired.operations).toHaveLength(1);
    expect(repaired.operations[0]).toMatchObject({
      kind: 'setText', target: {marker: 'pricing-title'}, value: editedTitle,
      revision: {previousOperationId: originalOperation.id, reason: 'target-repair'},
    });
    expect(repaired.baseOperations).toEqual([originalOperation]);
    await editor.reload();
    await expect(title).toHaveText(editedTitle);
    await expect(editorPanel.locator('[data-action="apply"]')).toBeDisabled();
    await editor.close();

    await admin.reload();
    await selectPage();
    const published = admin.waitForResponse(response =>
      response.url() === apiUrl(`/api/admin/drafts/${repairDraft!.id}/publish`) && response.request().method() === 'POST',
    );
    await admin.getByRole('button', {name: 'Зафиксировать версию', exact: true}).click();
    const publishResponse = await published;
    expect(publishResponse.ok()).toBe(true);
    const {release: newRelease} = await publishResponse.json() as {release: Release};
    expect(newRelease.id).not.toBe(originalRelease.id);
    expect(newRelease.version).toBe(originalRelease.version + 1);
    await releaseSelector.selectOption(newRelease.id);
    expect((await get<{deployment: Deployment}>(owner, endpoint)).deployment.activeReleaseId).toBeNull();
    await visitor.reload();
    await ready(visitor, 'native');
    await expect(visitor.locator('[data-lykar-id="pricing-title"]')).toHaveText(nativeTitle);

    const checkedPopup = owner.waitForEvent('page');
    await deploymentPanel.getByRole('button', {name: 'Проверить на сайте'}).click();
    const checkedPreview = await checkedPopup;
    await expect(checkedPreview.locator('[data-lykar-id="pricing-title"]')).toHaveText(editedTitle);
    // The immutable old command remains in history as superseded, a harmless skip.
    await expect(deploymentPanel.getByText('Есть пропущенные правки', {exact: true})).toBeVisible();
    await expect(deploymentPanel.locator('.deployment-operations')).toContainText('Применено');
    await expect(deploymentPanel.locator('.deployment-operations')).toContainText('OPERATION_SUPERSEDED');
    expect((await get<{deployment: Deployment}>(owner, endpoint)).deployment.activeReleaseId).toBeNull();
    await checkedPreview.close();
    const reason = 'Включаем тариф после исправления target и проверки';
    await deploymentPanel.getByRole('textbox', {name: 'Причина публикации'}).fill(reason);
    await expect(deploymentPanel.getByRole('button', {name: 'Включить версию', exact: true})).toBeEnabled();
    await deploymentPanel.getByRole('button', {name: 'Включить версию', exact: true}).click();
    await expect(deploymentPanel.locator('.deployment-current strong')).toHaveText(`Версия ${newRelease.version} включена`);
    await expect(deploymentPanel.locator('.deployment-current')).toContainText(reason);
    expect((await get<{deployment: Deployment}>(owner, endpoint)).deployment.activeReleaseId).toBe(newRelease.id);
    await visitor.reload();
    await ready(visitor, 'visitor');
    await expect(visitor.locator('[data-lykar-id="pricing-title"]')).toHaveText(editedTitle);
    await expect(visitor.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);

    // GET Draft reads baseOperations directly from the old Release manifest,
    // including after publication; checking the saved delta alone would miss mutation.
    const afterDeploy = await get<DraftDetails>(owner, `/api/admin/drafts/${repairDraft!.id}`);
    expect(afterDeploy.baseOperations).toEqual([originalOperation]);
    const releases = (await get<{releases: Release[]}>(owner, releasesUrl)).releases;
    expect(releases).toHaveLength(2);
    expect(releases.find(item => item.id === originalRelease.id)?.manifestHash).toBe(originalRelease.manifestHash);
    expect((await get<{drafts: Draft[]}>(owner, draftsUrl)).drafts.filter(item => item.status === 'open')).toEqual([]);
  } finally {
    const {deployment} = await get<{deployment: Deployment}>(owner, endpoint);
    if (deployment.activeReleaseId) await post(owner, `${endpoint}/disable`, {
      expectedRevision: deployment.revision, idempotencyKey: randomUUID(), reason: 'E2E repair cleanup',
    });
  }
});
