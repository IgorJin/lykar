import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const temporary = await mkdtemp(join(tmpdir(), 'lykar-install-snippet-'));
try {
  const output = join(temporary, 'panel.mjs');
  await build({entryPoints: [resolve('apps/admin/src/installation-panel.tsx')], outfile: output,
    bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', jsxImportSource: 'preact', logLevel: 'silent'});
  const {installationSnippet} = await import(pathToFileURL(output).href);
  const project = {id: 'project-one', publicKey: 'pk_customer', name: 'Customer', origins: ['https://customer.example'], sessionToken: 'session-secret-never-copy'};
  const assets = {mode: 'versioned', sdkVersion: '0.0.0', sdkUrl: 'https://assets.example/0.0.0/sdk-0.0.0.iife.js',
    runtimeAssetUrl: 'https://assets.example/0.0.0/runtime-core-0.0.0.iife.js', editorAssetUrl: 'https://assets.example/0.0.0/editor-0.0.0.iife.js',
    assetManifestUrl: 'https://assets.example/0.0.0/asset-manifest.json', editorAssetOrigin: 'https://assets.example'};
  const config = {status: 'configured', apiBaseUrl: 'https://api.example', assets, privateToken: 'operator-secret-never-copy'};
  for (const framework of ['static', 'react', 'vue']) {
    const snippet = installationSnippet(project, config, framework);
    assert.ok(snippet.includes('pk_customer'));
    assert.ok(snippet.includes('https://api.example'));
    assert.ok(snippet.includes(assets.runtimeAssetUrl));
    assert.ok(snippet.includes(assets.editorAssetUrl));
    assert.ok(snippet.includes(assets.assetManifestUrl));
    assert.ok(snippet.includes("delivery: 'deployment'"));
    assert.equal(snippet.includes('secret-never-copy'), false);
    assert.equal(snippet.includes('localhost'), false);
    if (framework === 'static') {
      assert.ok(snippet.includes("frameworkMode: 'static'"));
      assert.equal(snippet.includes('data-lykar-project'), false);
      assert.equal((snippet.match(/void lykar.start/g) ?? []).length, 1);
    } else {
      assert.ok(snippet.includes('@lykar/frameworks/build'));
      assert.ok(snippet.includes('lykarVitePlugin()'));
      assert.equal(snippet.includes("frameworkMode: 'static'"), false);
    }
  }
  assert.equal(installationSnippet(project, {status: 'unavailable', apiBaseUrl: 'https://api.example', assets: null}, 'static'), '');
  const hostile = installationSnippet({...project, publicKey: '</script><script>alert(1)</script>'}, config, 'static');
  assert.equal(hostile.includes('</script><script>alert'), false);
  console.log('Installation snippets: static, React, Vue, fail-closed and secret/HTML escaping checks passed.');
} finally {
  await rm(temporary, {recursive: true, force: true});
}
