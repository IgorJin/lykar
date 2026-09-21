import {createHash, webcrypto} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

import {JSDOM} from 'jsdom';

import {installSdkConsumer} from './sdk-consumer-fixture.mjs';

const run = promisify(execFile);
const repositoryDirectory = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureDirectory = await mkdtemp(join(tmpdir(), 'lykar-sdk-consumer-'));

try {
  const installed = await installSdkConsumer(repositoryDirectory, fixtureDirectory);
  const commandEnvironment = {
    ...process.env,
    npm_config_cache: join(fixtureDirectory, 'npm-cache'),
  };

  await verifyTypes(commandEnvironment);
  await verifyServerImport(commandEnvironment);
  const manifest = await verifyPackedAssets(installed.sdkDistDirectory);
  await verifyNpmOptions(installed.sdkDistDirectory);
  await verifyBrowserWorkflow(installed.sdkDistDirectory, manifest);

  console.log('SDK consumer fixture passed');
} finally {
  await rm(fixtureDirectory, {recursive: true, force: true});
}

async function verifyTypes(environment) {
  const source = join(fixtureDirectory, 'consumer.ts');
  await writeFile(source, `
    import {Lykar, SDK_COMPATIBILITY, type LykarSdkResult} from '@lykar/sdk';
    const sdk = new Lykar({projectKey: 'pk_types', version: 1});
    const result: Promise<LykarSdkResult> = sdk.start();
    void SDK_COMPATIBILITY;
    void result;
  `);
  await run(process.execPath, [
    join(repositoryDirectory, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
    '--strict',
    '--target',
    'ES2022',
    '--module',
    'NodeNext',
    '--moduleResolution',
    'NodeNext',
    source,
  ], {cwd: fixtureDirectory, env: environment});
}

async function verifyServerImport(environment) {
  await run(process.execPath, ['--input-type=module', '-e', `
    import {Lykar, SDK_COMPATIBILITY} from '@lykar/sdk';
    if (typeof Lykar !== 'function') throw new Error('Lykar export is not constructible');
    if (SDK_COMPATIBILITY.sdk !== '0.0.0') throw new Error('Compatibility metadata is missing');
    const sdk = new Lykar({projectKey: 'pk_consumer'});
    if (typeof sdk.start !== 'function') throw new Error('SDK lifecycle is missing');
  `], {cwd: fixtureDirectory, env: environment});
}

async function verifyPackedAssets(distDirectory) {
  const manifest = JSON.parse(await readFile(join(distDirectory, 'asset-manifest.json'), 'utf8'));
  if (manifest.package !== '@lykar/sdk' || manifest.packageVersion !== manifest.compatibility?.sdk) {
    throw new Error('SDK asset manifest has incompatible package metadata');
  }

  for (const [name, asset] of Object.entries(manifest.assets ?? {})) {
    const content = await readFile(join(distDirectory, asset.path));
    const sha256 = createHash('sha256').update(content).digest('hex');
    const integrity = `sha256-${createHash('sha256').update(content).digest('base64')}`;
    if (sha256 !== asset.sha256 || integrity !== asset.integrity || content.byteLength !== asset.bytes) {
      throw new Error(`Packed asset metadata does not match ${name}`);
    }
    if (asset.versionedPath) {
      const versioned = await readFile(join(distDirectory, asset.versionedPath));
      if (!versioned.equals(content)) throw new Error(`Versioned asset differs from ${name}`);
    }
  }
  return manifest;
}

async function verifyNpmOptions(distDirectory) {
  const {Lykar} = await import(pathToFileURL(join(distDirectory, 'index.js')).href);
  for (const options of [
    {version: 3},
    {variantToken: 'variant-from-options'},
    {experimentToken: 'experiment-from-options'},
  ]) {
    const dom = new JSDOM('<main>Original</main>', {url: 'https://host.test/'});
    let requestCount = 0;
    const request = async () => {
      requestCount += 1;
      return new Response(null, {status: 204});
    };
    const result = await new Lykar({
      projectKey: 'pk_consumer',
      document: dom.window.document,
      fetch: request,
      ...options,
    }).start();
    if (result.mode === 'native' && result.reason === 'LINKS_ONLY_NATIVE') {
      throw new Error('An npm option selector was ignored');
    }
    if (requestCount !== 1) throw new Error('An npm option selector did not start the runtime');
    dom.window.close();
  }
}

async function verifyBrowserWorkflow(distDirectory, manifest) {
  const sdkSource = await readFile(join(distDirectory, 'sdk.iife.js'), 'utf8');
  const editorSource = await readFile(join(distDirectory, 'editor.iife.js'), 'utf8');
  const dom = new JSDOM(`<!doctype html><body><main>Original</main><script
    src="/assets/sdk.iife.js"
    data-lykar-project="pk_consumer"
    data-lykar-api="https://api.test"
  ></script></body>`, {
    url: 'https://host.test/#lykar_edit=editor-code',
    runScripts: 'outside-only',
  });
  const {window} = dom;
  const script = window.document.querySelector('script');
  const loadedScripts = [];
  Object.defineProperty(window.document, 'currentScript', {
    configurable: true,
    get: () => script,
  });
  window.Response = Response;
  window.Request = Request;
  window.Headers = Headers;
  Object.defineProperty(window, 'crypto', {configurable: true, value: webcrypto});
  window.fetch = async input => {
    const url = String(input);
    if (url === 'https://api.test/api/editor/exchange') {
      return jsonResponse({capability: {
        token: 'x'.repeat(48),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        projectId: 'project-consumer',
        pageUrl: 'https://host.test/',
        draftId: 'draft-consumer',
        expectedRevision: 0,
        baseVersion: null,
      }});
    }
    if (url === 'https://host.test/assets/asset-manifest.json') {
      return jsonResponse(manifest);
    }
    if (url === 'https://api.test/api/editor/drafts/draft-consumer') {
      return jsonResponse({draft: {revision: 0}, operations: []});
    }
    throw new Error(`Unexpected browser fixture request: ${url}`);
  };

  const observer = new window.MutationObserver(records => {
    for (const node of records.flatMap(record => [...record.addedNodes])) {
      if (!(node instanceof window.HTMLScriptElement) || node.dataset.lykarEditorAsset !== 'true') continue;
      loadedScripts.push({src: node.src, integrity: node.integrity});
      window.eval(editorSource);
      node.dispatchEvent(new window.Event('load'));
    }
  });
  observer.observe(window.document.documentElement, {childList: true, subtree: true});

  window.eval(sdkSource);
  const result = await window.__LYKAR_SDK__.start();
  const expectedIntegrity = manifest.assets['editor.iife.js'].integrity;
  if (result.mode !== 'editor' || !result.editor) {
    throw new Error(
      `One-script browser workflow did not enter editor mode: ${result.reason ?? result.mode}` +
      `${result.error ? ` (${result.error})` : ''}`,
    );
  }
  if (
    loadedScripts.length !== 1 ||
    loadedScripts[0].src !== 'https://host.test/assets/editor.iife.js' ||
    loadedScripts[0].integrity !== expectedIntegrity
  ) {
    throw new Error('One-script browser workflow did not load the verified sibling editor asset');
  }

  result.editor.destroy?.();
  observer.disconnect();
  window.close();
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {'content-type': 'application/json'},
  });
}
