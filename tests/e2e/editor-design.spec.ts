import type {BrowserContext, Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

import {expect, test, required} from './fixtures';

async function createPricingLaunch(context: BrowserContext): Promise<string> {
  const api = required('LYKAR_E2E_API_BASE_URL');
  expect((await context.request.post(`${api}/api/auth/dev-login`, {data: {}})).ok()).toBe(true);
  const projectsResponse = await context.request.get(`${api}/api/admin/projects`);
  expect(projectsResponse.ok()).toBe(true);
  const project = (await projectsResponse.json()).projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  expect(project).toBeTruthy();
  const pagesResponse = await context.request.get(`${api}/api/admin/projects/${project.id}/pages`);
  expect(pagesResponse.ok()).toBe(true);
  const pricing = (await pagesResponse.json()).pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  expect(pricing).toBeTruthy();
  const draftResponse = await context.request.post(`${api}/api/admin/pages/${pricing.id}/drafts`, {data: {}});
  expect(draftResponse.ok()).toBe(true);
  const draft = (await draftResponse.json()).draft;
  const launchResponse = await context.request.post(`${api}/api/admin/pages/${pricing.id}/editor-launch`, {data: {draftId: draft.id}});
  expect(launchResponse.ok()).toBe(true);
  return (await launchResponse.json()).launchUrl;
}

async function openPricingEditor(context: BrowserContext): Promise<Page> {
  const launch = await createPricingLaunch(context);
  const page = await context.newPage();
  await page.setViewportSize({width: 1440, height: 960});
  await page.goto(launch);
  await expect(page.locator('[data-lykar-editor-root="panel"]').getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  return page;
}

async function pageWidths(page: Page) {
  return page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.clientWidth,
    main: document.querySelector('main')!.getBoundingClientRect().width,
    title: document.querySelector('[data-lykar-id="pricing-title"]')!.getBoundingClientRect().width,
  }));
}

test('single overlay panel preserves page width, keeps icon mode tabs and exits preview with Escape', async ({newContext}, testInfo) => {
  const context = await newContext();
  const launch = await createPricingLaunch(context);
  const baselinePage = await context.newPage();
  await baselinePage.setViewportSize({width: 1440, height: 960});
  await baselinePage.goto(`${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}/pricing`);
  await expect(baselinePage.locator('body')).toHaveAttribute('data-lykar-mode', 'native');
  const baseline = await pageWidths(baselinePage);
  await baselinePage.close();

  // Launch credentials live in the fragment; an existing /pricing document
  // would treat navigation to that URL as a hash change and skip SDK startup.
  const page = await context.newPage();
  await page.setViewportSize({width: 1440, height: 960});
  await page.goto(launch);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  await expect(panel.locator('.panel')).toHaveCount(1);
  expect(await pageWidths(page)).toEqual(baseline);

  const hero = page.locator('[data-lykar-id="pricing-title"]');
  const modes = [
    {name: 'Редактирование', value: 'edit'},
    {name: 'Добавление', value: 'add'},
    {name: 'История изменений', value: 'history'},
  ];
  const screenshotDirectory = resolve(process.env.LYKAR_EDITOR_SCREENSHOT_DIR ?? 'output/editor-design');
  await mkdir(screenshotDirectory, {recursive: true});
  await expect(panel.getByRole('tab')).toHaveCount(3);
  for (const mode of modes) {
    const tab = panel.getByRole('tab', {name: mode.name, exact: true});
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator(`[data-mode-view="${mode.value}"]`)).toBeVisible();
    // Icons are the visible labels; screen readers still receive the mode name.
    expect(await tab.evaluate(element => element.textContent?.trim())).toBe('');
    const activeSurface = await tab.evaluate(element => getComputedStyle(element).backgroundColor);
    const editorSurface = await panel.locator('.panel').evaluate(element => getComputedStyle(element).backgroundColor);
    expect(activeSurface).toBe(editorSurface);
    expect(await pageWidths(page)).toEqual(baseline);
    await hero.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await pageWidths(page)).toEqual(baseline);
    const screenshot = await page.screenshot({path: resolve(screenshotDirectory, `lykar-editor-${mode.value}.png`), fullPage: true});
    await testInfo.attach(`editor-${mode.value}`, {body: screenshot, contentType: 'image/png'});
  }

  await panel.getByRole('tab', {name: 'Редактирование', exact: true}).click();
  await panel.locator('[data-action="preview"]').click();
  await expect(panel.locator('.panel')).toHaveAttribute('data-preview', 'true');
  await expect(panel.locator('[data-field="text"]')).toBeHidden();
  expect(await pageWidths(page)).toEqual(baseline);
  await page.keyboard.press('Escape');
  await expect(panel.locator('.panel')).not.toHaveAttribute('data-preview', 'true');
  await expect(panel.locator('[data-field="text"]')).toBeVisible();
});

test('typography controls align and custom Select supports search, keyboard, raw values and computed units', async ({newContext}, testInfo) => {
  const context = await newContext();
  const page = await openPricingEditor(context);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  await hero.click();
  const typography = panel.locator('.style-section[data-section="typography"]');
  if (!(await typography.evaluate(element => (element as HTMLDetailsElement).open))) {
    await typography.locator('summary').click();
  }

  // A single outlined value control per field prevents the old select + raw
  // input stack from pushing one column below the other.
  await expect(panel.locator('select')).toHaveCount(0);
  for (const field of ['font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing', 'color', 'text-align']) {
    const row = typography.locator(`[data-field="${field}"]`);
    const control = row.locator('.style-field-value');
    await expect(control).toHaveCount(1);
    await expect(control).toHaveCSS('border-top-width', '1px');
    await expect(control).toHaveCSS('border-bottom-width', '1px');
    await expect(control.locator('input.style-field-input')).toHaveCSS('border-top-width', '0px');
    await expect(control.locator('input.style-field-input')).toHaveCSS('border-bottom-width', '0px');
  }
  for (const [left, right] of [['font-weight', 'font-size'], ['line-height', 'letter-spacing'], ['color', 'text-align']]) {
    const leftControl = await typography.locator(`[data-field="${left}"] .style-field-value`).boundingBox();
    const rightControl = await typography.locator(`[data-field="${right}"] .style-field-value`).boundingBox();
    expect(leftControl).not.toBeNull();
    expect(rightControl).not.toBeNull();
    expect(Math.abs(leftControl!.y - rightControl!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(leftControl!.height - rightControl!.height)).toBeLessThanOrEqual(1);
    expect(leftControl!.x).toBeLessThan(rightControl!.x);
  }

  const weight = panel.getByRole('textbox', {name: 'Font Weight', exact: true});
  const weightSelect = panel.getByRole('combobox', {name: 'Font Weight: варианты', exact: true});
  const popup = panel.locator('.lykar-select-popup');
  const optionSearch = panel.getByRole('searchbox', {name: 'Поиск: Font Weight: варианты', exact: true});
  const originalWeight = await hero.evaluate(element => getComputedStyle(element).fontWeight);
  await weightSelect.click();
  await expect(weightSelect).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('listbox', {name: 'Font Weight: варианты', exact: true})).toBeVisible();
  await optionSearch.fill('700');
  await expect(popup.locator('[role="option"][data-value="700"]')).toBeVisible();
  await optionSearch.press('Escape');
  await expect(popup).toBeHidden();
  await expect(weightSelect).toBeFocused();
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');
  await expect(hero).toHaveCSS('font-weight', originalWeight);

  await weightSelect.click();
  await expect(optionSearch).toBeFocused();
  await optionSearch.press('Tab');
  await expect(popup).toBeHidden();
  await expect(panel.getByRole('checkbox', {name: 'Font Size: !important', exact: true})).toBeFocused();
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');

  await weightSelect.click();
  await optionSearch.fill('700');
  await popup.locator('[role="option"][data-value="700"]').click();
  await expect(hero).toHaveCSS('font-weight', '700');
  await expect(weightSelect).toHaveAttribute('aria-expanded', 'false');
  await panel.locator('[data-action="undo"]').click();
  await expect(hero).toHaveCSS('font-weight', originalWeight);

  await weightSelect.focus();
  await weightSelect.press('ArrowDown');
  await optionSearch.fill('600');
  await optionSearch.press('ArrowDown');
  await optionSearch.press('Enter');
  await expect(hero).toHaveCSS('font-weight', '600');
  await weight.fill('650');
  await weight.press('Enter');
  await expect(hero).toHaveCSS('font-weight', '650');
  await expect(weight).toHaveValue('650');

  const fontSize = panel.getByRole('textbox', {name: 'Font Size', exact: true});
  const fontUnit = panel.getByRole('combobox', {name: 'Font Size: единица', exact: true});
  const computedFontSize = await hero.evaluate(element => getComputedStyle(element).fontSize);
  const fontScalar = String(parseFloat(computedFontSize));
  await expect(fontSize).toHaveValue('');
  await expect(fontSize).toHaveAttribute('placeholder', fontScalar);
  await expect(fontUnit).toHaveText('px');
  const priority = panel.getByRole('checkbox', {name: 'Font Size: !important', exact: true});
  await priority.check();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe(computedFontSize);
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('font-size'))).toBe('important');
  await expect(hero).toHaveCSS('font-size', computedFontSize);
  await panel.locator('[data-action="undo"]').click();
  await expect(priority).not.toBeChecked();
  await expect(fontSize).toHaveValue('');
  const beforeCancelledSize = await panel.locator('[data-field="pending-count"]').textContent();
  await fontSize.fill('2em');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe('2em');
  await expect(fontUnit).toHaveText('em');
  await fontSize.press('Escape');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe('');
  await expect(hero).toHaveCSS('font-size', computedFontSize);
  await expect(fontSize).toHaveValue('');
  await expect(fontSize).toHaveAttribute('placeholder', fontScalar);
  await expect(fontUnit).toHaveText('px');
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText(beforeCancelledSize!);
  await fontUnit.click();
  await popup.locator('[role="option"][data-value="rem"]').click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe(`${fontScalar}rem`);
  await expect(fontUnit).toHaveText('rem');
  await panel.locator('[data-action="undo"]').click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe('');
  await expect(fontUnit).toHaveText('px');

  const screenshotDirectory = resolve(process.env.LYKAR_EDITOR_SCREENSHOT_DIR ?? 'output/editor-design');
  await mkdir(screenshotDirectory, {recursive: true});
  await typography.scrollIntoViewIfNeeded();
  const aligned = await panel.locator('.panel').screenshot({path: resolve(screenshotDirectory, 'lykar-editor-typography.png')});
  await testInfo.attach('aligned-typography', {body: aligned, contentType: 'image/png'});

  // The popup lives outside the scrolling body. Check its hit targets, rather
  // than only its bounding box, so an overflow-clipped menu fails the test.
  const alignment = panel.getByRole('combobox', {name: 'Text Align: варианты', exact: true});
  await alignment.scrollIntoViewIfNeeded();
  const scrollBefore = await panel.locator('.body').evaluate(element => element.scrollTop);
  await alignment.click();
  await expect(popup).toBeVisible();
  expect(await panel.locator('.body').evaluate(element => element.scrollTop)).toBe(scrollBefore);
  expect(await popup.evaluate(element => Boolean(element.closest('.body')))).toBe(false);
  const menuBounds = await popup.boundingBox();
  expect(menuBounds).not.toBeNull();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(1440);
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(960);
  const center = popup.locator('[role="option"][data-value="center"]');
  await expect(center).toBeVisible();
  expect(await center.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const root = element.getRootNode() as ShadowRoot;
    return element.contains(root.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
  })).toBe(true);
  const screenshot = await page.screenshot({path: resolve(screenshotDirectory, 'lykar-editor-select.png')});
  await testInfo.attach('editor-select-popup', {body: screenshot, contentType: 'image/png'});
  await center.click();
  await expect(hero).toHaveCSS('text-align', 'center');
});

test('style trash preserves host inline CSS and ownership through undo, redo, save and reload', async ({newContext}) => {
  const context = await newContext();
  // Seed native inline CSS while the document is parsed, before the SDK starts,
  // on every navigation. Keeping the real document response avoids Chromium's
  // loopback-access restriction for route-fulfilled navigation responses.
  await context.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const hero = document.querySelector<HTMLElement>('[data-lykar-id="pricing-title"]');
      if (!hero) return;
      hero.style.setProperty('font-size', '14px', 'important');
      observer.disconnect();
    });
    observer.observe(document, {childList: true, subtree: true});
  });
  const page = await openPricingEditor(context);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  const size = panel.getByRole('textbox', {name: 'Font Size', exact: true});
  const trash = panel.getByRole('button', {name: 'Удалить правку Font Size', exact: true});
  const selectSize = async () => {
    await hero.click();
    await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('font-size');
  };
  const expectFont = async (value: string, owned: boolean) => {
    await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe(value);
    await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('font-size'))).toBe('important');
    if (owned) await expect(trash).toBeEnabled();
    else await expect(trash).toBeDisabled();
  };
  const saveAndReload = async () => {
    await panel.locator('[data-action="apply"]').click();
    await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд');
    await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');
    await page.reload();
    await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
    await selectSize();
  };

  await selectSize();
  await expectFont('14px', false);
  await expect(size).toHaveValue('14');
  await size.fill('15px');
  await size.press('Enter');
  await expectFont('15px', true);
  await trash.click();
  await expectFont('14px', false);
  await panel.locator('[data-action="undo"]').click();
  await expectFont('15px', true);
  await panel.locator('[data-action="redo"]').click();
  await expectFont('14px', false);
  await panel.locator('[data-action="undo"]').click();
  await expectFont('15px', true);
  await saveAndReload();
  await expectFont('15px', true);
  await trash.click();
  await expectFont('14px', false);
  await saveAndReload();
  await expectFont('14px', false);

  // Chromium emits the real CSSOM attribute mutation when only !important
  // changes; the observer must update ownership without another selection.
  await size.fill('15px');
  await size.press('Enter');
  await expectFont('15px', true);
  const beforeHostHistory = await panel.locator('[data-field="history-count"]').textContent();
  const beforeHostPending = await panel.locator('[data-field="pending-count"]').textContent();
  await hero.evaluate(element => (element as HTMLElement).style.setProperty('font-size', '15px', ''));
  await expect(trash).toBeDisabled();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.fontSize)).toBe('15px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('font-size'))).toBe('');
  await expect(panel.locator('[data-field="history-count"]')).toHaveText(beforeHostHistory!);
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText(beforeHostPending!);
});

test('click-to-place inserts one button, prevents native host clicks, supports history and save/reload', async ({newContext}) => {
  const context = await newContext();
  const page = await openPricingEditor(context);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  const inserted = page.locator('body [data-lykar-operation-id]');
  await hero.evaluate(element => {
    element.setAttribute('data-native-clicks', '0');
    element.addEventListener('click', () => element.setAttribute('data-native-clicks', String(Number(element.getAttribute('data-native-clicks')) + 1)));
  });

  await panel.getByRole('tab', {name: 'Добавление', exact: true}).click();
  await panel.getByRole('combobox', {name: 'Позиция вставки', exact: true}).click();
  await panel.getByRole('option', {name: 'После элемента', exact: true}).click();
  await panel.locator('[data-insert-template="button"]').click();
  await page.keyboard.press('Escape');
  await hero.click();
  await expect(inserted).toHaveCount(0);
  await panel.locator('[data-insert-template="button"]').click();
  await hero.click();
  await expect(inserted).toHaveCount(1);
  expect(await inserted.evaluate(element => element.tagName)).toBe('BUTTON');
  expect(await inserted.evaluate(element => element.previousElementSibling?.getAttribute('data-lykar-id'))).toBe('pricing-title');
  await expect(hero).toHaveAttribute('data-native-clicks', '0');
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('1');
  await expect(panel.getByRole('tab', {name: 'Добавление', exact: true})).toHaveAttribute('aria-selected', 'true');

  await panel.getByRole('tab', {name: 'История изменений', exact: true}).click();
  const change = panel.locator('[data-view="change-tree"] [data-operation-id]');
  await expect(change).toHaveCount(1);
  await expect(change.locator('.change-summary')).toContainText('Добавлен <button>');
  await expect(change.locator('.change-status')).toHaveText('Локально');
  await change.locator('.change-details summary').click();
  await expect(change).toContainText('insertNode');
  await expect(change).toContainText('applied');
  await panel.locator('[data-action="undo"]').click();
  await expect(inserted).toHaveCount(0);
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');
  await expect(panel.locator('[data-field="selection-path"]')).toHaveText('Выберите элемент на странице');
  await expect(panel.locator('[data-action="apply"]')).toBeDisabled();
  await panel.locator('[data-action="redo"]').click();
  await expect(inserted).toHaveCount(1);
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('1');
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд: 1');
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');
  await page.reload();
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  await expect(inserted).toHaveCount(1);
  expect(await inserted.evaluate(element => element.tagName)).toBe('BUTTON');
});

test('real pointer drag shows insertion guide and creates an undoable operation on a zoomed page', async ({newContext}) => {
  const context = await newContext();
  const page = await openPricingEditor(context);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  await page.evaluate(() => { document.body.style.zoom = '125%'; });
  await panel.getByRole('tab', {name: 'Добавление', exact: true}).click();
  const template = panel.locator('[data-insert-template="text"]');
  const source = await template.boundingBox();
  const destination = await hero.boundingBox();
  expect(source).not.toBeNull();
  expect(destination).not.toBeNull();
  const x = destination!.x + Math.min(destination!.width / 2, 300);
  const y = destination!.y + destination!.height - 4;
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, {steps: 15});
  const guide = page.locator('[data-lykar-editor-root="overlay"] [data-drop-guide]');
  await expect(guide).toBeVisible();
  await page.mouse.up();

  const inserted = page.locator('body [data-lykar-operation-id]');
  await expect(inserted).toHaveCount(1);
  expect(await inserted.evaluate(element => element.tagName)).toBe('P');
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('1');
  await expect(guide).toBeHidden();
  await panel.locator('[data-action="undo"]').click();
  await expect(inserted).toHaveCount(0);
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');
  await expect(panel.locator('[data-field="insert-selection"]')).toHaveText('Место выбирается на странице');
});

test('panel header drag moves tabs together, clamps to the viewport and supports cancellation, keyboard and preview', async ({newContext}) => {
  const context = await newContext();
  const page = await openPricingEditor(context);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const surface = panel.locator('.panel');
  const handle = panel.locator('[data-panel-drag-handle]');
  const move = panel.getByRole('button', {name: 'Переместить панель редактора', exact: true});
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  const originalText = await hero.textContent();
  const baseline = await pageWidths(page);
  await expect(panel.locator('[data-field="page-name"]')).toHaveText(/\S/);
  await expect(panel.locator('[data-field="page-name"]')).not.toHaveText(/^\/(?:pricing)?$/);
  await expect(panel.locator('header').getByText('/', {exact: true})).toHaveCount(0);

  const startDrag = async () => {
    const bounds = await handle.boundingBox();
    expect(bounds).not.toBeNull();
    const origin = {x: bounds!.x + Math.min(24, bounds!.width / 4), y: bounds!.y + bounds!.height / 2};
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    return origin;
  };
  const expectChromeInsideViewport = async () => {
    await expect.poll(() => surface.evaluate(element => {
      const nodes = [element, ...Array.from(element.querySelectorAll('[role="tab"]'))];
      return nodes.every(node => {
        const rect = node.getBoundingClientRect();
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
      });
    })).toBe(true);
  };
  const expectNoPageChanges = async () => {
    await expect(panel.locator('[data-field="pending-count"]')).toHaveText('0');
    await expect(hero).toHaveText(originalText!);
    await expect(page.locator('body [data-lykar-operation-id]')).toHaveCount(0);
  };

  const initial = await surface.boundingBox();
  const initialTab = await panel.getByRole('tab', {name: 'Редактирование', exact: true}).boundingBox();
  expect(initial).not.toBeNull();
  expect(initialTab).not.toBeNull();
  const origin = await startDrag();
  await page.mouse.move(origin.x - 400, origin.y + 100, {steps: 12});
  await page.mouse.up();
  const moved = await surface.boundingBox();
  const movedTab = await panel.getByRole('tab', {name: 'Редактирование', exact: true}).boundingBox();
  expect(moved).not.toBeNull();
  expect(movedTab).not.toBeNull();
  expect(moved!.x).toBeCloseTo(initial!.x - 400, 0);
  expect(moved!.y).toBeCloseTo(initial!.y + 100, 0);
  expect(movedTab!.x - initialTab!.x).toBeCloseTo(moved!.x - initial!.x, 0);
  expect(movedTab!.y - initialTab!.y).toBeCloseTo(moved!.y - initial!.y, 0);
  expect(await pageWidths(page)).toEqual(baseline);
  await expectNoPageChanges();

  // Extreme drags keep both the panel and the protruding icon tabs reachable.
  await startDrag();
  await page.mouse.move(1, 1, {steps: 12});
  await page.mouse.up();
  await expectChromeInsideViewport();
  await startDrag();
  await page.mouse.move(1439, 959, {steps: 12});
  await page.mouse.up();
  await expectChromeInsideViewport();
  expect(await pageWidths(page)).toEqual(baseline);
  await expectNoPageChanges();

  const beforeCancel = await surface.boundingBox();
  const cancelOrigin = await startDrag();
  await page.mouse.move(cancelOrigin.x - 150, cancelOrigin.y - 80, {steps: 8});
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const cancelled = await surface.boundingBox();
  expect(cancelled!.x).toBeCloseTo(beforeCancel!.x, 0);
  expect(cancelled!.y).toBeCloseTo(beforeCancel!.y, 0);
  await expectNoPageChanges();

  await move.focus();
  const beforeKeyboard = await surface.boundingBox();
  await move.press('ArrowLeft');
  await move.press('ArrowUp');
  const keyboardMoved = await surface.boundingBox();
  expect(keyboardMoved!.x).toBeLessThan(beforeKeyboard!.x);
  expect(keyboardMoved!.y).toBeLessThan(beforeKeyboard!.y);
  await move.press('Home');
  const reset = await surface.boundingBox();
  expect(reset!.x + reset!.width).toBeCloseTo(1440 - 12, 0);
  expect(reset!.y).toBeCloseTo(12, 0);
  await expectChromeInsideViewport();

  // Header controls remain buttons during dragging, and the compact preview
  // can move before restoring the full editor at its new position.
  await panel.locator('[data-action="preview"]').click();
  await expect(surface).toHaveAttribute('data-preview', 'true');
  const previewStart = await surface.boundingBox();
  const previewOrigin = await startDrag();
  await page.mouse.move(previewOrigin.x - 150, previewOrigin.y + 40, {steps: 8});
  await page.mouse.up();
  const previewMoved = await surface.boundingBox();
  expect(previewMoved!.x).toBeCloseTo(previewStart!.x - 150, 0);
  await page.keyboard.press('Escape');
  await expect(surface).not.toHaveAttribute('data-preview', 'true');
  await expectChromeInsideViewport();
  expect(await pageWidths(page)).toEqual(baseline);
  await expectNoPageChanges();

  await page.setViewportSize({width: 360, height: 640});
  await expectChromeInsideViewport();
  await expect(move).toBeVisible();
  await page.setViewportSize({width: 1440, height: 960});
  await expectChromeInsideViewport();
  await move.focus();
  await move.press('Home');
  expect(await pageWidths(page)).toEqual(baseline);

  await hero.click();
  await panel.locator('[data-field="text"]').fill('Перемещённая панель работает');
  await expect(hero).toHaveText('Перемещённая панель работает');
  await expect(panel.locator('[data-field="pending-count"]')).toHaveText('1');
  await panel.locator('[data-action="undo"]').click();
  await expectNoPageChanges();
});
