import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = join(appDirectory, '..', '..');
const port = Number(process.env.LYKAR_PLAYGROUND_PORT ?? 4173);

const routes = new Map([
  ['/', { file: join(appDirectory, 'public', 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/index.html', { file: join(appDirectory, 'public', 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/pricing', { file: join(appDirectory, 'public', 'pricing.html'), type: 'text/html; charset=utf-8' }],
  ['/pricing.html', { file: join(appDirectory, 'public', 'pricing.html'), type: 'text/html; charset=utf-8' }],
  ['/styles.css', { file: join(appDirectory, 'public', 'styles.css'), type: 'text/css; charset=utf-8' }],
  ['/playground.js', { file: join(appDirectory, 'public', 'playground.js'), type: 'text/javascript; charset=utf-8' }],
  ['/editor.iife.js', {
    file: join(repositoryDirectory, 'packages', 'editor-bridge', 'dist', 'editor.iife.js'),
    type: 'text/javascript; charset=utf-8',
  }],
]);

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
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
