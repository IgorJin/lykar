import { randomUUID } from 'node:crypto';

import { expect, test, required } from './fixtures';

test('late Page creation cannot replace the currently selected project', async ({ newContext }) => {
  const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  const owner = await newContext();
  const admin = await owner.newPage();
  await admin.goto(`${apiBaseUrl}/admin/`);
  await admin.getByRole('button', { name: 'Войти как локальный владелец' }).click();
  await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();

  const projectsResponse = await owner.request.get(`${apiBaseUrl}/api/admin/projects`);
  const projects = (await projectsResponse.json() as { projects: Array<{ id: string; name: string }> }).projects;
  const first = projects.find(item => item.name === 'Northstar E2E');
  expect(first).toBeTruthy();

  const suffix = randomUUID();
  const secondName = `S3 switch ${suffix}`;
  const secondResponse = await owner.request.post(`${apiBaseUrl}/api/admin/projects`, {
    data: { name: secondName, origins: [`https://s3-${suffix}.example.test`] },
  });
  expect(secondResponse.status()).toBe(201);
  await admin.reload();
  await admin.locator('.list-item').filter({ hasText: 'Northstar E2E' }).click();
  await expect(admin.getByPlaceholder('Новая страница')).toBeVisible();

  let releasePost!: () => void;
  const postGate = new Promise<void>(resolve => { releasePost = resolve; });
  let postIntercepted!: () => void;
  const intercepted = new Promise<void>(resolve => { postIntercepted = resolve; });
  await admin.route(`${apiBaseUrl}/api/admin/projects/${first!.id}/pages`, async route => {
    if (route.request().method() === 'POST') {
      postIntercepted();
      await postGate;
    }
    await route.continue();
  });

  await admin.getByPlaceholder('Новая страница').fill('Late page');
  await admin.getByPlaceholder('/pricing').fill(`/__e2e__/s3-late-${suffix}`);
  const created = admin.waitForResponse(response => response.request().method() === 'POST'
    && response.url().endsWith(`/api/admin/projects/${first!.id}/pages`));
  await admin.getByRole('button', { name: 'Добавить' }).click();
  await intercepted;
  await admin.locator('.list-item').filter({ hasText: secondName }).click();
  await expect(admin.getByRole('heading', { name: secondName })).toBeVisible();

  releasePost();
  expect((await created).status()).toBe(201);
  await admin.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(admin.getByRole('heading', { name: secondName })).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Home /' })).toBeVisible();
  await expect(admin.getByRole('button', { name: new RegExp(`Late page /__e2e__/s3-late-${suffix}`) })).toHaveCount(0);
  await expect(admin.getByText('Загружаем страницы и доступ…')).toHaveCount(0);
});
