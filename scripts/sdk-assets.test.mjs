import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {copyImmutable} from '../packages/sdk/scripts/immutable-copy.mjs';

test('versioned SDK assets cannot be overwritten with different content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lykar-immutable-assets-'));
  const source = join(directory, 'sdk.iife.js');
  const target = join(directory, 'sdk-1.0.0.iife.js');
  try {
    await writeFile(source, 'first build');
    await copyImmutable(source, target);
    await copyImmutable(source, target);
    assert.equal(await readFile(target, 'utf8'), 'first build');

    await writeFile(source, 'different build');
    await assert.rejects(
      copyImmutable(source, target),
      /Immutable Lykar asset conflict: sdk-1\.0\.0\.iife\.js/,
    );
    assert.equal(await readFile(target, 'utf8'), 'first build');
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
