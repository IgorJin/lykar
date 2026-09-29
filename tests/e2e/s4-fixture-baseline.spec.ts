import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test, expect, required} from './fixtures.js';

function packageVersion(name: string) {
  return JSON.parse(readFileSync(join(process.cwd(), 'node_modules', name, 'package.json'), 'utf8')).version as string;
}

async function readyPhase(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const root = document.getElementById('framework-root');
    const roots = (window as unknown as Record<symbol, Map<Element, {phase: string}>>)[Symbol.for('@lykar/framework-roots/v1')];
    return root ? roots?.get(root)?.phase ?? null : null;
  });
}

for (const framework of ['react', 'vue'] as const) {
  for (const mode of ['csr', 'ssr'] as const) {
    test(`${framework} ${mode} mounts, navigates, updates and remounts`, async ({newContext, browser}, testInfo) => {
      await testInfo.attach('framework-versions', {body: JSON.stringify({
        react: packageVersion('react'),
        reactDom: packageVersion('react-dom'),
        vue: packageVersion('vue'),
        node: process.version,
        browser: browser.version(),
      }, null, 2), contentType: 'application/json'});
      const context = await newContext();
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error' || /hydration|mismatch/i.test(message.text())) {
          consoleErrors.push(message.text());
        }
      });
      const url = `${required('LYKAR_E2E_PLAYGROUND_BASE_URL')}/__e2e__/s4-${framework}-${mode}-a?s4_sdk=off`;
      let releaseBundle: (() => void) | undefined;
      if (mode === 'ssr') {
        const gate = new Promise<void>(resolve => { releaseBundle = resolve; });
        await page.route(`**/__e2e__/s4-assets/${framework}-client.js`, async route => {
          await gate;
          await route.continue();
        });
      }
      try {
        await page.goto(url, {waitUntil: 'commit'});
        if (mode === 'ssr') {
          await expect(page.locator('#editable-copy')).toHaveText('Alpha native copy');
        }
      } finally {
        releaseBundle?.();
      }
      await expect.poll(() => readyPhase(page)).toBe('ready');
      await expect(page.locator('#page-title')).toHaveText('Alpha page');
      await page.locator('#nested-action').click();
      await expect(page.locator('#nested-count')).toHaveText('1');
      await page.locator('#host-input').fill('visitor draft');
      await expect(page.locator('#host-input')).toHaveValue('visitor draft');
      await page.locator('#premium-toggle').click();
      await expect(page.locator('#premium-toggle')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#editable-copy')).toHaveCSS('color', 'rgb(139, 0, 0)');
      await page.locator('#late-toggle').click();
      await expect(page.locator('#late-child')).toHaveText('Late native child');
      await page.locator('#rerender').click();
      await expect(page.locator('#render-count')).toHaveText('1');
      await expect(page.locator('#nested-count')).toHaveText('1');
      await page.locator('#go-b').click();
      await expect(page).toHaveURL(/s4-(react|vue)-(csr|ssr)-b/);
      await expect(page.locator('#page-title')).toHaveText('Beta page');
      await page.locator('#back').click();
      await expect(page.locator('#page-title')).toHaveText('Alpha page');
      await page.locator('#forward').click();
      await expect(page.locator('#page-title')).toHaveText('Beta page');
      await page.locator('#remount-root').click();
      await expect.poll(() => readyPhase(page)).toBe('ready');
      await expect(page.locator('#page-title')).toHaveText('Beta page');
      await expect(page.locator('#nested-count')).toHaveText('0');
      expect(consoleErrors, 'Hydration and browser console errors').toEqual([]);
    });
  }
}
