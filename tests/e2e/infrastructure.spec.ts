import { expect, test, required } from './fixtures';

test('browser blocks a popup after transient user activation expires', async ({ newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  await page.setContent(`<button onclick="setTimeout(() => {
    const popup = window.open('about:blank');
    document.body.dataset.popup = popup ? 'opened' : 'blocked';
    popup?.close();
    console.log('popup-probe-complete');
  }, 6000)">Delayed popup</button>`);
  // Playwright's DOM polling evaluates with userGesture=true. Wait for an event
  // before inspecting the result so assertions cannot renew user activation.
  const completed = page.waitForEvent('console', message => message.text() === 'popup-probe-complete');
  await page.getByRole('button', { name: 'Delayed popup' }).click();
  await completed;
  await expect(page.locator('body')).toHaveAttribute('data-popup', 'blocked');
});

test('isolated stack exposes real services and clean owner/visitor contexts', async ({ newContext }) => {
  const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  const magicApiBaseUrl = required('LYKAR_E2E_MAGIC_API_BASE_URL');
  const playgroundBaseUrl = required('LYKAR_E2E_PLAYGROUND_BASE_URL');
  const owner = await newContext();
  const visitor = await newContext();
  const ownerPage = await owner.newPage();
  const visitorPage = await visitor.newPage();
  await ownerPage.goto(`${apiBaseUrl}/admin/`);
  await expect(ownerPage.getByRole('heading', { name: 'Lykar Admin' })).toBeVisible();
  await expect(ownerPage.getByRole('button', { name: 'Войти как локальный владелец' })).toBeVisible();
  await visitorPage.goto(`${playgroundBaseUrl}/`);
  await expect(visitorPage.locator('[data-lykar-id="hero-title"]')).toContainText('Редактируйте интерфейс');
  expect(await owner.cookies()).toEqual([]);
  expect(await visitor.cookies()).toEqual([]);
  expect(magicApiBaseUrl).not.toBe(apiBaseUrl);
});
