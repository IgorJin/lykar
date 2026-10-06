import assert from 'node:assert/strict';
import test from 'node:test';
import {installationConfig} from './installation';

test('production missing release advertises no assets or localhost fallback', () => {
  const result = installationConfig('https://app.example.com', false, {}, {});
  assert.deepEqual(result, {status: 'unavailable', assets: null, apiBaseUrl: 'https://app.example.com', reason: 'RELEASE_ASSETS_NOT_CONFIGURED'});
});
test('release uses exact existing versioned build names and explicit public API', () => {
  const result = installationConfig('https://app.example.com', false, {
    apiBaseUrl: 'https://api.example.com', release: {version: '0.0.0', baseUrl: 'https://assets.example.com/lykar/0.0.0/'},
  }, {});
  assert.equal(result.assets?.sdkUrl, 'https://assets.example.com/lykar/0.0.0/sdk-0.0.0.iife.js');
  assert.equal(result.assets?.runtimeAssetUrl, 'https://assets.example.com/lykar/0.0.0/runtime-core-0.0.0.iife.js');
  assert.equal(result.assets?.editorAssetUrl, 'https://assets.example.com/lykar/0.0.0/editor-0.0.0.iife.js');
  assert.equal(result.assets?.assetManifestUrl, 'https://assets.example.com/lykar/0.0.0/asset-manifest.json');
  assert.equal(result.apiBaseUrl, 'https://api.example.com');
});
test('production rejects partial release, HTTP, credentials, query, fragment, mutable directory and loopback', () => {
  assert.throws(() => installationConfig('https://app.example.com', false, {}, {LYKAR_SDK_RELEASE_VERSION: '0.0.0'}));
  for (const baseUrl of ['http://assets.example.com/0.0.0/', 'https://user:secret@assets.example.com/0.0.0/', 'https://assets.example.com/0.0.0/?token=secret', 'https://assets.example.com/0.0.0/#x', 'https://assets.example.com/latest/', 'https://assets.example.com/0.0.0/latest/', 'https://localhost/0.0.0/', 'https://127.0.0.1/0.0.0/']) {
    assert.throws(() => installationConfig('https://app.example.com', false, {release: {version: '0.0.0', baseUrl}}, {}), baseUrl);
  }
  assert.throws(() => installationConfig('http://localhost:3000', false, {}, {}));
});
test('development advertises actual local API asset routes and does not trust request Host', () => {
  const result = installationConfig('http://127.0.0.1:3100', true, {}, {});
  assert.equal(result.assets?.sdkUrl, 'http://127.0.0.1:3100/lykar-assets/dev/sdk.iife.js');
  assert.equal(result.assets?.mode, 'development');
});
