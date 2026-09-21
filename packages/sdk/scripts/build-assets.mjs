import {createHash} from 'node:crypto';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {copyImmutable} from './immutable-copy.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(packageDir, 'dist');
const editorAsset = resolve(packageDir, '../editor-bridge/dist/editor.iife.js');
const editorTarget = join(distDir, 'editor.iife.js');

await mkdir(distDir, {recursive: true});
await copyFile(editorAsset, editorTarget);

const packageJson = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
const versionTag = packageJson.version.replace(/[^0-9A-Za-z.-]+/g, '-');
const runtimeJson = JSON.parse(await readFile(join(packageDir, '../runtime/package.json'), 'utf8'));
const editorJson = JSON.parse(await readFile(join(packageDir, '../editor-bridge/package.json'), 'utf8'));
const protocolJson = JSON.parse(await readFile(join(packageDir, '../protocol/package.json'), 'utf8'));
const versionedNames = {
  'index.js': `sdk-${versionTag}.esm.js`,
  'sdk.iife.js': `sdk-${versionTag}.iife.js`,
  'editor.iife.js': `editor-${versionTag}.iife.js`,
};

for (const [stableName, versionedName] of Object.entries(versionedNames)) {
  await copyImmutable(join(distDir, stableName), join(distDir, versionedName));
}

const assetNames = [...Object.keys(versionedNames), ...Object.values(versionedNames)];
const assets = {};

for (const name of assetNames) {
  const path = join(distDir, name);
  const content = await readFile(path);
  assets[name] = {
    path: basename(path),
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
    integrity: `sha256-${createHash('sha256').update(content).digest('base64')}`,
  };
}

for (const [stableName, versionedName] of Object.entries(versionedNames)) {
  assets[stableName].versionedPath = versionedName;
}

await writeFile(
  join(distDir, 'asset-manifest.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    package: packageJson.name,
    packageVersion: packageJson.version,
    compatibility: {
      sdk: packageJson.version,
      runtime: runtimeJson.version,
      editor: editorJson.version,
      protocol: protocolJson.version,
      protocolSchema: 1,
      pageRelease: 'external',
    },
    assets,
  }, null, 2)}\n`,
);
