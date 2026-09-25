import { expect, test, required } from './fixtures';

const EDITED_TEXT = 'Интерфейс сохранён через Lykar S0';
const ORIGINAL_TEXT = 'Редактируйте интерфейс, а не исходный код';

test('edit → save → reload → reopen → release → share keeps page scopes isolated', async ({ newContext }) => {
  const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  const playgroundBaseUrl = required('LYKAR_E2E_PLAYGROUND_BASE_URL');
  const owner = await newContext();
  const visitor = await newContext();
  const nativeVisitor = await newContext();
  const admin = await owner.newPage();
  await admin.goto(`${apiBaseUrl}/admin/`);
  await admin.getByRole('button', { name: 'Войти как локальный владелец' }).click();
  await admin.locator('.list-item').filter({ hasText: 'Northstar E2E' }).click();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();

  const firstPopup = owner.waitForEvent('page');
  await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  const editor = await firstPopup;
  const panel = editor.locator('[data-lykar-editor-root="panel"]');
  await expect(panel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  await expect(panel.locator('[data-field="status"]')).toContainText('Изменения показываются локально');
  const hero = editor.locator('[data-lykar-id="hero-title"]');
  await hero.click();
  const textField = panel.locator('[data-field="text"]');
  await textField.fill(EDITED_TEXT);
  await expect(hero).toHaveText(EDITED_TEXT);
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд: 1, revision: 1');
  await expect(editor.locator('#draft-output')).toContainText('"revision": 1');

  await editor.reload();
  await expect(panel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  await expect(hero).toHaveText(EDITED_TEXT);
  await expect(panel.locator('[data-field="status"]')).toContainText('Восстановлено команд: 1');

  // A second unsaved edit must survive replay of the first saved operation.
  await hero.click();
  await textField.fill('Pending after saved draft');
  await expect(hero).toHaveText('Pending after saved draft');
  await editor.reload();
  await expect(hero).toHaveText('Pending after saved draft');
  await expect(panel.locator('[data-action="apply"]')).toHaveText('Применить (1)');
  await panel.locator('[data-action="undo"]').click();
  await expect(hero).toHaveText(EDITED_TEXT);
  await expect(panel.locator('[data-action="apply"]')).toBeDisabled();

  await admin.reload();
  await admin.locator('.list-item').filter({ hasText: 'Northstar E2E' }).click();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  const secondPopup = owner.waitForEvent('page');
  await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  const reopened = await secondPopup;
  const reopenedPanel = reopened.locator('[data-lykar-editor-root="panel"]');
  await expect(reopenedPanel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  await expect(reopened.locator('[data-lykar-id="hero-title"]')).toHaveText(EDITED_TEXT);
  await expect(reopenedPanel.locator('[data-field="status"]')).toContainText('Восстановлено команд: 1');
  await reopened.close();

  await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  await expect(admin.getByText('Version 1', { exact: true })).toBeVisible();
  await expect(admin.getByText('1 команд')).toBeVisible();

  let shareUrl = '';
  await admin.getByRole('button', { name: 'Share' }).click();
  const shareUrlField = admin.getByRole('textbox', { name: 'Share URL' });
  await expect(shareUrlField).toBeVisible();
  shareUrl = await shareUrlField.inputValue();
  await expect.poll(() => shareUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/share\//);

  const shared = await visitor.newPage();
  await shared.goto(shareUrl);
  await expect(shared.locator('[data-lykar-id="hero-title"]')).toHaveText(EDITED_TEXT);
  await expect(shared.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  await expect(shared.locator('body')).toHaveAttribute('data-lykar-mode', 'share');

  // Share in the previous editor tab must override its cached editor capability.
  await editor.goto(shareUrl);
  await expect(hero).toHaveText(EDITED_TEXT);
  await expect(panel).toHaveCount(0);
  await expect(editor.locator('body')).toHaveAttribute('data-lykar-mode', 'share');

  const nativeHome = await nativeVisitor.newPage();
  await nativeHome.goto(`${playgroundBaseUrl}/`);
  await expect(nativeHome.locator('[data-lykar-id="hero-title"]')).toHaveText(ORIGINAL_TEXT);
  await expect(nativeHome.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  const pricing = await nativeVisitor.newPage();
  await pricing.goto(`${playgroundBaseUrl}/pricing`);
  await expect(pricing.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
  await expect(pricing.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
});
