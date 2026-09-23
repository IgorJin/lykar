import { test as base, expect, type BrowserContext } from '@playwright/test';
import { rm, writeFile } from 'node:fs/promises';

export { expect };
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const test = base.extend<{ newContext: () => Promise<BrowserContext> }>({
  newContext: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    const videoDirectory = testInfo.outputPath('videos');
    await use(async () => {
      const context = await browser.newContext({ recordVideo: { dir: videoDirectory } });
      contexts.push(context);
      context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
      context.on('requestfailed', request => {
        // Navigation/reload intentionally cancels outstanding requests.
        if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`Request failed: ${request.method()} ${new URL(request.url()).pathname}`);
      });
      context.on('response', response => {
        const path = new URL(response.url()).pathname;
        const expected = (path === '/api/auth/session' && response.status() === 401)
          || (path === '/favicon.ico' && response.status() === 404)
          || (response.status() === 409 && /^\/api\/editor\/drafts\/[^/]+\/operations$/.test(path));
        if (response.status() >= 400 && !expected) errors.push(`HTTP ${response.status()}: ${path}`);
      });
      return context;
    });
    const failed = testInfo.status !== testInfo.expectedStatus || errors.length > 0;
    try {
      if (failed) {
        const path = testInfo.outputPath('browser-errors.json');
        await writeFile(path, JSON.stringify(errors, null, 2));
        await testInfo.attach('browser-errors', { path, contentType: 'application/json' });
        let index = 0;
        for (const page of contexts.flatMap(context => context.pages())) {
          if (page.isClosed()) continue;
          const screenshot = testInfo.outputPath(`page-${++index}.png`);
          await page.screenshot({ path: screenshot, timeout: 5_000 }).then(() => testInfo.attach(`page-${index}`, { path: screenshot, contentType: 'image/png' })).catch(() => {});
        }
      }
    } finally {
      const videos = contexts.flatMap(context => context.pages()).map(page => page.video()).filter(video => video !== null);
      await Promise.all(contexts.map(context => context.close()));
      if (failed) {
        for (const [index, video] of videos.entries()) {
          const path = await video.path();
          await testInfo.attach(`video-${index}`, { path, contentType: 'video/webm' });
        }
      } else await rm(videoDirectory, { recursive: true, force: true });
    }
    expect(errors, 'Unexpected page, network or HTTP failures').toEqual([]);
  },
});
