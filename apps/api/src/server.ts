import dotenv from 'dotenv';
import { appendFile } from 'node:fs/promises';

import { buildApp } from './app';

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
const devAuth = process.env.LYKAR_DEV_AUTH === '1';
const host = process.env.HOST ?? (devAuth ? '127.0.0.1' : '0.0.0.0');
if (devAuth && !isLoopbackHost(host)) {
  throw new Error('LYKAR_DEV_AUTH requires HOST to be localhost or a loopback address');
}
const appOrigin = process.env.LYKAR_APP_ORIGIN ?? `http://localhost:${port}`;
const magicLinkFile = process.env.LYKAR_MAGIC_LINK_FILE;
if (magicLinkFile && (process.env.NODE_ENV === 'production' || !isLoopbackHost(host))) {
  throw new Error('LYKAR_MAGIC_LINK_FILE is restricted to local non-production test servers');
}
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const server = buildApp({
  connectionString: process.env.DATABASE_URL,
  appOrigin,
  ownerEmail: process.env.LYKAR_OWNER_EMAIL ?? 'owner@lykar.local',
  devAuth,
  magicLinkSender: magicLinkFile ? {
    async send(input) {
      await appendFile(magicLinkFile, `${JSON.stringify(input)}\n`, { encoding: 'utf8', mode: 0o600 });
    },
  } : undefined,
  allowedOrigins,
  logger: true,
  analyticsSigningSecret: process.env.LYKAR_ANALYTICS_SIGNING_SECRET,
});

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  const octets = host.split('.').map(Number);
  return octets.length === 4 && octets[0] === 127
    && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255);
}

const start = async () => {
  try {
    await server.listen({ port, host });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}

start();
