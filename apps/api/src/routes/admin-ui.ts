import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { FastifyPluginAsync, FastifyReply } from 'fastify';

const ADMIN_DIST = resolve(__dirname, '../../../admin/dist');

async function send(reply: FastifyReply, file: string, type: string): Promise<FastifyReply> {
  try {
    const contents = await readFile(resolve(ADMIN_DIST, file));
    return reply.type(type).header('Cache-Control', 'no-cache').send(contents);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return reply.code(503).send({
        error: { code: 'ADMIN_NOT_BUILT', message: 'Run npm run build --workspace @lykar/admin first' },
      });
    }
    throw error;
  }
}

const adminUiRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/admin/app.js', async (_request, reply) => send(reply, 'app.js', 'text/javascript; charset=utf-8'));
  fastify.get('/admin/styles.css', async (_request, reply) => send(reply, 'styles.css', 'text/css; charset=utf-8'));
  fastify.get('/admin/', async (_request, reply) => send(reply, 'index.html', 'text/html; charset=utf-8'));
  fastify.get('/admin', async (_request, reply) => send(reply, 'index.html', 'text/html; charset=utf-8'));
  fastify.get('/admin/*', async (_request, reply) => send(reply, 'index.html', 'text/html; charset=utf-8'));
};

export default adminUiRoutes;
