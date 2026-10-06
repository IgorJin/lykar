import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import Fastify from 'fastify';
import type {AuthService} from '../domain/auth';
import installationRoutes from './installation';

const authService = {async authenticate(token: unknown) {
  if (token !== 'test-session-secret') throw Object.assign(new Error('Unauthenticated'), {statusCode: 401});
  return {user: {id: 'test-user'}, session: {token: 'never-expose-this'}};
}} as unknown as AuthService;
const headers = {cookie: 'lykar_session=test-session-secret'};

test('installation is authenticated, secret free, no-store and production files are absent', async () => {
  const app = Fastify();
  await app.register(installationRoutes, {authService, appOrigin: 'https://app.example.com', development: false});
  try {
    assert.equal((await app.inject('/api/admin/installation')).statusCode, 401);
    const response = await app.inject({url: '/api/admin/installation', headers});
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.json().assets, null);
    assert.equal(response.body.includes('test-session-secret'), false);
    assert.equal(response.body.includes('never-expose-this'), false);
    assert.equal((await app.inject('/lykar-assets/dev/sdk.iife.js')).statusCode, 404);
  } finally {await app.close();}
});

test('development with missing/mixed files offers no snippet; complete files have proper MIME/CORS', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lykar-installation-'));
  const app = Fastify();
  await app.register(installationRoutes, {authService, appOrigin: 'http://localhost:3000', development: true, sdkDistDirectory: directory});
  try {
    assert.equal((await app.inject({url: '/api/admin/installation', headers})).json().reason, 'DEVELOPMENT_ASSETS_NOT_BUILT');
    assert.equal((await app.inject('/lykar-assets/dev/sdk.iife.js')).statusCode, 503);
    const files = ['sdk.iife.js', 'runtime-core.iife.js', 'editor.iife.js'];
    const assets: Record<string, unknown> = {};
    for (const file of files) {
      const contents = `/* ${file} */`;
      const hash = createHash('sha256').update(contents).digest('hex');
      assets[file] = {path: file, sha256: hash, integrity: `sha256-${Buffer.from(hash, 'hex').toString('base64')}`};
      await writeFile(join(directory, file), contents);
    }
    await writeFile(join(directory, 'asset-manifest.json'), JSON.stringify({schemaVersion: 1, package: '@lykar/sdk', packageVersion: '0.0.0', compatibility: {sdk: '0.0.0'}, assets}));
    const config = (await app.inject({url: '/api/admin/installation', headers})).json();
    assert.equal(config.status, 'configured');
    assert.equal(config.assets.sdkUrl, 'http://localhost:3000/lykar-assets/dev/sdk.iife.js');
    const manifest = await app.inject('/lykar-assets/dev/asset-manifest.json');
    assert.equal(manifest.statusCode, 200);
    assert.match(String(manifest.headers['content-type']), /application\/json/);
    assert.equal(manifest.headers['access-control-allow-origin'], '*');
    assert.equal(manifest.headers['cache-control'], 'no-store');
    assert.match(String((await app.inject('/lykar-assets/dev/sdk.iife.js')).headers['content-type']), /text\/javascript/);
    await writeFile(join(directory, files[1]), 'mixed runtime bytes');
    assert.equal((await app.inject({url: '/api/admin/installation', headers})).json().assets, null);
    assert.equal((await app.inject('/lykar-assets/dev/../package.json')).statusCode, 404);
  } finally {await app.close(); await rm(directory, {recursive: true, force: true});}
});
