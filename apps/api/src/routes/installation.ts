import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {FastifyPluginAsync} from 'fastify';
import type {AuthService} from '../domain/auth';
import {installationConfig, type InstallationOptions} from '../config/installation';
import {createSessionGuard} from './auth';

const SDK_DIST = resolve(__dirname, '../../../../packages/sdk/dist');
const files = ['sdk.iife.js', 'runtime-core.iife.js', 'editor.iife.js', 'asset-manifest.json'] as const;

type Options = {authService: AuthService; appOrigin: string; development: boolean; installation?: InstallationOptions; sdkDistDirectory?: string};
const installationRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const sdkDist = options.development && options.sdkDistDirectory ? resolve(options.sdkDistDirectory) : SDK_DIST;
  const config = installationConfig(options.appOrigin, options.development, options.installation);
  app.get('/api/admin/installation', {preHandler: createSessionGuard(options.authService)}, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (config.assets?.mode === 'development') {
      try {
        const contents = await Promise.all(files.map(file => readFile(resolve(sdkDist, file))));
        const manifest = JSON.parse(contents[3].toString('utf8')) as {schemaVersion?: number; package?: string; packageVersion?: string; compatibility?: {sdk?: string}; assets?: Record<string, {path?: string; sha256?: string; integrity?: string}>};
        if (manifest.schemaVersion !== 1 || manifest.package !== '@lykar/sdk' || typeof manifest.packageVersion !== 'string'
          || manifest.compatibility?.sdk !== manifest.packageVersion) throw new Error('SDK manifest lacks compatibility metadata');
        for (let index = 0; index < 3; index++) {
          const entry = manifest.assets?.[files[index]];
          const hash = createHash('sha256').update(contents[index]);
          const hex = hash.digest('hex');
          const integrity = `sha256-${Buffer.from(hex, 'hex').toString('base64')}`;
          if (entry?.path !== files[index] || entry.sha256 !== hex || entry.integrity !== integrity) throw new Error('SDK files do not match the manifest');
        }
        return {...config, assets: {...config.assets, sdkVersion: manifest.packageVersion}};
      } catch {
        return {...config, status: 'unavailable', assets: null, reason: 'DEVELOPMENT_ASSETS_NOT_BUILT'};
      }
    }
    return config;
  });
  if (!options.development) return;
  for (const file of files) {
    app.get(`/lykar-assets/dev/${file}`, async (_request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Access-Control-Allow-Origin', '*');
      try {
        const content = await readFile(resolve(sdkDist, file));
        return reply.type(file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8').send(content);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return reply.code(503).send({error: {code: 'SDK_NOT_BUILT', message: 'Development SDK assets have not been built'}});
        }
        throw error;
      }
    });
  }
};
export default installationRoutes;
