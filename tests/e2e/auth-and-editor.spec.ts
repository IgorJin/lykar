import { expect, test, required } from './fixtures';
import { readFile } from 'node:fs/promises';

test('local owner login survives reload and opens the editor from the Admin click', async ({ newContext }) => {
  const context = await newContext();
  const admin = await context.newPage();
  await admin.goto(`${required('LYKAR_E2E_API_BASE_URL')}/admin`);
  await admin.getByRole('button', { name: 'Войти как локальный владелец' }).click();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  await expect(admin.getByText('owner@lykar.local')).toBeVisible();
  await admin.reload();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();

  // Let transient user activation expire before the real API response arrives.
  await admin.route('**/editor-launch', async route => {
    await new Promise(resolve => setTimeout(resolve, 6_000));
    await route.continue();
  });
  const popupPromise = context.waitForEvent('page');
  await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  const editor = await popupPromise;
  await editor.waitForLoadState('domcontentloaded');
  const panel = editor.locator('[data-lykar-editor-root="panel"]');
  await expect(panel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  await expect(panel.locator('[data-field="status"]')).toContainText('Изменения показываются локально');
});

test('magic link signs in without dev auth and cannot be reused', async ({ newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  const magicApiBaseUrl = required('LYKAR_E2E_MAGIC_API_BASE_URL');
  await page.goto(`${magicApiBaseUrl}/admin/`);
  await expect(page.getByRole('button', { name: 'Войти как локальный владелец' })).toHaveCount(0);
  await page.getByPlaceholder('you@example.com').fill('owner@lykar.local');
  await page.getByRole('button', { name: 'Получить ссылку' }).click();
  await expect(page.getByText('Ссылка создана')).toBeVisible();

  const magicUrl = await waitForMagicLink(required('LYKAR_E2E_MAGIC_LINK_FILE'), 'owner@lykar.local');
  await page.goto(magicUrl);
  await expect(page.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  const reused = await context.request.get(magicUrl, { maxRedirects: 0 });
  expect(reused.status()).toBe(401);
});

test('playground without editor capability exposes a working Admin button', async ({ newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}/`);
  const adminButton = page.getByRole('link', { name: 'Открыть админку' });
  await expect(adminButton).toBeVisible();
  const adminPromise = context.waitForEvent('page');
  await adminButton.click();
  const admin = await adminPromise;
  await admin.waitForLoadState('domcontentloaded');
  await expect(admin.getByRole('heading', { name: 'Lykar Admin' })).toBeVisible();
  await admin.goto(`${required('LYKAR_E2E_API_BASE_URL')}/admin/`);
  await expect(admin.getByRole('heading', { name: 'Lykar Admin' })).toBeVisible();
});

async function waitForMagicLink(file: string, email: string): Promise<string> {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    try {
      const records = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const match = records.findLast(record => record.email === email);
      if (match?.url) return match.url;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Magic link for ${email} was not written within 7 seconds`);
}
