import type {BrowserContext, Page} from '@playwright/test';

import {expect, test, required} from './fixtures';

type DraftLaunch = {draftId: string; launchUrl: string};

async function createDraftLaunch(context: BrowserContext): Promise<DraftLaunch> {
  const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  const login = await context.request.post(`${apiBaseUrl}/api/auth/dev-login`, {data: {}});
  expect(login.ok()).toBe(true);
  const projects = await context.request.get(`${apiBaseUrl}/api/admin/projects`);
  const project = (await projects.json()).projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  const pages = await context.request.get(`${apiBaseUrl}/api/admin/projects/${project.id}/pages`);
  const page = (await pages.json()).pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  const created = await context.request.post(`${apiBaseUrl}/api/admin/pages/${page.id}/drafts`, {data: {}});
  const draft = (await created.json()).draft;
  const launch = await context.request.post(`${apiBaseUrl}/api/admin/pages/${page.id}/editor-launch`, {
    data: {draftId: draft.id},
  });
  return {draftId: draft.id, launchUrl: (await launch.json()).launchUrl};
}

async function secondLaunch(context: BrowserContext, draftId: string): Promise<string> {
  const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  const projects = await context.request.get(`${apiBaseUrl}/api/admin/projects`);
  const project = (await projects.json()).projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  const pages = await context.request.get(`${apiBaseUrl}/api/admin/projects/${project.id}/pages`);
  const page = (await pages.json()).pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  const launch = await context.request.post(`${apiBaseUrl}/api/admin/pages/${page.id}/editor-launch`, {data: {draftId}});
  return (await launch.json()).launchUrl;
}

async function editTitle(page: Page, value: string): Promise<void> {
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  await hero.click();
  await panel.locator('[data-field="text"]').fill(value);
  await expect(hero).toHaveText(value);
}

test('two tabs expose revision conflict and preserve pending edits through reload', async ({newContext}) => {
  const context = await newContext();
  const firstLaunch = await createDraftLaunch(context);
  const otherLaunchUrl = await secondLaunch(context, firstLaunch.draftId);
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto(firstLaunch.launchUrl), second.goto(otherLaunchUrl)]);

  await editTitle(first, 'Saved by tab one');
  await editTitle(second, 'Pending in tab two');
  const firstPanel = first.locator('[data-lykar-editor-root="panel"]');
  const secondPanel = second.locator('[data-lykar-editor-root="panel"]');
  await firstPanel.locator('[data-action="apply"]').click();
  await expect(firstPanel.locator('[data-field="status"]')).toContainText('revision: 1');

  await secondPanel.locator('[data-action="apply"]').click();
  await expect(secondPanel.locator('[data-view="save-conflict"]')).toBeVisible();
  await expect(secondPanel.locator('[data-action="apply"]')).toHaveText('Применить (1)');
  await expect(second.locator('[data-lykar-id="pricing-title"]')).toHaveText('Pending in tab two');

  await second.reload();
  await expect(second.locator('[data-lykar-id="pricing-title"]')).toHaveText('Pending in tab two');
  await expect(secondPanel.locator('[data-view="save-conflict"]')).toBeVisible();
  await expect(secondPanel.locator('[data-action="apply"]')).toHaveText('Применить (1)');

  await secondPanel.locator('[data-action="resolve-conflict"]').click();
  await expect(secondPanel.locator('[data-view="save-conflict"]')).toBeHidden();
  await secondPanel.locator('[data-action="apply"]').click();
  await expect(secondPanel.locator('[data-field="status"]')).toContainText('revision: 2');

  const persisted = await context.request.get(
    `${required('LYKAR_E2E_API_BASE_URL')}/api/admin/drafts/${firstLaunch.draftId}`,
  );
  const details = await persisted.json();
  expect(details.draft.revision).toBe(2);
  expect(details.operations).toHaveLength(2);
});

test('lost response after commit reconciles on reload without duplicate operations', async ({newContext}) => {
  const context = await newContext();
  const launch = await createDraftLaunch(context);
  const editor = await context.newPage();
  let dropped = false;
  await editor.route(`**/api/editor/drafts/${launch.draftId}/operations`, async route => {
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort('aborted');
  });
  await editor.goto(launch.launchUrl);
  await editTitle(editor, 'Committed with a lost response');
  const panel = editor.locator('[data-lykar-editor-root="panel"]');
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('безопасного повтора');

  await editor.reload();
  await expect(editor.locator('[data-lykar-id="pricing-title"]')).toHaveText('Committed with a lost response');
  await expect(panel.locator('[data-action="apply"]')).toBeDisabled();

  const persisted = await context.request.get(
    `${required('LYKAR_E2E_API_BASE_URL')}/api/admin/drafts/${launch.draftId}`,
  );
  const details = await persisted.json();
  expect(details.draft.revision).toBe(1);
  expect(details.operations).toHaveLength(1);
});

test('undo of a saved change appends a revision and survives save/reload', async ({newContext}) => {
  const context = await newContext();
  const launch = await createDraftLaunch(context);
  const editor = await context.newPage();
  await editor.goto(launch.launchUrl);
  const panel = editor.locator('[data-lykar-editor-root="panel"]');
  const hero = editor.locator('[data-lykar-id="pricing-title"]');
  const original = 'Простой тариф для первого релиза';

  await editTitle(editor, 'Saved before undo');
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('revision: 1');
  await panel.locator('[data-action="undo"]').click();
  await expect(hero).toHaveText(original);
  await expect(panel.locator('[data-action="apply"]')).toHaveText('Применить (1)');
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('revision: 2');

  await editor.reload();
  await expect(hero).toHaveText(original);
  const persisted = await context.request.get(
    `${required('LYKAR_E2E_API_BASE_URL')}/api/admin/drafts/${launch.draftId}`,
  );
  const details = await persisted.json();
  expect(details.operations).toHaveLength(2);
  expect(details.operations[1]).toMatchObject({
    kind: 'setText',
    value: original,
    revision: {previousOperationId: details.operations[0].id, reason: 'undo'},
  });
});

test('manual target repair previews the dependent chain and survives save/reload', async ({newContext}) => {
  const context = await newContext();
  const launch = await createDraftLaunch(context);
  const editor = await context.newPage();
  await editor.goto(launch.launchUrl);
  const panel = editor.locator('[data-lykar-editor-root="panel"]');
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();

  await editor.evaluate(async () => {
    const session = (window as unknown as {__LYKAR_EDITOR__: {session: {apply: (batch: unknown) => Promise<unknown>}}}).__LYKAR_EDITOR__.session;
    await session.apply({operations: [
      {
        schemaVersion: 1, id: 'browser-missing-insert', kind: 'insertNode', target: {marker: 'removed-slot'},
        position: 'append', node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Browser repaired'}]},
      },
      {
        schemaVersion: 1, id: 'browser-dependent-style', kind: 'setStyle',
        target: {nodeRef: {operationId: 'browser-missing-insert'}}, dependsOn: ['browser-missing-insert'],
        property: 'color', value: 'rgb(128, 0, 128)',
      },
    ]});
  });
  const failed = panel.locator('[data-operation-id="browser-missing-insert"]');
  await expect(failed).toContainText('TARGET_NOT_FOUND');
  await failed.getByRole('button', {name: /Исправить target/}).click();
  await editor.locator('#plans').click();
  const repaired = editor.locator('#plans p').filter({hasText: 'Browser repaired'});
  await expect(repaired).toBeVisible();
  await expect(repaired).toHaveCSS('color', 'rgb(128, 0, 128)');
  await expect(panel.locator('[data-action="apply"]')).toHaveText('Применить (4)');
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('revision: 1');

  await editor.reload();
  await expect(editor.locator('#plans p').filter({hasText: 'Browser repaired'})).toHaveCSS('color', 'rgb(128, 0, 128)');
});
