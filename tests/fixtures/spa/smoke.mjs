import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [join(repo, 'apps/playground/server.mjs')], {
  cwd: repo,
  env: {...process.env, LYKAR_PLAYGROUND_PORT: String(port)},
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;

try {
  const deadline = Date.now() + 10_000;
  while (true) {
    if (child.exitCode !== null) throw new Error(`fixture server exited ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/__e2e__/s4-react-ssr-a?s4_sdk=off`);
      if (response.ok) break;
    } catch { /* server is starting */ }
    if (Date.now() > deadline) throw new Error('fixture server readiness timeout');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  browser = await chromium.launch({channel: 'chromium'});
  for (const framework of ['react', 'vue']) {
    for (const mode of ['csr', 'ssr']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' || /hydration|mismatch/i.test(message.text())) errors.push(message.text());
      });
      await page.goto(`${base}/__e2e__/s4-${framework}-${mode}-a?s4_sdk=off`);
      await page.waitForFunction(() => {
        const roots = window[Symbol.for('@lykar/framework-roots/v1')];
        return roots?.get(document.getElementById('framework-root'))?.phase === 'ready';
      });
      if (await page.locator('#page-title').textContent() !== 'Alpha page') throw new Error(`${framework} ${mode}: missing app`);
      await page.locator('#nested-action').click();
      if (await page.locator('#nested-count').textContent() !== '1') throw new Error(`${framework} ${mode}: handler failed`);
      await page.locator('#go-b').click();
      await page.getByRole('heading', {name: 'Beta page'}).waitFor();
      if (errors.length) throw new Error(`${framework} ${mode}: ${errors.join('\n')}`);
      console.log(`${framework} ${mode}: ready, interactive, route B`);
      await page.close();
    }
  }
} finally {
  await browser?.close();
  child.kill('SIGTERM');
  if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
}
