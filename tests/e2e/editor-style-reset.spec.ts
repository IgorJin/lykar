import type {BrowserContext} from '@playwright/test';
import {expect, test, required} from './fixtures.js';

async function launch(context: BrowserContext, react: boolean): Promise<string> {
  const api = required('LYKAR_E2E_API_BASE_URL');
  expect((await context.request.post(`${api}/api/auth/dev-login`, {data: {}})).ok()).toBe(true);
  const project = (await (await context.request.get(`${api}/api/admin/projects`)).json()).projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  const page = react
    ? (await (await context.request.post(`${api}/api/admin/projects/${project.id}/pages`, {
      data: {name: 'React style reset', pathname: `/__e2e__/s4-react-csr-a-reset-${Date.now()}`},
    })).json()).page
    : (await (await context.request.get(`${api}/api/admin/projects/${project.id}/pages`)).json()).pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  const draft = (await (await context.request.post(`${api}/api/admin/pages/${page.id}/drafts`, {data: {}})).json()).draft;
  return (await (await context.request.post(`${api}/api/admin/pages/${page.id}/editor-launch`, {data: {draftId: draft.id}})).json()).launchUrl;
}

for (const react of [false, true]) {
  test(`${react ? 'React' : 'native'}: priority toggles and reset cancel pending field edits instead of accumulating writes`, async ({newContext}) => {
    const context = await newContext();
    if (!react) await context.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector<HTMLElement>('[data-lykar-id="pricing-title"]');
        if (!element) return;
        element.style.fontSize = '14px'; observer.disconnect();
      });
      observer.observe(document, {childList: true, subtree: true});
    });
    const page = await context.newPage();
    await page.setViewportSize({width: 1440, height: 960});
    await page.goto(await launch(context, react));
    const panel = page.locator('[data-lykar-editor-root="panel"]');
    await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
    if (react) await expect.poll(() => page.evaluate(() => {
      const roots = (window as unknown as Record<symbol, Map<Element, {phase: string}>>)[Symbol.for('@lykar/framework-roots/v1')];
      return roots?.get(document.getElementById('framework-root')!)?.phase;
    })).toBe('ready');
    const element = page.locator(react ? '#editable-copy' : '[data-lykar-id="pricing-title"]');
    const initialSize = await element.evaluate(target => getComputedStyle(target).fontSize);
    await element.click();
    await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('font-size');
    const row = panel.locator('[data-field="font-size"]');
    const priority = row.getByRole('checkbox', {name: 'Font Size: !important', exact: true});
    const value = row.getByRole('textbox', {name: 'Font Size', exact: true});
    const reset = row.getByRole('button', {name: 'Вернуть исходный Font Size', exact: true});
    const trash = row.getByRole('button', {name: 'Удалить правку Font Size', exact: true});
    const pending = panel.locator('[data-field="pending-count"]');
    for (let index = 0; index < 4; index++) {
      await priority.check(); await expect(pending).toHaveText('1');
      await priority.uncheck(); await expect(pending).toHaveText('0');
      await expect(element).toHaveCSS('font-size', initialSize);
      await expect(trash).toBeDisabled();
    }
    await value.fill('15px'); await value.press('Enter');
    await expect(element).toHaveCSS('font-size', '15px'); await expect(pending).toHaveText('1');
    await priority.check(); await expect(pending).toHaveText('1');
    await priority.uncheck(); await expect(pending).toHaveText('1');
    await reset.click();
    await expect(element).toHaveCSS('font-size', initialSize); await expect(pending).toHaveText('0');
    await expect(reset).toBeDisabled(); await expect(trash).toBeDisabled();
    await expect(panel.locator('[data-action="apply"]')).toBeDisabled();
    await panel.locator('[data-action="undo"]').click();
    await expect(element).toHaveCSS('font-size', '15px'); await expect(pending).toHaveText('1');
    await panel.locator('[data-action="redo"]').click();
    await expect(element).toHaveCSS('font-size', initialSize); await expect(pending).toHaveText('0');
    // Queue a reset immediately after the field's change event, before preview finishes.
    await value.evaluate(input => {
      (input as HTMLInputElement).focus(); (input as HTMLInputElement).value = '19px';
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await reset.evaluate(button => { (button as HTMLButtonElement).disabled = false; (button as HTMLButtonElement).click(); });
    await expect(element).toHaveCSS('font-size', initialSize); await expect(pending).toHaveText('0');
    await value.blur();
    await page.reload();
    await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
    await expect(pending).toHaveText('0');
    await expect(element).toHaveCSS('font-size', initialSize);
  });
}
