if (new URL(location.href).searchParams.get('s4_sdk') !== 'off') {
const config = await fetch('/lykar-config.json', {cache: 'no-store'}).then(response => response.json());
const sdk = new window.Lykar({
  projectKey: config.projectKey,
  apiBaseUrl: config.apiBaseUrl,
  delivery: new URL(location.href).searchParams.get('lykar_delivery') === 'deployment' ? 'deployment' : 'links-only',
  waitForDom: false,
  editorAssetUrl: new URL('/editor.iife.js', location.origin).toString(),
  editorAssetOrigin: location.origin,
  onReport(report) { window.__LYKAR_RUNTIME_REPORT__ = report; },
  onEditorApply(draft, report) {
    window.__LYKAR_LAST_DRAFT__ = draft;
    window.__LYKAR_LAST_REPORT__ = report;
  },
});
window.__LYKAR_SDK__ = sdk;
window.__LYKAR_SDK_RESULT__ = await sdk.start();

if (window.__LYKAR_SDK_RESULT__.editor) window.__LYKAR_EDITOR__ = window.__LYKAR_SDK_RESULT__.editor;

}
