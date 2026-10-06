import {randomUUID} from 'node:crypto';
import type {BrowserContext, Locator, Page} from '@playwright/test';
import {test, expect, required} from './fixtures.js';

type Release = {id: string; version: number};
type State = {revision: number; activeReleaseId: string | null};
type Activation = {action: string; reason: string; actorUserId: string; releaseId: string | null; revision: number};
type Command = {releaseId?: string; expectedRevision: number; idempotencyKey: string; reason: string};
const nativeTitle = 'Простой тариф для первого релиза';

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

async function prepare(owner: BrowserContext) {
  const {user} = await post<{user: {id: string; email: string}}>(owner, '/api/auth/dev-login');
  const {projects} = await get<{projects: Array<{id: string; name: string}>}>(owner, '/api/admin/projects');
  const project = projects.find(item => item.name === 'Northstar E2E');
  expect(project).toBeTruthy();
  // This existing playground alias serves pricing.html with the real SDK. A new Page
  // prevents inherited operations and preserves the seeded /pricing draft.
  const pathname = `/__e2e__/s3-pricing-admin-${randomUUID()}`;
  const {page} = await post<{page: {id: string; name: string}}>(owner,
    `/api/admin/projects/${project!.id}/pages`, {name: 'Deployment admin pricing', pathname});
  const endpoint = `/api/admin/pages/${page.id}/deployment`;
  return {
    user, page, pathname, endpoint,
    visitorUrl: `${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}${pathname}?lykar_delivery=deployment`,
    async state() { return (await get<{deployment: State}>(owner, endpoint)).deployment; },
    async history() { return (await get<{activations: Activation[]}>(owner, `${endpoint}/activations`)).activations; },
    async publish(value: string, css = '[data-lykar-id="pricing-title"]'): Promise<Release> {
      const {draft} = await post<{draft: {id: string; revision: number}}>(owner, `/api/admin/pages/${page.id}/drafts`);
      const saved = await post<{draft: {revision: number}}>(owner, `/api/admin/drafts/${draft.id}/operations`, {
        expectedRevision: draft.revision, idempotencyKey: randomUUID(),
        operations: [{schemaVersion: 1, id: randomUUID(), kind: 'setText', target: {selectors: {css}}, value}],
      });
      return (await post<{release: Release}>(owner, `/api/admin/drafts/${draft.id}/publish`,
        {expectedRevision: saved.draft.revision})).release;
    },
    async change(context: BrowserContext, action: 'deploy' | 'disable' | 'rollback', reason: string, releaseId?: string) {
      const {deployment} = await get<{deployment: State}>(context, endpoint);
      return post<{deployment: State; replayed: boolean}>(context, `${endpoint}/${action}`, {
        expectedRevision: deployment.revision, idempotencyKey: randomUUID(), reason, ...(releaseId ? {releaseId} : {}),
      });
    },
    async cleanup() {
      const {deployment} = await get<{deployment: State}>(owner, endpoint);
      if (deployment.activeReleaseId) await post(owner, `${endpoint}/disable`, {
        expectedRevision: deployment.revision, idempotencyKey: randomUUID(), reason: 'E2E cleanup',
      });
    },
  };
}

async function openPanel(owner: BrowserContext, fixture: Awaited<ReturnType<typeof prepare>>) {
  const admin = await owner.newPage();
  await admin.goto(apiUrl('/admin/'));
  await admin.locator('.list-item').filter({hasText: 'Northstar E2E'}).click();
  await admin.getByRole('button', {name: `${fixture.page.name} ${fixture.pathname}`, exact: true}).click();
  const panel = admin.getByRole('region', {name: 'На действующем сайте'});
  await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toBeEnabled();
  return {admin, panel};
}
async function choose(panel: Locator, release: Release, reason: string) {
  await panel.getByRole('combobox', {name: 'Версия для публикации'}).selectOption(release.id);
  await panel.getByRole('textbox', {name: 'Причина публикации'}).fill(reason);
}
async function active(panel: Locator, release: Release) {
  await expect(panel.locator('.deployment-current strong')).toHaveText(`Версия ${release.version} включена`);
  await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toBeEnabled();
}
async function title(page: Page, value: string) {
  await expect(page.locator('[data-lykar-id="pricing-title"]')).toHaveText(value);
}

test('Owner separately deploys, rolls back and disables; actor/reasons remain readable on mobile and keyboard', async ({newContext, browserName}, testInfo) => {
  test.setTimeout(60_000);
  const owner = await newContext();
  const fixture = await prepare(owner);
  try {
    const first = await fixture.publish('Admin first pricing');
    const second = await fixture.publish('Admin second pricing');
    expect((await fixture.state()).activeReleaseId).toBeNull();
    const visitor = await (await newContext()).newPage();
    await visitor.goto(fixture.visitorUrl);
    await title(visitor, nativeTitle);
    const {admin, panel} = await openPanel(owner, fixture);
    await admin.setViewportSize({width: 390, height: 844});
    await expect(panel.getByText('Не проверено.', {exact: true})).toBeVisible();
    await choose(panel, first, 'Первое включение с клавиатуры');
    const enable = panel.getByRole('button', {name: 'Включить версию', exact: true});
    const reason = panel.getByRole('textbox', {name: 'Причина публикации'});
    await reason.focus();
    // WebKit on macOS uses Option+Tab for full keyboard navigation by default.
    await admin.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    await expect(enable).toBeFocused();
    await admin.keyboard.press('Enter');
    await active(panel, first);
    await panel.screenshot({path: testInfo.outputPath('deployment-active-mobile.png')});
    await visitor.reload();
    await title(visitor, 'Admin first pricing');

    await choose(panel, second, 'Второе включение');
    await enable.click();
    await active(panel, second);
    await visitor.reload();
    await title(visitor, 'Admin second pricing');
    await admin.setViewportSize({width: 1440, height: 1000});
    await panel.screenshot({path: testInfo.outputPath('deployment-active-desktop.png')});
    await choose(panel, first, 'Возвращаем прежний тариф');
    await panel.getByRole('button', {name: 'Откатить на выбранную версию'}).click();
    await active(panel, first);
    await panel.screenshot({path: testInfo.outputPath('deployment-rollback-desktop.png')});
    await admin.setViewportSize({width: 390, height: 844});
    await visitor.reload();
    await title(visitor, 'Admin first pricing');
    await reason.fill('Отключаем изменения');
    await panel.getByRole('button', {name: 'Отключить правки'}).click();
    await expect(panel.locator('.deployment-current strong')).toHaveText('Правки отключены: исходная страница');
    await visitor.reload();
    await title(visitor, nativeTitle);

    const summary = panel.locator('.deployment-history summary');
    await summary.focus();
    await admin.keyboard.press('Enter');
    const rows = panel.locator('.deployment-history li');
    await expect(rows).toHaveCount(4);
    for (const text of ['Первое включение с клавиатуры', 'Второе включение', 'Возвращаем прежний тариф', 'Отключаем изменения']) {
      const row = rows.filter({hasText: text});
      await expect(row).toContainText(fixture.user.email);
    }
    expect((await fixture.history()).map(item => ({action: item.action, reason: item.reason, actor: item.actorUserId}))).toEqual([
      {action: 'disable', reason: 'Отключаем изменения', actor: fixture.user.id},
      {action: 'rollback', reason: 'Возвращаем прежний тариф', actor: fixture.user.id},
      {action: 'deploy', reason: 'Второе включение', actor: fixture.user.id},
      {action: 'deploy', reason: 'Первое включение с клавиатуры', actor: fixture.user.id},
    ]);
    await expect.poll(() => admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const screenshot = testInfo.outputPath('deployment-admin-mobile-390.png');
    await panel.screenshot({path: screenshot});
    await testInfo.attach('deployment-admin-mobile-390', {path: screenshot, contentType: 'image/png'});
  } finally { await fixture.cleanup(); }
});

test('real preview popup reports applicability; no report stays unchecked and missing target blocks deployment', async ({newContext}) => {
  test.setTimeout(60_000);
  const owner = await newContext();
  const fixture = await prepare(owner);
  try {
    const release = await fixture.publish('Preview checked pricing');
    const broken = await fixture.publish('Missing target', '#deployment-admin-target-does-not-exist');
    const {panel} = await openPanel(owner, fixture);
    await choose(panel, release, 'После проверки');
    // Load the genuine host HTML without booting SDK for one popup. Closing it
    // exercises the missing-report path without a synthetic postMessage report.
    await owner.route('**/playground.js', route => route.fulfill({status: 200, contentType: 'application/javascript', body: ''}), {times: 1});
    const uncheckedPopup = owner.waitForEvent('page');
    await panel.getByRole('button', {name: 'Проверить на сайте'}).click();
    const unchecked = await uncheckedPopup;
    await title(unchecked, nativeTitle);
    await unchecked.close();
    await expect(panel.getByRole('alert')).toContainText('Версия не проверена');
    await expect(panel.getByText('Не проверено.', {exact: true})).toBeVisible();

    const checkedPopup = owner.waitForEvent('page');
    await panel.getByRole('button', {name: 'Проверить на сайте'}).click();
    const checked = await checkedPopup;
    await title(checked, 'Preview checked pricing');
    await expect(panel.getByText('Проверено в предпросмотре', {exact: true})).toBeVisible();
    await expect(panel.locator('.deployment-operations')).toContainText('Применено');
    await expect(panel.getByRole('button', {name: 'Включить версию', exact: true})).toBeEnabled();
    expect((await fixture.state()).activeReleaseId).toBeNull();
    await checked.close();

    await choose(panel, broken, 'Не включать отсутствующий элемент');
    const brokenPopup = owner.waitForEvent('page');
    await panel.getByRole('button', {name: 'Проверить на сайте'}).click();
    const preview = await brokenPopup;
    await expect(panel.getByText('Есть неприменимые правки', {exact: true})).toBeVisible({timeout: 20_000});
    await expect(panel.locator('.deployment-operations')).toContainText(/Пропущено|Ошибка/);
    await expect(panel.getByRole('button', {name: 'Включить версию', exact: true})).toBeDisabled();
    await expect(panel.getByRole('button', {name: 'Откатить на выбранную версию'})).toBeDisabled();
    await expect(panel.getByRole('button', {name: 'Исправить в новом черновике'})).toBeEnabled();
    expect((await fixture.history())).toHaveLength(0);
    await preview.close();
  } finally { await fixture.cleanup(); }
});

test('a real second Owner revision conflict refreshes state and preserves the chosen release and reason', async ({newContext}) => {
  const owner = await newContext();
  const secondOwner = await newContext();
  await post(secondOwner, '/api/auth/dev-login');
  const fixture = await prepare(owner);
  try {
    const chosen = await fixture.publish('Chosen pricing');
    const concurrent = await fixture.publish('Concurrent pricing');
    const {admin, panel} = await openPanel(owner, fixture);
    const reason = 'Мой выбор после другого окна';
    await choose(panel, chosen, reason);
    await fixture.change(secondOwner, 'deploy', 'Включено другим окном', concurrent.id);
    const commands: Command[] = [];
    admin.on('request', request => {
      if (request.method() === 'POST' && request.url() === apiUrl(`${fixture.endpoint}/deploy`)) commands.push(request.postDataJSON() as Command);
    });
    const conflict = admin.waitForResponse(response => response.url() === apiUrl(`${fixture.endpoint}/deploy`) && response.status() === 409);
    await panel.getByRole('button', {name: 'Включить версию', exact: true}).click();
    await conflict;
    await expect(panel.getByRole('alert')).toContainText('Выбор версии и причина сохранены');
    await active(panel, concurrent);
    await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toHaveValue(chosen.id);
    await expect(panel.getByRole('textbox', {name: 'Причина публикации'})).toHaveValue(reason);
    expect((await fixture.history())).toHaveLength(1);
    await panel.getByRole('button', {name: 'Включить версию', exact: true}).click();
    await active(panel, chosen);
    expect(commands).toHaveLength(2);
    expect(commands.map(command => command.expectedRevision)).toEqual([0, 1]);
    expect(commands[0].idempotencyKey).not.toBe(commands[1].idempotencyKey);
    expect((await fixture.history()).map(item => item.reason)).toEqual([reason, 'Включено другим окном']);
  } finally { await fixture.cleanup(); }
});

test('a committed command with lost response retries the identical key and adds one history entry', async ({newContext}) => {
  const owner = await newContext();
  const fixture = await prepare(owner);
  try {
    const release = await fixture.publish('Idempotent pricing');
    const {admin, panel} = await openPanel(owner, fixture);
    const reason = 'Не дублировать после потери ответа';
    await choose(panel, release, reason);
    const endpoint = apiUrl(`${fixture.endpoint}/deploy`);
    const commands: Command[] = [];
    admin.on('request', request => {
      if (request.method() === 'POST' && request.url() === endpoint) commands.push(request.postDataJSON() as Command);
    });
    await admin.route(endpoint, async route => {
      const committed = await route.fetch();
      expect(committed.ok(), await committed.text()).toBe(true);
      expect((await committed.json()).replayed).toBe(false);
      await route.fulfill({status: 503, headers: {'content-type': 'application/json',
        'x-lykar-e2e-fault': 'deployment-response-lost-once'},
      body: JSON.stringify({error: {message: 'Injected response loss after committed deployment'}})});
    }, {times: 1});
    await panel.getByRole('button', {name: 'Включить версию', exact: true}).click();
    await expect(panel.getByRole('alert')).toContainText('Ответ команды не подтверждён');
    await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toHaveValue(release.id);
    await expect(panel.getByRole('textbox', {name: 'Причина публикации'})).toHaveValue(reason);
    await expect(panel.getByRole('combobox', {name: 'Версия для публикации'})).toBeDisabled();
    expect(await fixture.state()).toMatchObject({revision: 1, activeReleaseId: release.id});
    expect((await fixture.history())).toHaveLength(1);

    const replayResponse = admin.waitForResponse(response => response.url() === endpoint && response.status() === 200);
    await panel.getByRole('button', {name: 'Повторить ту же команду'}).click();
    expect((await (await replayResponse).json()).replayed).toBe(true);
    await expect(panel.getByText('Эта команда уже была выполнена. Ниже — актуальное состояние сайта.', {exact: true})).toBeVisible();
    await active(panel, release);
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(await fixture.state()).toMatchObject({revision: 1, activeReleaseId: release.id});
    expect((await fixture.history()).map(item => item.reason)).toEqual([reason]);
    await panel.locator('.deployment-history summary').click();
    await expect(panel.locator('.deployment-history li')).toHaveCount(1);
  } finally { await fixture.cleanup(); }
});
