#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gzipSync, brotliCompressSync, constants as zlibConstants} from 'node:zlib';
import {dirname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = parseArgs(process.argv.slice(2));
const sdkDist = resolve(repositoryRoot, options.sdkDir ?? 'packages/sdk/dist');
const bridgeDist = resolve(repositoryRoot, options.bridgeDir ?? 'packages/editor-bridge/dist');
const uiSource = resolve(repositoryRoot, 'packages/editor-ui/src/index.ts');
if (options.help) {
  process.stdout.write([
    'Usage: node scripts/style-editor-budget.mjs [options]',
    '  --artifacts-only       Read existing dist files only; skip the in-memory UI bundle.',
    '  --baseline-dir <path>  Compare against sdk.iife.js, editor.iife.js, and optional editor-ui.iife.js.',
    '  --sdk-dir <path>       SDK dist directory (default: packages/sdk/dist).',
    '  --bridge-dir <path>    Editor bridge dist directory (default: packages/editor-bridge/dist).',
  ].join('\n') + '\n');
  process.exit(0);
}

const sdkPackage = await readJson(resolve(repositoryRoot, 'packages/sdk/package.json'));
const bridgePackage = await readJson(resolve(repositoryRoot, 'packages/editor-bridge/package.json'));
const uiPackage = await readJson(resolve(repositoryRoot, 'packages/editor-ui/package.json'));
const runtimePackage = await readJson(resolve(repositoryRoot, 'packages/runtime/package.json'));
const protocolPackage = await readJson(resolve(repositoryRoot, 'packages/protocol/package.json'));

const manifest = await readJson(resolve(sdkDist, 'asset-manifest.json'));
const manifestAssets = await measureManifestAssets(sdkDist, manifest);
const sdkIife = await measureFile(resolve(sdkDist, 'sdk.iife.js'));
const deliveredEditorIife = await measureFile(resolve(sdkDist, 'editor.iife.js'));
const bridgeEditorIife = await measureFile(resolve(bridgeDist, 'editor.iife.js')).catch(() => null);
const sdkMap = await readSourceMap(resolve(sdkDist, 'sdk.iife.js.map'));
const editorMap = await readSourceMap(resolve(bridgeDist, 'editor.iife.js.map'));
const sdkSource = await readFile(resolve(repositoryRoot, 'packages/sdk/src/sdk.ts'), 'utf8');

const graphAudit = auditGraphs({
  sdkMap,
  editorMap,
  sdkPackage,
  bridgePackage,
  uiPackage,
  runtimePackage,
  protocolPackage,
  sdkSource,
});

let standaloneUi = null;
if (!options.artifactsOnly) {
  const esbuild = await import('esbuild');
  standaloneUi = await buildProbe(esbuild, {
    absWorkingDir: repositoryRoot,
    entryPoints: [uiSource],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'LykarStyleEditorUiBudgetProbe',
    target: 'es2018',
    minify: true,
    legalComments: 'none',
    write: false,
    metafile: true,
  });
}

const baseline = options.baselineDir
  ? await measureBaseline(resolve(repositoryRoot, options.baselineDir))
  : null;

const report = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    compression: {gzipLevel: 9, brotliQuality: 11},
  },
  inputs: {
    sdkDist: relative(repositoryRoot, sdkDist),
    bridgeDist: relative(repositoryRoot, bridgeDist),
    measurementOnly: options.artifactsOnly,
    baselineDir: options.baselineDir ?? null,
  },
  currentDelivery: {
    visitorEntry: sdkIife,
    lazyEditorAsset: deliveredEditorIife,
    bridgeEditorAsset: bridgeEditorIife,
    bridgeCopyMatchesSdkDelivery: bridgeEditorIife?.sha256 === deliveredEditorIife.sha256,
    existingSdkPerformanceBudget: {
      rawBytes: 80_000,
      gzipBytes: 25_000,
      rawOverBy: Math.max(0, sdkIife.rawBytes - 80_000),
      gzipOverBy: Math.max(0, sdkIife.gzipBytes - 25_000),
      source: 'packages/sdk/scripts/measure-performance.mjs',
    },
    manifest: {
      package: manifest.package,
      packageVersion: manifest.packageVersion,
      logicalAssetCount: Object.keys(manifest.assets ?? {}).length,
      uniquePayloadCount: manifestAssets.uniquePayloadCount,
      assets: manifestAssets.assets,
    },
    standaloneStyleUi: standaloneUi,
    sourceMapModuleGraph: {
      sdk: summarizeSourceMap(sdkMap),
      editor: summarizeSourceMap(editorMap),
    },
  },
  dependencyAndLazyLoadAudit: graphAudit,
  comparison: baseline
    ? compareArtifacts({sdkIife, deliveredEditorIife, standaloneUi}, baseline)
    : {
        available: false,
        reason: 'No pre-UI baseline directory was supplied. Pass --baseline-dir with sdk.iife.js and editor.iife.js; an optional editor-ui.iife.js enables the standalone UI comparison.',
      },
  criteria: {
    uiGzipBudgetBytes: 20 * 1024,
    selectionAndInputPreviewP95Ms: 50,
    visitorEntryUiDeltaBytes: 0,
    note: 'Targets are reported for review; this script does not infer a baseline or convert browser timing into a pass/fail gate.',
  },
};

const auditFailures = [];
if (!report.dependencyAndLazyLoadAudit.sdkMapExcludesEditorUi) auditFailures.push('SDK bundle source map includes editor UI/bridge modules');
if (!report.dependencyAndLazyLoadAudit.editorMapIncludesEditorUi) auditFailures.push('Editor bundle source map does not include editor UI modules');
if (!report.dependencyAndLazyLoadAudit.sdkUsesLazyEditorScript) auditFailures.push('SDK lazy editor script path could not be confirmed');
if (!report.currentDelivery.bridgeCopyMatchesSdkDelivery) auditFailures.push('SDK-delivered editor asset differs from editor-bridge build output');
if (!report.currentDelivery.manifest.assets.every(asset => asset.integrityMatches && asset.bytesMatch)) auditFailures.push('SDK asset manifest has stale byte or integrity metadata');
if (sdkMap?.drift.length) auditFailures.push('SDK source map does not match one or more current source files');
if (editorMap?.drift.length) auditFailures.push('Editor source map does not match one or more current source files');
if (auditFailures.length) report.auditFailures = auditFailures;

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (auditFailures.length) process.exitCode = 1;

function parseArgs(args) {
  const parsed = {artifactsOnly: false};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      parsed.help = true;
      continue;
    }
    if (argument === '--artifacts-only') {
      parsed.artifactsOnly = true;
      continue;
    }
    if (argument === '--sdk-dir' || argument === '--bridge-dir' || argument === '--baseline-dir') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      parsed[argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return parsed;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function measureFile(path) {
  const bytes = await readFile(path);
  return describeBytes(bytes, relative(repositoryRoot, path));
}

function describeBytes(bytes, path) {
  return {
    path,
    rawBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes, {level: 9}).byteLength,
    brotliBytes: brotliCompressSync(bytes, {
      params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11},
    }).byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function measureManifestAssets(distDirectory, assetManifest) {
  const assets = [];
  const seen = new Set();
  for (const [name, entry] of Object.entries(assetManifest.assets ?? {})) {
    const path = resolve(distDirectory, entry.path);
    if (path !== distDirectory && !path.startsWith(`${distDirectory}${sep}`)) {
      throw new Error(`Asset manifest path escapes SDK dist: ${entry.path}`);
    }
    const bytes = await readFile(path);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const item = {
      name,
      file: entry.path,
      bytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, {level: 9}).byteLength,
      brotliBytes: brotliCompressSync(bytes, {
        params: {[zlibConstants.BROTLI_PARAM_QUALITY]: 11},
      }).byteLength,
      bytesMatch: bytes.byteLength === entry.bytes,
      integrityMatches: sha256 === entry.sha256,
      sha256,
    };
    assets.push(item);
    seen.add(sha256);
  }
  return {assets, uniquePayloadCount: seen.size};
}

async function readSourceMap(path) {
  try {
    const sourceMap = JSON.parse(await readFile(path, 'utf8'));
    const drift = [];
    for (let index = 0; index < (sourceMap.sources ?? []).length; index += 1) {
      const source = sourceMap.sources[index];
      const embedded = sourceMap.sourcesContent?.[index];
      if (embedded === undefined || embedded === null) continue;
      const sourcePath = resolve(dirname(path), sourceMap.sourceRoot ?? '', source);
      try {
        const disk = await readFile(sourcePath, 'utf8');
        if (disk !== embedded) drift.push(relative(repositoryRoot, sourcePath));
      } catch {
        drift.push(`${source} (source unavailable)`);
      }
    }
    return {path: relative(repositoryRoot, path), sources: sourceMap.sources ?? [], drift};
  } catch {
    return null;
  }
}

function summarizeSourceMap(sourceMap) {
  if (!sourceMap) return {available: false};
  const sources = sourceMap.sources;
  return {
    available: true,
    sourceCount: sources.length,
    moduleGroups: {
      editorUi: sources.filter(source => /editor-ui/i.test(source)).length,
      editorBridge: sources.filter(source => /editor-bridge|\/src\/(editor|panel|inspector|session)\.ts/i.test(source)).length,
      protocol: sources.filter(source => /protocol/i.test(source)).length,
      runtime: sources.filter(source => /runtime/i.test(source)).length,
      thirdParty: sources.filter(source => /node_modules|npm\//i.test(source)).length,
    },
    sourceDriftCount: sourceMap.drift.length,
    sourceDrift: sourceMap.drift,
  };
}

function auditGraphs({sdkMap, editorMap, sdkPackage, bridgePackage, uiPackage, runtimePackage, protocolPackage, sdkSource}) {
  const sdkSources = sdkMap?.sources ?? [];
  const editorSources = editorMap?.sources ?? [];
  const editorSlice = sdkSource.match(/private async startEditor\([\s\S]*?private async loadEditorApi\(/)?.[0] ?? '';
  const scriptLoaderSlice = sdkSource.match(/private async loadEditorApi\([\s\S]*?private async resolveEditorAsset\(/)?.[0] ?? '';
  const packages = [sdkPackage, bridgePackage, uiPackage, runtimePackage, protocolPackage];
  const externalRuntimeDependencies = packages.flatMap(packageJson =>
    Object.entries(packageJson.dependencies ?? {})
      .filter(([name]) => !name.startsWith('@lykar/'))
      .map(([name, version]) => ({from: packageJson.name, name, version})),
  );
  return {
    workspaceProductionDependencies: Object.fromEntries(packages.map(packageJson => [
      packageJson.name,
      packageJson.dependencies ?? {},
    ])),
    externalRuntimeDependencies,
    bundledThirdPartySourceModules: editorSources.filter(source => /node_modules|npm\//i.test(source)),
    sdkMapExcludesEditorUi: sdkMap !== null && !sdkSources.some(source => /editor-ui|editor-bridge/i.test(source)),
    editorMapIncludesEditorUi: editorMap !== null && editorSources.some(source => /editor-ui/i.test(source)),
    sdkUsesLazyEditorScript: Boolean(
      editorSlice.includes('resolveEditorAsset(document, context)') &&
      editorSlice.includes('loadEditorApi(document, editorAsset, context)') &&
      scriptLoaderSlice.includes("createElement('script')") &&
      scriptLoaderSlice.includes('script.src = editorAsset.url'),
    ),
    editorAssetHasSeparateStylesheet: editorSources.some(source => /\.css(?:\?|$)/i.test(source)),
    notes: [
      'Source-map module lists describe the on-disk production artifacts; zero npm source entries means no third-party module was bundled into the current IIFE.',
      'The standalone UI probe is generated in memory from current workspace sources. It is a diagnostic component size, not an additive chunk in the delivered editor asset.',
    ],
  };
}

async function buildProbe(esbuild, buildOptions) {
  const result = await esbuild.build(buildOptions);
  const output = result.outputFiles.find(file => file.path.endsWith('.js')) ?? result.outputFiles[0];
  return {
    ...describeBytes(output.contents, 'in-memory probe'),
    inputCount: Object.keys(result.metafile.inputs).length,
    thirdPartyInputs: Object.keys(result.metafile.inputs).filter(path => /node_modules/.test(path)),
  };
}

async function measureBaseline(directory) {
  const baselineFiles = {
    sdkIife: 'sdk.iife.js',
    deliveredEditorIife: 'editor.iife.js',
    standaloneUi: 'editor-ui.iife.js',
  };
  const measured = {};
  for (const [key, file] of Object.entries(baselineFiles)) {
    try {
      measured[key] = await measureFile(resolve(directory, file));
    } catch {
      measured[key] = null;
    }
  }
  return {directory: relative(repositoryRoot, directory), artifacts: measured};
}

function compareArtifacts(current, baseline) {
  const comparisons = {};
  for (const key of ['sdkIife', 'deliveredEditorIife', 'standaloneUi']) {
    const before = baseline.artifacts[key];
    const after = current[key];
    comparisons[key] = before && after
      ? {
          available: true,
          rawDeltaBytes: after.rawBytes - before.rawBytes,
          gzipDeltaBytes: after.gzipBytes - before.gzipBytes,
          brotliDeltaBytes: after.brotliBytes - before.brotliBytes,
          before,
          after,
        }
      : {available: false, beforeAvailable: Boolean(before), afterAvailable: Boolean(after)};
  }
  return {available: true, baseline, artifacts: comparisons};
}
