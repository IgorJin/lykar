import {test, expect, required} from './fixtures.js';

for (const framework of ['react', 'vue'] as const) {
  test(`${framework} SSR commits before host interaction and survives route history`, async ({newContext}) => {
    const context = await newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error' || /hydration|mismatch/i.test(message.text())) errors.push(message.text());
    });
    await page.goto(`${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}/__e2e__/s4-${framework}-ssr-a?s4_sdk=off`);
    await expect.poll(() => page.evaluate(() => {
      const roots = (window as unknown as Record<symbol, Map<Element, {phase: string}>>)[Symbol.for('@lykar/framework-roots/v1')];
      return roots?.get(document.getElementById('framework-root')!)?.phase;
    })).toBe('ready');
    await page.locator('#nested-action').click();
    await expect(page.locator('#nested-count')).toHaveText('1');
    await page.locator('#go-b').click();
    await expect(page.locator('#page-title')).toHaveText('Beta page');
    await page.locator('#back').click();
    await expect(page.locator('#page-title')).toHaveText('Alpha page');
    await expect(page.locator('#nested-count')).toHaveText('1');
    expect(errors).toEqual([]);
  });
}

for (const framework of ['react', 'vue'] as const) {
  test(`${framework}: ready rules leave server HTML untouched until real hydration commits`, async ({newContext}) => {
    const page = await (await newContext()).newPage();
    const errors: string[] = [];
    page.on('console', message => {if (message.type() === 'error' || /hydration|mismatch/i.test(message.text())) errors.push(message.text());});
    let release!: () => void;
    const gate = new Promise<void>(resolve => {release = resolve;});
    await page.route(`**/__e2e__/s4-assets/${framework}-client.js`, async route => {await gate; await route.continue();});
    const pathname = `/__e2e__/s4-${framework}-ssr-a`;
    await page.route('**/api/runtime/projects/*/manifest?*', route => route.fulfill({json: {manifest: {
      schemaVersion: 1, projectId: 'project-hydration', pageId: 'page-hydration', pathname,
      releaseId: `hydration-${framework}`, version: 1, manifestHash: 'a'.repeat(64), createdAt: '2026-09-29T00:00:00.000Z',
      operations: [{schemaVersion: 2, id: 'early-text', kind: 'setText', target: {selectors: {css: '#editable-copy'}}, condition: {id: 'alpha', text: 'Alpha native copy'}, value: 'Alpha edited after hydration'}],
    }}}));
    try {
      await page.goto(`${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}${pathname}?version=1`, {waitUntil: 'commit'});
      await expect.poll(() => page.evaluate(() => (window as unknown as {__LYKAR_SDK_RESULT__?: {mode: string}}).__LYKAR_SDK_RESULT__?.mode)).toBe('visitor');
      await expect(page.locator('#editable-copy')).toHaveText('Alpha native copy');
      await expect.poll(() => page.evaluate(() => (window as unknown as {__LYKAR_SDK__: {conditionalState: {groups: Array<{status: string}>}}}).__LYKAR_SDK__.conditionalState.groups[0]?.status)).toBe('not-ready');
    } finally {release();}
    await expect(page.locator('#editable-copy')).toHaveText('Alpha edited after hydration');
    await page.locator('#nested-action').click();
    await expect(page.locator('#nested-count')).toHaveText('1');
    expect(errors).toEqual([]);
  });
}
