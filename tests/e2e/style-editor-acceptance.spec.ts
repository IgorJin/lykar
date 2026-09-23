import {expect, test, required} from './fixtures';

const STYLE_SECTIONS = [
  'layout', 'size', 'space', 'position', 'typography', 'background', 'borders', 'effects', 'advanced',
] as const;

test('S2-06.8 preparation: SDK style families, keyboard, persistence and visitor share', async ({newContext}, testInfo) => {
  const api = required('LYKAR_E2E_API_BASE_URL');
  const owner = await newContext();
  const visitor = await newContext();
  expect((await owner.request.post(`${api}/api/auth/dev-login`, {data: {}})).ok()).toBe(true);

  const projects = (await (await owner.request.get(`${api}/api/admin/projects`)).json()).projects;
  const project = projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  if (!project) throw new Error('Northstar E2E project is missing');
  const pages = (await (await owner.request.get(`${api}/api/admin/projects/${project.id}/pages`)).json()).pages;
  const pageRecord = pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  if (!pageRecord) throw new Error('Northstar E2E /pricing page is missing');

  const draftResponse = await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/drafts`, {data: {}});
  expect(draftResponse.ok()).toBe(true);
  const {draft} = await draftResponse.json();
  const launchResponse = await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/editor-launch`, {
    data: {draftId: draft.id},
  });
  expect(launchResponse.ok()).toBe(true);

  const editor = await owner.newPage();
  await editor.goto((await launchResponse.json()).launchUrl);
  const panel = editor.locator('[data-lykar-editor-root="panel"]');
  const stylePanel = panel.locator('.panel');
  const search = panel.getByRole('searchbox', {name: 'Поиск свойства'});
  const hero = editor.locator('[data-lykar-id="pricing-title"]');
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  await hero.click();

  for (const sectionId of STYLE_SECTIONS) {
    await expect(panel.locator(`.style-section[data-section="${sectionId}"]`)).toBeVisible();
  }
  await testInfo.attach('style-editor-overall.png', {
    body: await stylePanel.screenshot(), contentType: 'image/png',
  });

  await search.fill('');
  const typography = panel.locator('.style-section[data-section="typography"]');
  if (!(await typography.evaluate(element => (element as HTMLDetailsElement).open))) {
    await typography.locator('summary').click();
  }
  await expect(typography.locator('[data-field="font-size"]')).toBeVisible();
  await testInfo.attach('style-editor-typography-section.png', {
    body: await typography.screenshot(), contentType: 'image/png',
  });

  // The first edit is cancelled with Escape; the next is exercised through
  // undo/redo and both states are captured for the acceptance report.
  await search.fill('width');
  const widthRow = panel.locator('[data-field="width"]');
  const width = widthRow.getByRole('textbox', {name: 'Width'});
  await expect(widthRow.getByRole('combobox', {name: 'Width: единица'})).toBeVisible();
  await width.fill('80px');
  await expect(hero).toHaveCSS('width', '80px');
  await width.press('Escape');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('width'))).toBe('');

  await width.fill('320px');
  await width.press('Enter');
  await expect(hero).toHaveCSS('width', '320px');
  await panel.locator('[data-action="undo"]').click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('width'))).toBe('');
  await panel.locator('[data-action="redo"]').click();
  await expect(hero).toHaveCSS('width', '320px');
  await testInfo.attach('style-editor-width-changed.png', {
    body: await widthRow.screenshot(), contentType: 'image/png',
  });
  await panel.getByRole('button', {name: 'Вернуть исходный Width'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('width'))).toBe('');
  await expect(width).toHaveValue('');
  await testInfo.attach('style-editor-width-reset.png', {
    body: await widthRow.screenshot(), contentType: 'image/png',
  });

  // Seed a case-sensitive custom token, then exercise each visual section and
  // each distinct control family with a representative supported declaration.
  await search.fill('--BrandAccent');
  await panel.getByRole('textbox', {name: 'CSS property'}).fill('--BrandAccent');
  await panel.getByRole('textbox', {name: 'CSS value'}).fill('rgb(12, 34, 56)');
  await panel.getByRole('button', {name: 'Добавить / изменить'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('--BrandAccent')))
    .toContain('12');

  const displayRow = panel.locator('[data-field="display"]');
  await search.fill('display');
  await displayRow.getByRole('combobox', {name: 'Display: варианты'}).selectOption('flex');
  await expect(hero).toHaveCSS('display', 'flex'); // Layout: select.

  await search.fill('margin');
  const marginTop = panel.locator('[data-field="margin"] input[aria-label="Margin: Top"]');
  await marginTop.fill('12px');
  await marginTop.press('Tab');
  await expect(hero).toHaveCSS('margin-top', '12px'); // Space: composite + number-unit part.

  await search.fill('position');
  await panel.locator('[data-field="position"] select[aria-label="Position: варианты"]').selectOption('relative');
  await expect(hero).toHaveCSS('position', 'relative'); // Position: select.

  await search.fill('color');
  const colorRow = panel.locator('[data-field="color"]');
  await expect(colorRow.locator('input[data-role="swatch"]')).toBeVisible();
  const textColor = colorRow.getByRole('textbox', {name: 'Text Color', exact: true});
  await textColor.fill('var(--BrandAccent)');
  await textColor.press('Enter');
  await expect(hero).toHaveCSS('color', 'rgb(12, 34, 56)'); // Typography: color picker + raw CSS value.

  await search.fill('background-image');
  const backgroundImage = panel.locator('[data-field="background-image"] input[aria-label="Background Image / Gradient"]');
  await backgroundImage.fill('linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))');
  await backgroundImage.press('Enter');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('linear-gradient');

  await search.fill('border-radius');
  const radius = panel.locator('[data-field="border-radius"] input[aria-label="Border Radius: Top left"]');
  await radius.fill('8px');
  await radius.press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('border-top-left-radius')))
    .toBe('8px'); // Borders: composite.

  await search.fill('box-shadow');
  const shadowRow = panel.locator('[data-field="box-shadow"]');
  const shadow = shadowRow.getByRole('textbox', {name: 'Box Shadows', exact: true});
  await shadow.fill('0 1px 2px rgb(1, 2, 3), 0 2px 4px rgb(4, 5, 6)');
  await shadow.press('Enter');
  await shadowRow.getByRole('button', {name: 'Редактировать слои'}).click();
  const secondShadow = shadowRow.getByRole('textbox', {name: 'Box Shadows 2'});
  await secondShadow.fill('0 2px 4px rgb(7, 8, 9)');
  await secondShadow.press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(7, 8, 9)');
  // Effects: stack editor and preservation of an untouched layer.
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(1, 2, 3)');

  await search.fill('cursor');
  await panel.locator('[data-field="cursor"] select[aria-label="Cursor: варианты"]').selectOption('help');
  await expect(hero).toHaveCSS('cursor', 'help'); // Advanced: catalog select.

  await search.fill('hyphens');
  await expect(panel.getByRole('textbox', {name: 'CSS property'})).toHaveValue('hyphens');
  await panel.getByRole('textbox', {name: 'CSS value'}).fill('auto');
  await panel.getByRole('button', {name: 'Добавить / изменить'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('hyphens'))).toBe('auto');
  // Advanced raw fallback: an arbitrary property absent from styles-config.

  const selectedLabel = panel.locator('[data-field="selected-label"]');
  const originalTarget = await selectedLabel.textContent();
  await panel.locator('[data-action="select-parent"]').click();
  await expect(selectedLabel).not.toHaveText(originalTarget ?? '');
  await search.fill('width');
  await expect(panel.locator('[data-field="width"] input[aria-label="Width"]')).toHaveValue('');
  const brandLink = editor.locator('[data-lykar-id="brand"]');
  await brandLink.click();
  await expect(selectedLabel).toContainText('a.brand');
  await expect(panel.locator('[data-field="width"] input[aria-label="Width"]')).toHaveValue('');
  await hero.click();
  await expect(panel.locator('[data-field="width"] input[aria-label="Width"]')).toHaveValue('');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('color')))
    .toBe('var(--BrandAccent)');
  await panel.locator('[data-field="width"] input[aria-label="Width"]').fill('360px');
  await panel.locator('[data-field="width"] input[aria-label="Width"]').press('Enter');
  await expect(hero).toHaveCSS('width', '360px');

  // Host-page rules must not leak through the editor's shadow boundary.
  await editor.addStyleTag({content: `
    button { display: none !important; }
    input, select { font-size: 40px !important; background: red !important; }
    label, summary { line-height: 1 !important; }
  `});
  await editor.setViewportSize({width: 360, height: 640});
  await expect(panel.getByRole('button', {name: 'Закрыть'})).toBeVisible();
  await expect(search).toBeVisible();
  const bounds = await stylePanel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);

  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд');
  await editor.reload();
  await expect(hero).toHaveCSS('width', '360px');
  await expect(hero).toHaveCSS('color', 'rgb(12, 34, 56)');
  await expect(hero).toHaveCSS('display', 'flex');
  await expect(hero).toHaveCSS('position', 'relative');
  await expect(hero).toHaveCSS('margin-top', '12px');
  await expect(hero).toHaveCSS('border-top-left-radius', '8px');
  await expect(hero).toHaveCSS('cursor', 'help');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(7, 8, 9)');

  const storedDraft = await owner.request.get(`${api}/api/admin/drafts/${draft.id}`);
  expect(storedDraft.ok()).toBe(true);
  const revision = (await storedDraft.json()).draft.revision as number;
  const publishResponse = await owner.request.post(`${api}/api/admin/drafts/${draft.id}/publish`, {
    data: {expectedRevision: revision},
  });
  expect(publishResponse.ok()).toBe(true);
  const release = (await publishResponse.json()).release;
  const shareResponse = await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/shares`, {
    data: {releaseId: release.id},
  });
  expect(shareResponse.ok()).toBe(true);
  const shareUrl = (await shareResponse.json()).url as string;

  const sharedPage = await visitor.newPage();
  await sharedPage.goto(shareUrl);
  const sharedHero = sharedPage.locator('[data-lykar-id="pricing-title"]');
  await expect(sharedPage.locator('body')).toHaveAttribute('data-lykar-mode', 'share');
  await expect(sharedPage.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  await expect(sharedHero).toHaveCSS('width', '360px');
  await expect(sharedHero).toHaveCSS('color', 'rgb(12, 34, 56)');
  await expect(sharedHero).toHaveCSS('display', 'flex');
  await expect(sharedHero).toHaveCSS('position', 'relative');
  await expect(sharedHero).toHaveCSS('margin-top', '12px');
  await expect(sharedHero).toHaveCSS('border-top-left-radius', '8px');
  await expect(sharedHero).toHaveCSS('cursor', 'help');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(1, 2, 3)');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(7, 8, 9)');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.getPropertyValue('--BrandAccent')))
    .toContain('12');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.getPropertyValue('hyphens')))
    .toBe('auto');
});
