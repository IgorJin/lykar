import {expect, test, required} from './fixtures';

test('style panel searches catalog, edits arbitrary CSS, resets, undoes and reloads', async ({newContext}) => {
  const context = await newContext();
  const api = required('LYKAR_E2E_API_BASE_URL');
  expect((await context.request.post(`${api}/api/auth/dev-login`, {data: {}})).ok()).toBe(true);
  const projects = (await (await context.request.get(`${api}/api/admin/projects`)).json()).projects;
  const project = projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  const pages = (await (await context.request.get(`${api}/api/admin/projects/${project.id}/pages`)).json()).pages;
  const pageRecord = pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  const draft = (await (await context.request.post(`${api}/api/admin/pages/${pageRecord.id}/drafts`, {data: {}})).json()).draft;
  const launch = await context.request.post(`${api}/api/admin/pages/${pageRecord.id}/editor-launch`, {data: {draftId: draft.id}});
  const page = await context.newPage();
  await page.goto((await launch.json()).launchUrl);
  const panel = page.locator('[data-lykar-editor-root="panel"]');
  const hero = page.locator('[data-lykar-id="pricing-title"]');
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  await hero.click();
  const initialWidth = await hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('width'));

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('width');
  const width = panel.locator('[data-field="width"] input[aria-label="Width"]');
  await expect(width).toHaveValue(initialWidth);
  await width.fill('100px');
  await expect(hero).toHaveCSS('width', '100px');
  await width.press('Escape');
  await expect(hero).not.toHaveCSS('width', '100px');
  await expect(panel.locator('[data-view="editor"]')).toBeVisible();
  await width.fill('320px');
  await width.press('Tab');
  await expect(hero).toHaveCSS('width', '320px');
  await panel.getByRole('checkbox', {name: 'Width: !important', exact: true}).check();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('width')))
    .toBe('important');

  await panel.locator('.style-section[data-section="custom"] summary').click();
  await panel.getByRole('textbox', {name: 'CSS property'}).fill('--BrandAccent');
  await panel.getByRole('textbox', {name: 'CSS value'}).fill('rgb(10 20 30 / 50%)');
  await panel.getByRole('button', {name: 'Добавить / изменить'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('--BrandAccent')))
    .toBe('rgb(10 20 30 / 50%)');
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('color');
  const color = panel.locator('[data-field="color"] input[aria-label="Text Color"]');
  await color.fill('var(--BrandAccent)');
  await color.press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('color')))
    .toBe('var(--BrandAccent)');

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('hyphens');
  await expect(panel.getByRole('textbox', {name: 'CSS property'})).toHaveValue('hyphens');
  await panel.getByRole('textbox', {name: 'CSS value'}).fill('auto');
  await panel.getByRole('button', {name: 'Добавить / изменить'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('hyphens'))).toBe('auto');

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('box-shadow');
  const shadow = panel.locator('[data-field="box-shadow"]');
  await shadow.getByRole('textbox', {name: 'Box Shadows', exact: true})
    .fill('0 1px 2px rgb(1, 2, 3), 0 2px 4px rgb(4, 5, 6)');
  await shadow.getByRole('textbox', {name: 'Box Shadows', exact: true}).press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(4, 5, 6)');
  await shadow.getByRole('button', {name: 'Редактировать слои'}).click();
  await expect(shadow.locator('.style-layer > input')).toHaveCount(2);
  await shadow.getByRole('textbox', {name: 'Box Shadows 2', exact: true}).fill('0 2px 4px rgb(7, 8, 9)');
  await shadow.getByRole('textbox', {name: 'Box Shadows 2', exact: true}).press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow))
    .toMatch(/rgb\(1, 2, 3\).*rgb\(7, 8, 9\)/);

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('margin');
  const marginTop = panel.getByRole('textbox', {name: 'Margin: Top'});
  await marginTop.fill('12px');
  await marginTop.press('Tab');
  await expect(hero).toHaveCSS('margin-top', '12px');

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('background-image');
  const image = panel.getByRole('textbox', {name: 'Background Image / Gradient'});
  await image.fill('linear-gradient(red, blue)');
  await image.press('Tab');
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('background-color');
  const backgroundColor = panel.getByRole('textbox', {name: 'Background Color', exact: true});
  await backgroundColor.fill('rgba(0, 0, 255, 0.5)');
  await backgroundColor.press('Tab');
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('background-size');
  const size = panel.getByRole('textbox', {name: 'Background Size'});
  await size.fill('cover');
  await size.press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundColor)).toContain('0.5');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover');

  await hero.evaluate(element => (element as HTMLElement).style.setProperty('letter-spacing', '2px', 'important'));
  await hero.click();
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('letter-spacing');
  const letterSpacing = panel.locator('[data-field="letter-spacing"] input[aria-label="Letter Spacing"]');
  await expect(letterSpacing).toHaveValue('2px');
  await letterSpacing.fill('clamp(1px, 0.5vw, 8px)');
  await letterSpacing.press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('letter-spacing')))
    .toBe('clamp(1px, 0.5vw, 8px)');
  await panel.getByRole('button', {name: 'Вернуть исходный Letter Spacing'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('letter-spacing'))).toBe('2px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('letter-spacing'))).toBe('important');

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('display');
  const displayRow = panel.locator('[data-field="display"]');
  await displayRow.getByRole('combobox', {name: 'Display: варианты'}).selectOption('grid');
  await expect(hero).toHaveCSS('display', 'grid');
  await panel.locator('[data-action="undo"]').click();
  await expect(hero).not.toHaveCSS('display', 'grid');
  await panel.locator('[data-action="redo"]').click();
  await expect(hero).toHaveCSS('display', 'grid');

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('opacity');
  const opacity = panel.locator('[data-field="opacity"] input[aria-label="Opacity"]');
  await opacity.fill('0.35');
  await opacity.press('Tab');
  await expect(hero).toHaveCSS('opacity', '0.35');
  await expect(opacity).toHaveValue('0.35');
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('color');
  const textColor = panel.locator('[data-field="color"] input[aria-label="Text Color"]');
  await expect(textColor).toHaveValue('var(--BrandAccent)');

  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('width');
  await panel.getByRole('button', {name: 'Удалить inline CSS Width'}).click();
  await expect(hero).not.toHaveCSS('width', '320px');
  await panel.locator('[data-action="undo"]').click();
  await expect(hero).toHaveCSS('width', '320px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('width')))
    .toBe('important');
  await panel.getByRole('button', {name: 'Вернуть исходный Width'}).click();
  await expect(hero).not.toHaveCSS('width', '320px');
  await panel.locator('[data-action="undo"]').click();
  await expect(hero).toHaveCSS('width', '320px');
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд');
  await page.reload();
  await expect(hero).toHaveCSS('width', '320px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('width')))
    .toBe('important');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('--BrandAccent')))
    .toBe('rgb(10 20 30 / 50%)');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('color')))
    .toBe('var(--BrandAccent)');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('hyphens'))).toBe('auto');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow))
    .toContain('rgb(7, 8, 9)');
  await expect(hero).toHaveCSS('margin-top', '12px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundColor)).toContain('0.5');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover');

  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '100');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('data-lykar-id', 'test-shape');
    rect.setAttribute('width', '90');
    rect.setAttribute('height', '90');
    svg.append(rect);
    document.querySelector('main')!.append(svg);
  });
  const shape = page.locator('[data-lykar-id="test-shape"]');
  await shape.click();
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('fill');
  const fill = panel.getByRole('textbox', {name: 'SVG Fill', exact: true});
  await fill.fill('#00ff00');
  await fill.press('Tab');
  await expect.poll(() => shape.evaluate(element => (element as SVGElement).style.getPropertyValue('fill')))
    .toBe('rgb(0, 255, 0)');

  await page.evaluate(() => {
    const hostile = document.createElement('style');
    hostile.textContent = 'button { display:none !important } input { font-size:40px !important; background:red !important }';
    document.head.append(hostile);
  });
  await page.setViewportSize({width: 360, height: 640});
  await expect(panel.getByRole('button', {name: 'Закрыть'})).toBeVisible();
  await expect(panel.getByRole('searchbox', {name: 'Поиск свойства'})).toBeVisible();
  const bounds = await panel.locator('.panel').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
});
