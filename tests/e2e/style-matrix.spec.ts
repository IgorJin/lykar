import {expect, test, required} from './fixtures';
import type {BrowserContext} from '@playwright/test';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

async function openEditor(newContext: () => Promise<BrowserContext>) {
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
  await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  return {context, api, pageRecord, draft, page, panel, hero: page.locator('[data-lykar-id="pricing-title"]'), search: panel.getByRole('searchbox', {name: 'Поиск свойства'})};
}

test('S2 style matrix: layers, priorities, raw fallback, SVG, invalid input and share', async ({newContext}) => {
  test.setTimeout(90_000);
  const {context, api, pageRecord, draft, page, panel, hero, search} = await openEditor(newContext);
  const original = await hero.evaluate(element => {
    const style = (element as HTMLElement).style;
    style.setProperty('box-shadow', '0 1px 2px rgb(1, 2, 3), inset 0 2px 4px rgb(4, 5, 6)');
    style.setProperty('background-image', 'linear-gradient(red, blue), url("data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E")');
    style.setProperty('background-size', 'cover, 10px 20px');
    style.setProperty('background-color', 'rgb(10, 20, 30)');
    style.setProperty('letter-spacing', '2px', 'important');
    return {image: style.backgroundImage, color: style.backgroundColor};
  });
  await hero.click();
  const readOnlyCount = await page.evaluate(() => (window as unknown as {__LYKAR_EDITOR__: {exportDraft(): {operations: unknown[]}}}).__LYKAR_EDITOR__.exportDraft().operations.length);
  await search.fill('background');
  await search.fill('box-shadow');
  await expect.poll(() => page.evaluate(() => (window as unknown as {__LYKAR_EDITOR__: {exportDraft(): {operations: unknown[]}}}).__LYKAR_EDITOR__.exportDraft().operations.length))
    .toBe(readOnlyCount);
  await search.fill('background-image');
  const imageField = panel.locator('[data-field="background-image"] input[aria-label="Background Image / Gradient"]');
  await imageField.fill(original.image); await imageField.press('Enter');
  await search.fill('background-color');
  const colorField = panel.locator('[data-field="background-color"] input[aria-label="Background Color"]');
  await colorField.fill(original.color); await colorField.press('Enter');
  await search.fill('box-shadow');
  const shadow = panel.locator('[data-field="box-shadow"]');
  await shadow.getByRole('button', {name: 'Редактировать слои'}).click();
  await shadow.getByRole('textbox', {name: 'Box Shadows 2: color'}).fill('rgb(7, 8, 9)');
  await shadow.getByRole('textbox', {name: 'Box Shadows 2: color'}).press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(7, 8, 9)');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(1, 2, 3)');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('inset');

  await search.fill('background');
  const background = panel.locator('[data-field="background"]');
  await background.getByRole('button', {name: 'Редактировать слои'}).click();
  const size = background.getByRole('textbox', {name: 'Background Layers 2: size'});
  await expect(size).toHaveValue('10px 20px');
  await size.fill('contain');
  await size.press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover, contain');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toBe(original.image);
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundColor)).toBe(original.color);
  await panel.locator('[data-action="undo"]').click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover, 10px 20px');
  await panel.locator('[data-action="redo"]').click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover, contain');

  await search.fill('transform');
  const transform = panel.locator('[data-field="transform"]');
  const transformRaw = transform.getByRole('textbox', {name: 'Transforms', exact: true});
  await transformRaw.fill('translate(10px, 20px) rotate(30deg)'); await transformRaw.press('Enter');
  await transform.getByRole('button', {name: 'Редактировать слои'}).click();
  await transform.getByRole('textbox', {name: 'Transforms 2', exact: true}).fill('rotate(45deg)');
  await transform.getByRole('textbox', {name: 'Transforms 2', exact: true}).press('Tab');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.transform)).toContain('translate(10px, 20px) rotate(45deg)');

  await search.fill('transition');
  const transition = panel.locator('[data-field="transition"]');
  const transitionRaw = transition.getByRole('textbox', {name: 'Transitions', exact: true});
  await transitionRaw.fill('opacity 1s cubic-bezier(0.2, 0.4, 0.6, 0.8), transform 2s ease-in');
  await transitionRaw.press('Enter');
  await transition.getByRole('button', {name: 'Редактировать слои'}).click();
  await expect(transition.locator('.style-layer > input')).toHaveCount(2);
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.transition)).toContain('cubic-bezier(0.2, 0.4, 0.6, 0.8)');

  await search.fill('letter-spacing');
  const letter = panel.locator('[data-field="letter-spacing"] input[aria-label="Letter Spacing"]');
  await letter.fill('clamp(1px, 0.5vw, 8px)');
  await letter.press('Enter');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.letterSpacing)).toContain('clamp');
  await panel.getByRole('button', {name: 'Вернуть исходный Letter Spacing'}).click();
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('letter-spacing'))).toBe('2px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyPriority('letter-spacing'))).toBe('important');

  await search.fill('color');
  const textColor = panel.locator('[data-field="color"] input[aria-label="Text Color"]');
  await textColor.fill('var(--DefinitelyMissing)'); await textColor.press('Enter');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.color)).toBe('var(--DefinitelyMissing)');
  await expect(panel.locator('[data-field="status"]')).toContainText('переменная --DefinitelyMissing');
  await panel.locator('[data-action="undo"]').click();

  await search.fill('width');
  const width = panel.locator('[data-field="width"] input[aria-label="Width"]');
  await width.fill('333px');
  await expect(hero).toHaveCSS('width', '333px');
  await width.fill('not-a-width');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await expect(hero).toHaveCSS('width', '333px');
  await width.press('Tab');
  await expect(hero).toHaveCSS('width', '333px');

  await search.fill('grid-template-columns');
  const grid = panel.locator('[data-field="grid-template-columns"] input[aria-label="Grid Columns"]');
  await grid.fill('minmax(100px, 1fr) 2fr'); await grid.press('Enter');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.gridTemplateColumns)).toContain('minmax(100px, 1fr)');
  await search.fill('animation-name');
  const animation = panel.locator('[data-field="animation-name"] input[aria-label="Animation Name"]');
  await animation.fill('pulse'); await animation.press('Enter');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.animationName)).toBe('pulse');

  if (await page.evaluate(() => CSS.supports('-webkit-text-stroke-width', '1px'))) {
    await search.fill('-webkit-text-stroke-width');
    await panel.getByRole('textbox', {name: 'CSS value'}).fill('1px');
    await panel.getByRole('button', {name: 'Добавить / изменить'}).click();
    await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('-webkit-text-stroke-width'))).toBe('1px');
  }

  await page.evaluate(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100'); svg.setAttribute('height', '40');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('data-lykar-id', 'style-svg-rect');
    rect.setAttribute('width', '100'); rect.setAttribute('height', '40');
    svg.append(rect); document.body.append(svg);
  });
  const rect = page.locator('[data-lykar-id="style-svg-rect"]');
  await rect.evaluate(element => element.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true})));
  await expect(panel.locator('[data-field="selected-label"]')).toContainText('rect');
  await search.fill('stroke');
  const stroke = panel.locator('[data-field="stroke"] input[aria-label="SVG Stroke"]');
  await stroke.fill('rgb(20, 30, 40)'); await stroke.press('Enter');
  await expect.poll(() => rect.evaluate(element => (element as SVGElement).style.stroke)).toBe('rgb(20, 30, 40)');
  await panel.locator('[data-action="undo"]').click();
  await expect.poll(() => rect.evaluate(element => (element as SVGElement).style.stroke)).toBe('');
  await hero.click();

  const beforePadding = await hero.evaluate(element => ['top', 'right', 'bottom', 'left'].map(side => (element as HTMLElement).style.getPropertyValue(`padding-${side}`)));
  await search.fill('padding');
  await panel.locator('[data-field="padding"] [data-role="linked-spacing"]').check();
  const linkedTop = panel.locator('[data-field="padding"] input[aria-label="Padding: Top"]');
  await linkedTop.fill('8px'); await linkedTop.press('Tab');
  await expect.poll(() => hero.evaluate(element => ['top', 'right', 'bottom', 'left'].map(side => (element as HTMLElement).style.getPropertyValue(`padding-${side}`))))
    .toEqual(['8px', '8px', '8px', '8px']);

  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд');
  await page.reload();
  await expect(hero).toHaveCSS('width', '333px');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover, contain');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(7, 8, 9)');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.transform)).toContain('rotate(45deg)');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.animationName)).toBe('pulse');
  await panel.locator('[data-action="undo"]').click();
  await expect.poll(() => hero.evaluate(element => ['top', 'right', 'bottom', 'left'].map(side => (element as HTMLElement).style.getPropertyValue(`padding-${side}`))))
    .toEqual(beforePadding);
  await panel.locator('[data-action="apply"]').click();
  await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд');
  await page.reload();
  await expect.poll(() => hero.evaluate(element => ['top', 'right', 'bottom', 'left'].map(side => (element as HTMLElement).style.getPropertyValue(`padding-${side}`))))
    .toEqual(beforePadding);

  // Publishing revokes the editor launch capability. Close its page first so
  // an in-flight refresh cannot report the expected revocation as an error.
  await page.close();
  const stored = await context.request.get(`${api}/api/admin/drafts/${draft.id}`);
  const revision = (await stored.json()).draft.revision;
  const published = await context.request.post(`${api}/api/admin/drafts/${draft.id}/publish`, {data: {expectedRevision: revision}});
  expect(published.ok()).toBe(true);
  const release = (await published.json()).release;
  const share = await context.request.post(`${api}/api/admin/pages/${pageRecord.id}/shares`, {data: {releaseId: release.id}});
  expect(share.ok()).toBe(true);
  const visitor = await newContext();
  const shared = await visitor.newPage();
  await shared.goto((await share.json()).url);
  const sharedHero = shared.locator('[data-lykar-id="pricing-title"]');
  await expect(sharedHero).toHaveCSS('width', '333px');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.backgroundSize)).toBe('cover, contain');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('linear-gradient');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.backgroundImage)).toContain('data:image/svg+xml');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.backgroundColor)).toBe(original.color);
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.boxShadow)).toContain('rgb(7, 8, 9)');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.transform)).toContain('rotate(45deg)');
  await expect.poll(() => sharedHero.evaluate(element => (element as HTMLElement).style.animationName)).toBe('pulse');
  await expect.poll(() => sharedHero.evaluate(element => ['top', 'right', 'bottom', 'left'].map(side => (element as HTMLElement).style.getPropertyValue(`padding-${side}`))))
    .toEqual(beforePadding);
});

test('S2 style budget: 1000 node selection and input preview p95', async ({newContext}, testInfo) => {
  test.setTimeout(60_000);
  const {page, panel, hero, search} = await openEditor(newContext);
  await page.evaluate(() => {
    const container = document.createElement('div');
    container.id = 'style-latency-fixture';
    container.innerHTML = Array.from({length: 1000}, (_, index) => `<span data-lykar-id="latency-${index}">${index}</span>`).join('');
    document.body.append(container);
  });
  await hero.click();
  await search.fill('width');
  const result = await page.evaluate(async () => {
    const hero = document.querySelector<HTMLElement>('[data-lykar-id="pricing-title"]')!;
    const link = document.querySelector<HTMLElement>('[data-lykar-id="brand"]')!;
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const width = panel.querySelector<HTMLInputElement>('[data-field="width"] input[aria-label="Width"]')!;
    const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const selection: number[] = [], input: number[] = [];
    for (let index = 0; index < 35; index++) {
      const target = index % 2 ? hero : link;
      const start = performance.now();
      target.click();
      await nextFrame();
      if (index >= 5) selection.push(performance.now() - start);
    }
    hero.click(); await nextFrame();
    for (let index = 0; index < 35; index++) {
      const value = `${200 + index}px`;
      const start = performance.now();
      width.focus(); width.value = value; width.dispatchEvent(new Event('input', {bubbles: true}));
      for (let frame = 0; frame < 4 && hero.style.width !== value; frame++) await nextFrame();
      if (hero.style.width !== value) throw new Error(`Preview did not reach ${value}`);
      await nextFrame();
      if (index >= 5) input.push(performance.now() - start);
    }
    const percentile = (values: number[]) => values.sort((a,b) => a-b)[Math.ceil(values.length * 0.95)-1];
    return {selectionP95Ms: percentile(selection), inputP95Ms: percentile(input), warmup: 5, measured: 30, nodeCount: 1000, userAgent: navigator.userAgent};
  });
  console.log(`LYKAR_STYLE_LATENCY ${testInfo.project.name} ${JSON.stringify(result)}`);
  await testInfo.attach('style-latency.json', {body: JSON.stringify(result, null, 2), contentType: 'application/json'});
  expect(result.selectionP95Ms).toBeLessThanOrEqual(50);
  expect(result.inputP95Ms).toBeLessThanOrEqual(50);
});

test('S2 style budget: native visitor never requests editor UI', async ({newContext}) => {
  const context = await newContext();
  const page = await context.newPage();
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto(`${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}/pricing`);
  await expect(page.locator('body')).toHaveAttribute('data-lykar-mode', /^(native|runtime)$/);
  expect(requests.filter(path => /editor\.(?:iife|esm)\.js|editor-ui|styles-config|codecs/.test(path))).toEqual([]);
});

test('S2 editor acceptance: keyboard controls, zoom, nested scroll and static copy warning', async ({newContext}, testInfo) => {
  test.setTimeout(60_000);
  const attachEvidence = async (name: string) => {
    const body = await page.screenshot();
    await testInfo.attach(name, {body, contentType: 'image/png'});
    if (testInfo.project.name === 'chromium') {
      const directory = resolve(process.cwd(), 'docs/verification/reports/S2/assets');
      await mkdir(directory, {recursive: true});
      await writeFile(resolve(directory, name), body);
    }
  };
  const {page, panel, hero, search} = await openEditor(newContext);
  await page.setViewportSize({width: 1280, height: 800});
  await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('[data-lykar-id="pricing-title"]')!;
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'height:72px;overflow:auto;max-width:600px';
    hero.before(wrapper); wrapper.append(hero);
    wrapper.scrollTop = 20;
    document.body.style.zoom = '125%';
  });
  await hero.click();
  await expect(panel.locator('.help').filter({hasText: 'Обработчики, component state'})).toBeVisible();
  await expect(panel.locator('[data-field="selected-label"]')).toContainText('h1');
  await search.focus();
  await page.keyboard.type('width');
  const width = panel.locator('[data-field="width"] input[aria-label="Width"]');
  await width.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('300px');
  await expect(width).toHaveValue('300px');
  await page.keyboard.press('Enter');
  await expect(hero).toHaveCSS('width', '300px');
  await panel.locator('[data-action="undo"]').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => hero.evaluate(element => (element as HTMLElement).style.getPropertyValue('width'))).not.toBe('300px');
  await panel.locator('[data-action="redo"]').focus();
  await page.keyboard.press('Enter');
  await expect(hero).toHaveCSS('width', '300px');
  const label = await panel.locator('[data-field="selected-label"]').textContent();
  await panel.getByRole('searchbox', {name: 'Поиск свойства'}).click();
  await expect(panel.locator('[data-field="selected-label"]')).toHaveText(label ?? '');
  await attachEvidence('editor-desktop-zoom.png');
  await page.setViewportSize({width: 360, height: 640});
  await expect(panel.getByRole('button', {name: 'Закрыть'})).toBeVisible();
  const bounds = await panel.locator('.panel').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  await attachEvidence('editor-mobile-zoom.png');
});
