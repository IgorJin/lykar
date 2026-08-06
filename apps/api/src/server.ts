import dotenv from 'dotenv';

import { buildApp } from './app';

dotenv.config();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const appOrigin = process.env.LYKAR_APP_ORIGIN ?? `http://localhost:${port}`;
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const server = buildApp({
  connectionString: process.env.DATABASE_URL,
  appOrigin,
  ownerEmail: process.env.LYKAR_OWNER_EMAIL ?? 'owner@lykar.local',
  allowedOrigins,
  logger: true,
  analyticsSigningSecret: process.env.LYKAR_ANALYTICS_SIGNING_SECRET,
});

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
