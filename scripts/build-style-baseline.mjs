#!/usr/bin/env node
// Rebuild the accepted S1 revision with this checkout's installed toolchain.
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readdir, readlink, symlink, copyFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const revision = '70cd83c';
const directory = await mkdtemp(join(tmpdir(), 'lykar-style-baseline-'));
const archive = execFileSync('git', ['archive', revision], {cwd: root, maxBuffer: 50 * 1024 * 1024});
execFileSync('tar', ['-x', '-C', directory], {input: archive});
const modules = join(directory, 'node_modules');
await mkdir(modules);
for (const entry of await readdir(join(root, 'node_modules'), {withFileTypes: true})) {
  if (entry.name === '@lykar') continue;
  let source = join(root, 'node_modules', entry.name);
  if (entry.isSymbolicLink()) {
    const link = await readlink(source);
    if (link.startsWith('../packages/') || link.startsWith('../apps/')) source = resolve(modules, link);
  }
  await symlink(source, join(modules, entry.name));
}
await mkdir(join(modules, '@lykar'));
for (const name of await readdir(join(root, 'node_modules', '@lykar'))) {
  const target = await readlink(join(root, 'node_modules', '@lykar', name));
  await symlink(resolve(modules, '@lykar', target), join(modules, '@lykar', name));
}
// Apply the same production IIFE minifier to both revisions before comparing bytes.
await copyFile(join(root, 'packages/sdk/rollup.config.mjs'), join(directory, 'packages/sdk/rollup.config.mjs'));
execFileSync('npm', ['run', 'build', '--workspace', '@lykar/sdk'], {cwd: directory, stdio: ['ignore', 'inherit', 'inherit']});
const output = resolve(root, process.argv[2] ?? '.lykar/style-baseline');
await mkdir(output, {recursive: true});
for (const file of ['sdk.iife.js', 'editor.iife.js']) await copyFile(join(directory, 'packages/sdk/dist', file), join(output, file));
await writeFile(join(output, 'baseline.json'), JSON.stringify({revision: execFileSync('git', ['rev-parse', revision], {cwd: root, encoding: 'utf8'}).trim(), node: process.version, toolchain: 'Current installed node_modules and production SDK minifier; S1 source and other build scripts unchanged', output}, null, 2));
console.log(`Baseline written to ${output}`);
