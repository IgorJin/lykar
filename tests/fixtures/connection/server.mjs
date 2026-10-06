/** Controlled local-only browser fixture; no external site is fetched. */
export function renderConnectionFixture(pathname, apiBaseUrl, projectKey) {
  if (!pathname.startsWith('/__e2e__/connection/')) return null;
  const scenario = pathname.split('/')[3];
  const csp = scenario === 'csp-connect' ? "connect-src 'self'"
    : scenario === 'csp-script' ? "script-src 'nonce-lykar-fixture'"
    : scenario === 'csp-style' ? "style-src 'none'" : undefined;
  const options = {
    projectKey: scenario === 'wrong-key' ? 'pk_wrong_site' : projectKey,
    apiBaseUrl, mode: 'native', frameworkMode: scenario === 'streaming' ? 'streaming' : 'static',
    editorAssetUrl: scenario === 'editor-missing' ? '/missing-editor.iife.js' : '/editor.iife.js',
    runtimeAssetUrl: scenario === 'runtime-missing' ? '/missing-runtime.iife.js' : '/runtime-core.iife.js',
    assetManifestUrl: '/asset-manifest.json', networkTimeoutMs: 1500, runtimeAssetTimeoutMs: 2000, editorAssetTimeoutMs: 2000,
  };
  const json = JSON.stringify(options).replace(/</g, '\\u003c');
  return { csp, html: `<!doctype html><html><head><meta charset="utf-8"><title>Connection fixture</title></head><body><h1>Original host content</h1>
    ${scenario === 'missing-sdk' ? '' : `<script nonce="lykar-fixture" src="/sdk.iife.js"></script><script nonce="lykar-fixture">window.siteSdk=new Lykar(${json});window.siteSdk.start();</script>`}
    </body></html>` };
}
