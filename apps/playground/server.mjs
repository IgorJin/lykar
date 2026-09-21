import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = join(appDirectory, '..', '..');
const port = Number(process.env.LYKAR_PLAYGROUND_PORT ?? 4173);
const apiBaseUrl = process.env.LYKAR_API_BASE_URL ?? 'http://127.0.0.1:3000';
const projectKey = process.env.LYKAR_PLAYGROUND_PROJECT_KEY ?? 'pk_playground_local';
const sdkDistDirectory = process.env.LYKAR_SDK_DIST_DIR
  ? resolve(process.env.LYKAR_SDK_DIST_DIR)
  : join(repositoryDirectory, 'packages', 'sdk', 'dist');

const routes = new Map([
  ['/', { file: join(appDirectory, 'public', 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: join(appDirectory, 'public', 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/pricing', { file: join(appDirectory, 'public', 'pricing.html'), type: 'text/html; charset=utf-8' }],
  ['/pricing.html', { file: join(appDirectory, 'public', 'pricing.html'), type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: join(appDirectory, 'public', 'styles.css'), type: 'text/css; charset=utf-8' }],
  ['/playground.js', { file: join(appDirectory, 'public', 'playground.js'), type: 'text/javascript; charset=utf-8' }],
  ['/sdk.iife.js', {
    file: join(sdkDistDirectory, 'sdk.iife.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/editor.iife.js', {
    file: join(sdkDistDirectory, 'editor.iife.js'),
    type: 'text/javascript; charset=utf-8',
  }],
  ['/asset-manifest.json', {
    file: join(sdkDistDirectory, 'asset-manifest.json'),
    type: 'application/json; charset=utf-8',
  }],
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/lykar-config.json') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({
      apiBaseUrl,
      projectKey,
      adminUrl: `${apiBaseUrl}/admin/`,
      ownerEmail: process.env.LYKAR_OWNER_EMAIL ?? 'owner@lykar.local',
    }));
    return;
  }
  const route = routes.get(pathname);
  if (!route) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': route.type,
    'Cache-Control': 'no-store',
  });
  createReadStream(route.file).on('error', error => {
    response.destroy(error);
  }).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Lykar playground: http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
