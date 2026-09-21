import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { OWNER_EMAIL, PROJECT_KEY } from '../apps/playground/scripts/fixture.mjs';
import { runSmoke } from '../apps/playground/scripts/smoke.mjs';
import { databaseUrlForRun, stopChild } from './e2e-process.mjs';
import { installSdkConsumer } from './sdk-consumer-fixture.mjs';

const repositoryDirectory = fileURLToPath(new URL('..', import.meta.url));
const smokeMode = process.argv.includes('--smoke');
const browserMode = process.argv.includes('--browser');
const isolatedMode = smokeMode || browserMode;
const isolatedPorts = isolatedMode ? await freePorts(browserMode ? 4 : 3) : [];
const apiPort = isolatedMode ? isolatedPorts[0] : Number(process.env.LYKAR_E2E_API_PORT ?? 3000);
const playgroundPort = isolatedMode ? isolatedPorts[1] : Number(process.env.LYKAR_E2E_PLAYGROUND_PORT ?? 4173);
const postgresPort = isolatedMode ? isolatedPorts[2] : Number(process.env.LYKAR_E2E_POSTGRES_PORT ?? 55432);
const magicApiPort = browserMode ? isolatedPorts[3] : undefined;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const playgroundBaseUrl = `http://127.0.0.1:${playgroundPort}`;
const magicApiBaseUrl = magicApiPort ? `http://127.0.0.1:${magicApiPort}` : undefined;
const temporaryDirectory = isolatedMode
  ? await mkdtemp(join(tmpdir(), 'lykar-e2e-'))
  : join(repositoryDirectory, '.lykar', 'e2e');
const postgresDirectory = join(temporaryDirectory, 'postgres');
const postgresLog = join(temporaryDirectory, 'postgres.log');
const magicLinkFile = join(temporaryDirectory, 'magic-links.ndjson');
const children = [];
const commands = new Set();
let ownsPostgres = false;
let postgresStopped = false;
let cleaning = false;
let cleanupPromise;
let childFailure;

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
process.on('SIGHUP', () => void shutdown(0));
process.on('exit', stopManagedPostgres);

try {
  await assertPortAvailable(apiPort, 'API');
  await assertPortAvailable(playgroundPort, 'playground');
  if (magicApiPort) await assertPortAvailable(magicApiPort, 'magic API');
  await mkdir(temporaryDirectory, { recursive: true });
  const sdkConsumerDirectory = await mkdtemp(join(temporaryDirectory, 'sdk-consumer-'));
  const databaseUrl = await databaseUrlForRun({ isolated: isolatedMode, environment: process.env, startLocalPostgres });
  await run('npm', ['run', 'build', '--workspace', '@lykar/admin']);
  await run('npm', ['run', 'build', '--workspace', '@lykar/sdk']);
  const { sdkDistDirectory } = await installSdkConsumer(repositoryDirectory, sdkConsumerDirectory);
  await run('npm', ['run', 'db:migrate'], { DATABASE_URL: databaseUrl });
  if (smokeMode) {
    await run('npm', ['test', '--workspace', 'lykar-lib-server'], { LYKAR_TEST_DATABASE_URL: databaseUrl });
  }
  await run('node', ['apps/playground/scripts/seed.mjs'], {
    DATABASE_URL: databaseUrl,
    LYKAR_PLAYGROUND_ORIGIN: playgroundBaseUrl,
  });

  children.push(start('api', 'node', ['apps/api/dist/server.js'], {
    DATABASE_URL: databaseUrl,
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    LYKAR_APP_ORIGIN: apiBaseUrl,
    LYKAR_OWNER_EMAIL: OWNER_EMAIL,
    LYKAR_DEV_AUTH: '1',
    LYKAR_MAGIC_LINK_FILE: '',
    CORS_ALLOWED_ORIGINS: `${playgroundBaseUrl},http://localhost:${playgroundPort}`,
    NODE_ENV: 'development',
  }));
  children.push(start('playground', 'node', ['apps/playground/server.mjs'], {
    LYKAR_PLAYGROUND_PORT: String(playgroundPort),
    LYKAR_API_BASE_URL: apiBaseUrl,
    LYKAR_PLAYGROUND_PROJECT_KEY: PROJECT_KEY,
    LYKAR_OWNER_EMAIL: OWNER_EMAIL,
    LYKAR_SDK_DIST_DIR: sdkDistDirectory,
  }));
  if (magicApiPort && magicApiBaseUrl) {
    children.push(start('magic-api', 'node', ['apps/api/dist/server.js'], {
      DATABASE_URL: databaseUrl,
      HOST: '127.0.0.1',
      PORT: String(magicApiPort),
      LYKAR_APP_ORIGIN: magicApiBaseUrl,
      LYKAR_OWNER_EMAIL: OWNER_EMAIL,
      LYKAR_DEV_AUTH: '0',
      LYKAR_MAGIC_LINK_FILE: magicLinkFile,
      NODE_ENV: 'test',
    }));
  }
  const ready = [
    waitFor(`${apiBaseUrl}/api/health`),
    ...['/admin', '/admin/', '/admin/app.js', '/admin/styles.css'].map(path => waitFor(`${apiBaseUrl}${path}`)),
    waitFor(`${playgroundBaseUrl}/lykar-config.json`),
    ...['/', '/pricing', '/sdk.iife.js', '/editor.iife.js', '/asset-manifest.json'].map(path => waitFor(`${playgroundBaseUrl}${path}`)),
  ];
  if (magicApiBaseUrl) ready.push(waitFor(`${magicApiBaseUrl}/api/health`));
  await Promise.all(ready);
  if (childFailure) throw childFailure;

  if (smokeMode) {
    const result = await runSmoke({ apiBaseUrl, playgroundBaseUrl });
    console.log(`\nLykar E2E smoke passed: version ${result.version}, release ${result.releaseId}`);
    await cleanup();
    process.exit(0);
  }

  if (browserMode) {
    console.log(`LYKAR_E2E_READY ${JSON.stringify({
      apiBaseUrl,
      magicApiBaseUrl,
      playgroundBaseUrl,
      magicLinkFile,
    })}`);
  } else {
    console.log(`
Lykar E2E stack is ready
  Admin:      ${apiBaseUrl}/admin/
  Playground: ${playgroundBaseUrl}/
  Pricing:    ${playgroundBaseUrl}/pricing
  Owner:      ${OWNER_EMAIL}

Use “Войти как локальный владелец” in Admin; no magic link is needed.
Press Ctrl+C to stop API, playground, and the managed PostgreSQL process.
`);
  }

  await new Promise((resolve, reject) => {
    if (childFailure) return reject(childFailure);
    for (const child of children) {
      child.once('exit', code => {
        if (cleaning) resolve();
        else reject(new Error(`A stack process exited unexpectedly with code ${code}`));
      });
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
  await mkdir(postgresDirectory, { recursive: true });
  if (!existsSync(join(postgresDirectory, 'PG_VERSION'))) {
    runSync('initdb', ['-D', postgresDirectory, '--auth=trust', '--no-locale', '--encoding=UTF8']);
  }
  const status = spawnSync('pg_ctl', ['-D', postgresDirectory, 'status'], { stdio: 'ignore' });
  const user = process.env.USER;
  if (!user) throw new Error('USER is required to connect to the local PostgreSQL cluster');
  const serverUrl = `postgres://${encodeURIComponent(user)}@127.0.0.1:${postgresPort}/postgres`;
  if (status.status === 0) {
    const reachable = spawnSync('psql', ['-d', serverUrl, '-tAc', 'SHOW data_directory'], {
      encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '3' },
    });
    const actualDirectory = reachable.status === 0 ? await realpath(reachable.stdout.trim()).catch(() => null) : null;
    if (actualDirectory !== await realpath(postgresDirectory)) {
      throw new Error(
        `The managed PostgreSQL data directory is already running on a different port; ` +
        `requested ${postgresPort}. Stop that stack or reuse its LYKAR_E2E_POSTGRES_PORT.`,
      );
    }
  } else {
    runSync('pg_ctl', [
      '-D', postgresDirectory,
      '-l', postgresLog,
      '-o', `-p ${postgresPort} -h 127.0.0.1`,
      'start',
    ]);
    ownsPostgres = true;
  }

  const databaseName = smokeMode ? 'lykar_smoke' : browserMode ? 'lykar_browser' : 'lykar_e2e';
  const exists = spawnSync('psql', ['-d', serverUrl, '-tAc', `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`], {
    encoding: 'utf8',
  });
  if (exists.status !== 0) throw new Error(`Cannot inspect local PostgreSQL: ${exists.stderr?.trim()}`);
  if (exists.stdout.trim() !== '1') {
    runSync('createdb', ['-h', '127.0.0.1', '-p', String(postgresPort), '-U', user, databaseName]);
  }
  return `postgres://${encodeURIComponent(user)}@127.0.0.1:${postgresPort}/${databaseName}`;
}

function run(command, args, extraEnvironment = {}) {
  if (cleaning) throw new Error('Stack is shutting down');
  // npm spawns compilers/tests: own their process group so cancellation also
  // stops descendants during startup, before any HTTP service is ready.
  const processGroup = process.platform !== 'win32';
  const child = spawn(command, args, {
    cwd: repositoryDirectory,
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit',
    detached: processGroup,
  });
  const entry = { child, processGroup };
  commands.add(entry);
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited (${signal ?? code})`));
    });
  }).finally(() => commands.delete(entry));
}

function runSync(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryDirectory,
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
  child.once('error', error => { childFailure = error; });
  child.once('exit', (code, signal) => {
    if (!cleaning) childFailure = new Error(`${label} exited unexpectedly (${signal ?? code})`);
  });
  return child;
}

async function waitFor(url) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (childFailure) throw childFailure;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* process is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function requireCommand(command) {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') {
      throw new Error(`${command} is required. Install PostgreSQL CLI tools; LYKAR_E2E_DATABASE_URL is supported only by dev:e2e.`);
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

async function assertPortAvailable(port, label) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`${label} port ${port} is already in use; choose another LYKAR_E2E_${label.toUpperCase()}_PORT.`));
      } else {
        reject(error);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(error => error ? reject(error) : resolve());
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
  if (cleanupPromise) return cleanupPromise;
  cleaning = true;
  cleanupPromise = (async () => {
    await Promise.all([
      ...children.map(child => stopChild(child)),
      ...[...commands].map(({ child, processGroup }) => stopChild(child, { processGroup })),
    ]);
    stopManagedPostgres();
    if (isolatedMode) await rm(temporaryDirectory, { recursive: true, force: true });
  })();
  return cleanupPromise;
}

function stopManagedPostgres() {
  if (!ownsPostgres || postgresStopped || !existsSync(join(postgresDirectory, 'PG_VERSION'))) return;
  const result = spawnSync('pg_ctl', ['-D', postgresDirectory, 'stop', '-m', 'fast'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Could not stop managed PostgreSQL; preserved ${postgresDirectory}`);
  postgresStopped = true;
}
