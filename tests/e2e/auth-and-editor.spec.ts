import { expect, test, required } from './fixtures';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

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
  await expect(page.getByText('Проверьте почту.', { exact: false })).toBeVisible();

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

for (const mobile of [false, true]) {
  test(`new independent customer signs up, resends, creates a site and logs out (${mobile ? 'mobile' : 'desktop'})`, async ({ newContext }, testInfo) => {
    const base = required('LYKAR_E2E_MAGIC_API_BASE_URL');
    const context = await newContext();
    const page = await context.newPage();
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 });
    const email = `signup-${randomUUID()}@example.com`;
    await page.goto(`${base}/admin/`);
    await expect(page.getByRole('button', { name: 'Войти как локальный владелец' })).toHaveCount(0);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Email', { exact: true }).press('Enter');
    await expect(page.getByRole('status')).toContainText('Проверьте почту');
    const firstUrl = await waitForMagicLink(required('LYKAR_E2E_MAGIC_LINK_FILE'), email);
    await page.getByRole('button', { name: 'Отправить повторно' }).click();
    await expect(page.getByRole('status')).toContainText('Проверьте почту');
    let resentUrl = '';
    await expect.poll(async () => {
      resentUrl = await waitForMagicLink(required('LYKAR_E2E_MAGIC_LINK_FILE'), email);
      return resentUrl !== firstUrl;
    }).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`signup-email-${mobile ? 'mobile' : 'desktop'}.png`) });
    await page.goto(resentUrl);
    await expect(page.getByText('Сайтов пока нет.', { exact: true })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`signup-empty-${mobile ? 'mobile' : 'desktop'}.png`) });
    await page.getByPlaceholder('Название', { exact: true }).fill('Мой независимый сайт');
    await page.getByPlaceholder('https://example.com', { exact: true }).fill(`https://signup-${randomUUID()}.example.com`);
    await page.getByRole('button', { name: 'Создать', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Мой независимый сайт', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Мой независимый сайт', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const other = await newContext();
    const otherPage = await other.newPage();
    const otherEmail = `other-${randomUUID()}@example.com`;
    await otherPage.goto(`${base}/admin/`);
    await otherPage.getByLabel('Email', { exact: true }).fill(otherEmail);
    await otherPage.getByRole('button', { name: 'Получить ссылку' }).click();
    await expect(otherPage.getByRole('status')).toContainText('Проверьте почту');
    await otherPage.goto(await waitForMagicLink(required('LYKAR_E2E_MAGIC_LINK_FILE'), otherEmail));
    await expect(otherPage.getByText('Сайтов пока нет.', { exact: true })).toBeVisible();
    await expect(otherPage.getByText('Мой независимый сайт', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Получить ссылку' })).toBeVisible();
    expect((await context.request.get(`${base}/api/admin/projects`)).status()).toBe(401);
    await page.goto(resentUrl);
    await expect(page.getByRole('alert')).toContainText('Ссылка недействительна');
    expect(new URL(page.url()).searchParams.has('token')).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`signup-expired-${mobile ? 'mobile' : 'desktop'}.png`) });
    await page.getByLabel('Email', { exact: true }).fill(email);
    const finalRequest = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/magic-link');
    await page.getByRole('button', { name: 'Получить ссылку' }).click();
    const finalResponse = await finalRequest;
    if (finalResponse.status() === 429) {
      // Reload clears the client timer, but the shared server cooldown still applies.
      expect(finalResponse.headers()['retry-after']).toBe('1');
      expect((await finalResponse.json()).error.code).toBe('EMAIL_RATE_LIMITED');
      await expect(page.getByRole('alert')).toContainText('Повторите через');
      await page.getByRole('button', { name: 'Получить ссылку' }).click();
    } else expect(finalResponse.status()).toBe(202);
    await expect(page.getByRole('status')).toContainText('Проверьте почту');
    await page.goto(await waitForMagicLink(required('LYKAR_E2E_MAGIC_LINK_FILE'), email));
    await expect(page.getByRole('heading', { name: 'Мой независимый сайт', exact: true })).toBeVisible();
  });
}

test('signup send failure preserves email and permits retry without reporting success', async ({ newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  const email = `failure-${randomUUID()}@example.com`;
  await page.goto(`${required('LYKAR_E2E_MAGIC_API_BASE_URL')}/admin/`);
  await page.route('**/api/auth/magic-link', async route => {
    await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'x-lykar-e2e-fault': 'signup-send-once' },
      body: JSON.stringify({ error: { code: 'EMAIL_UNAVAILABLE', message: 'Отправка временно недоступна. Попробуйте ещё раз.' } }) });
  }, { times: 1 });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Получить ссылку' }).click();
  await expect(page.getByRole('alert')).toContainText('Отправка временно недоступна');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByRole('button', { name: 'Получить ссылку' }).click();
  await expect(page.getByRole('status')).toContainText('Проверьте почту');
});

test('email request limit shows cooldown and allows another address', async ({ newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${required('LYKAR_E2E_MAGIC_API_BASE_URL')}/admin/`);
  await page.getByLabel('Email', { exact: true }).fill(`limit-${randomUUID()}@example.com`);
  await page.getByRole('button', { name: 'Получить ссылку' }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Отправить повторно' }).click();
    await expect(page.getByRole('status')).toContainText('Запрос на отправку ссылки принят');
  }
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/magic-link' && r.status() === 429);
  await page.getByRole('button', { name: 'Отправить повторно' }).click();
  const limited = await response;
  expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(3500);
  expect((await limited.json()).error.code).toBe('EMAIL_RATE_LIMITED');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /Повторить через/ })).toBeDisabled();
  await page.getByLabel('Email', { exact: true }).fill(`fresh-${randomUUID()}@example.com`);
  await page.getByRole('button', { name: 'Получить ссылку' }).click();
  await expect(page.getByRole('status')).toContainText('Запрос на отправку ссылки принят');
});
