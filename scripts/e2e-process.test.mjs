import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { databaseUrlForRun, stopChild } from './e2e-process.mjs';

test('isolated runs never use inherited working database URLs', async () => {
  let localStarts = 0;
  const environment = { DATABASE_URL: 'working-db', LYKAR_E2E_DATABASE_URL: 'working-e2e-db', LYKAR_TEST_DATABASE_URL: 'working-test-db' };
  const url = await databaseUrlForRun({ isolated: true, environment, startLocalPostgres() { localStarts++; return 'temporary-db'; } });
  assert.equal(url, 'temporary-db');
  assert.equal(localStarts, 1);
});

test('dev mode preserves explicit existing database support', async () => {
  const url = await databaseUrlForRun({ isolated: false, environment: { LYKAR_E2E_DATABASE_URL: 'dev-db' }, startLocalPostgres() { throw new Error('must not start'); } });
  assert.equal(url, 'dev-db');
});

test('cleanup waits for graceful exit instead of a fixed 200 ms sleep', async () => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => setTimeout(() => process.exit(0), 300)); console.log('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await once(child.stdout, 'data');
    await stopChild(child);
    assert.equal(child.exitCode, 0);
    await stopChild(child); // repeated cleanup is safe
  } finally { if (child.exitCode === null) child.kill('SIGKILL'); }
});

test('cleanup signals the compiler subprocess as well as its npm parent', { skip: process.platform === 'win32' }, async () => {
  const script = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e',
      "process.on('SIGTERM', () => process.exit(0)); console.log('ready'); setInterval(() => {}, 1000)"
    ], { stdio: 'inherit' });
    process.on('SIGTERM', () => {});
    child.once('exit', code => process.exit(code));
  `;
  const child = spawn(process.execPath, ['-e', script], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await once(child.stdout, 'data');
    await stopChild(child, { processGroup: true });
    assert.equal(child.exitCode, 0);
  } finally {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
});
