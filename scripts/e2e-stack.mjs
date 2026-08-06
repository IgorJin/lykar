import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { OWNER_EMAIL, PROJECT_KEY } from '../apps/playground/scripts/fixture.mjs';
import { runSmoke } from '../apps/playground/scripts/smoke.mjs';

const repositoryDirectory = fileURLToPath(new URL('..', import.meta.url));
const smokeMode = process.argv.includes('--smoke');
const smokePorts = smokeMode ? await freePorts(3) : [];
const apiPort = smokeMode ? smokePorts[0] : Number(process.env.LYKAR_E2E_API_PORT ?? 3000);
const playgroundPort = smokeMode ? smokePorts[1] : Number(process.env.LYKAR_E2E_PLAYGROUND_PORT ?? 4173);
const postgresPort = smokeMode ? smokePorts[2] : Number(process.env.LYKAR_E2E_POSTGRES_PORT ?? 55432);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const playgroundBaseUrl = `http://127.0.0.1:${playgroundPort}`;
const temporaryDirectory = smokeMode
  ? await mkdtemp(join(tmpdir(), 'lykar-e2e-'))
  : join(repositoryDirectory, '.lykar', 'e2e');
const postgresDirectory = join(temporaryDirectory, 'postgres');
const postgresLog = join(temporaryDirectory, 'postgres.log');
const children = [];
let ownsPostgres = false;
let postgresStopped = false;
let cleaning = false;

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
process.on('SIGHUP', () => void shutdown(0));
process.on('exit', stopManagedPostgres);

try {
  await mkdir(temporaryDirectory, { recursive: true });
  const databaseUrl = process.env.LYKAR_E2E_DATABASE_URL ?? await startLocalPostgres();
  run('npm', ['run', 'build', '--workspace', '@lykar/admin']);
  run('npm', ['run', 'build', '--workspace', '@lykar/editor-bridge']);
  run('npm', ['run', 'db:migrate'], { DATABASE_URL: databaseUrl });
  if (smokeMode) {
    run('npm', ['test', '--workspace', 'lykar-lib-server'], { LYKAR_TEST_DATABASE_URL: databaseUrl });
  }
  run('node', ['apps/playground/scripts/seed.mjs'], {
    DATABASE_URL: databaseUrl,
    LYKAR_PLAYGROUND_ORIGIN: playgroundBaseUrl,
  });

  children.push(start('api', 'node', ['apps/api/dist/server.js'], {
    DATABASE_URL: databaseUrl,
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    LYKAR_APP_ORIGIN: apiBaseUrl,
    LYKAR_OWNER_EMAIL: OWNER_EMAIL,
    CORS_ALLOWED_ORIGINS: `${playgroundBaseUrl},http://localhost:${playgroundPort}`,
    NODE_ENV: 'development',
  }));
  children.push(start('playground', 'node', ['apps/playground/server.mjs'], {
    LYKAR_PLAYGROUND_PORT: String(playgroundPort),
    LYKAR_API_BASE_URL: apiBaseUrl,
    LYKAR_PLAYGROUND_PROJECT_KEY: PROJECT_KEY,
    LYKAR_OWNER_EMAIL: OWNER_EMAIL,
  }));
  await Promise.all([
    waitFor(`${apiBaseUrl}/api/health`),
    waitFor(`${playgroundBaseUrl}/lykar-config.json`),
  ]);

  if (smokeMode) {
    const result = await runSmoke({ apiBaseUrl, playgroundBaseUrl });
    console.log(`\nLykar E2E smoke passed: version ${result.version}, release ${result.releaseId}`);
    await cleanup();
    process.exit(0);
  }

  console.log(`
Lykar E2E stack is ready
  Admin:      ${apiBaseUrl}/admin/
  Playground: ${playgroundBaseUrl}/
  Pricing:    ${playgroundBaseUrl}/pricing
  Owner:      ${OWNER_EMAIL}

Request a magic link in Admin; it will appear in this terminal.
Press Ctrl+C to stop API, playground, and the managed PostgreSQL process.
`);

  await new Promise((resolve, reject) => {
    for (const child of children) {
      child.once('exit', code => reject(new Error(`A stack process exited unexpectedly with code ${code}`)));
    }
  });
} catch (error) {
  console.error(`\nLykar E2E failed: ${error instanceof Error ? error.message : String(error)}`);
  await cleanup();
  process.exit(1);
}

async function startLocalPostgres() {
  requireCommand('initdb');
  requireCommand('pg_ctl');
  requireCommand('psql');
  requireCommand('createdb');
  ownsPostgres = true;
  await mkdir(postgresDirectory, { recursive: true });
  if (!existsSync(join(postgresDirectory, 'PG_VERSION'))) {
    run('initdb', ['-D', postgresDirectory, '--auth=trust', '--no-locale', '--encoding=UTF8']);
  }
  const status = spawnSync('pg_ctl', ['-D', postgresDirectory, 'status'], { stdio: 'ignore' });
  if (status.status !== 0) {
    run('pg_ctl', [
      '-D', postgresDirectory,
      '-l', postgresLog,
      '-o', `-p ${postgresPort} -h 127.0.0.1`,
      'start',
    ]);
  }

  const user = process.env.USER;
  if (!user) throw new Error('USER is required to connect to the local PostgreSQL cluster');
  const serverUrl = `postgres://${encodeURIComponent(user)}@127.0.0.1:${postgresPort}/postgres`;
  const databaseName = smokeMode ? 'lykar_smoke' : 'lykar_e2e';
  const exists = spawnSync('psql', ['-d', serverUrl, '-tAc', `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`], {
    encoding: 'utf8',
  });
  if (exists.status !== 0) throw new Error(`Cannot inspect local PostgreSQL: ${exists.stderr?.trim()}`);
  if (exists.stdout.trim() !== '1') {
    run('createdb', ['-h', '127.0.0.1', '-p', String(postgresPort), '-U', user, databaseName]);
  }
  return `postgres://${encodeURIComponent(user)}@127.0.0.1:${postgresPort}/${databaseName}`;
}

function run(command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with code ${result.status}`);
}

function start(label, command, args, extraEnvironment) {
  const child = spawn(command, args, {
    cwd: repositoryDirectory,
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit',
  });
  child.once('error', error => console.error(`${label}: ${error.message}`));
  return child;
}

async function waitFor(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* process is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function requireCommand(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${command} is required. Install PostgreSQL or set LYKAR_E2E_DATABASE_URL.`);
  }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('Could not allocate a local port'));
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function freePorts(count) {
  const ports = new Set();
  while (ports.size < count) ports.add(await freePort());
  return [...ports];
}

async function shutdown(code) {
  await cleanup();
  process.exit(code);
}

async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  await new Promise(resolve => setTimeout(resolve, 200));
  stopManagedPostgres();
  if (smokeMode) await rm(temporaryDirectory, { recursive: true, force: true });
}

function stopManagedPostgres() {
  if (!ownsPostgres || postgresStopped || !existsSync(join(postgresDirectory, 'PG_VERSION'))) return;
  postgresStopped = true;
  spawnSync('pg_ctl', ['-D', postgresDirectory, 'stop', '-m', 'fast'], { stdio: 'inherit' });
}
