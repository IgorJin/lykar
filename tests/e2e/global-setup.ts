import type { FullConfig } from '@playwright/test';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { stopChild } from '../../scripts/e2e-process.mjs';

type StackProcess = ChildProcessByStdio<null, Readable, Readable>;

const READY_PREFIX = 'LYKAR_E2E_READY ';

export default async function globalSetup(_config: FullConfig) {
  const child = spawn(process.execPath, ['scripts/e2e-stack.mjs', '--browser'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready: ReadyPayload;
  try {
    ready = await waitForReady(child);
  } catch (error) {
    await stopChild(child);
    throw error;
  }
  process.env.LYKAR_E2E_API_BASE_URL = ready.apiBaseUrl;
  process.env.LYKAR_E2E_MAGIC_API_BASE_URL = ready.magicApiBaseUrl;
  process.env.LYKAR_E2E_PLAYGROUND_BASE_URL = ready.playgroundBaseUrl;
  process.env.LYKAR_E2E_MAGIC_LINK_FILE = ready.magicLinkFile;

  return async () => {
    await stopChild(child);
  };
}

type ReadyPayload = {
  apiBaseUrl: string;
  magicApiBaseUrl: string;
  playgroundBaseUrl: string;
  magicLinkFile: string;
};

function waitForReady(child: StackProcess): Promise<ReadyPayload> {
  return new Promise((resolve, reject) => {
    let buffered = '';
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Timed out waiting for the browser E2E stack')), 120_000);
    const finish = (error?: Error, value?: ReadyPayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(value as ReadyPayload);
      }
    };
    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      process.stdout.write(text);
      buffered += text;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith(READY_PREFIX)) continue;
        try {
          finish(undefined, JSON.parse(line.slice(READY_PREFIX.length)) as ReadyPayload);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.once('error', error => finish(error));
    child.once('exit', code => finish(new Error(`Browser E2E stack exited before ready with code ${code}`)));
  });
}
