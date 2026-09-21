let config;
let sdk;
let editor;

function writeStatus(value) {
  const output = document.querySelector('#draft-output');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function writeMissingEditorStatus() {
  const output = document.querySelector('#draft-output');
  if (!output) return;

  output.replaceChildren(document.createTextNode(
    'Editor capability отсутствует. Войдите в админку, выберите нужную страницу и нажмите «Открыть редактор».',
  ));
  const link = document.createElement('a');
  link.className = 'admin-link-button';
  link.href = config.adminUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = config.adminUrl;
  link.setAttribute('aria-label', 'Открыть админку');
  output.append(link);
}

function handleSdkResult(result) {
  window.__LYKAR_SDK_RESULT__ = result;
  window.__LYKAR_RUNTIME_REPORT__ = result.runtime;

  if (result.mode === 'share') {
    document.body.dataset.lykarMode = 'share';
    writeStatus({ mode: 'share', version: result.shareAccess?.version, report: result.runtime });
    return;
  }

  if (result.mode === 'editor') {
    document.body.dataset.lykarMode = 'editor';
    editor = result.editor;
    window.__LYKAR_EDITOR__ = editor;
    window.__LYKAR_EDITOR_CAPABILITY__ = result.capability;
    return;
  }

  document.body.dataset.lykarMode = result.mode === 'native' ? 'native' : 'runtime';
  if (result.mode === 'error') {
    writeStatus({error: result.error, reason: result.reason});
    return;
  }
  writeMissingEditorStatus();
}

async function boot() {
  config = await fetch('/lykar-config.json', {cache: 'no-store'}).then(response => response.json());
  sdk = new window.Lykar({
    projectKey: config.projectKey,
    apiBaseUrl: config.apiBaseUrl,
    delivery: 'links-only',
    analyticsConsent: 'granted',
    waitForDom: false,
    editorAssetUrl: new URL('/editor.iife.js', location.origin).toString(),
    editorAssetOrigin: location.origin,
    onReport(report) {
      window.__LYKAR_RUNTIME_REPORT__ = report;
    },
    onEditorApply(draft, report) {
      window.__LYKAR_LAST_DRAFT__ = draft;
      window.__LYKAR_LAST_REPORT__ = report;
    },
    onEditorCommit(result, draft) {
      writeStatus({
        saved: result.saved,
        revision: result.revision,
        pathname: draft.page.pathname,
        operationCount: draft.operations.length,
        operations: draft.operations,
      });
    },
  });
  window.__LYKAR_SDK__ = sdk;
  handleSdkResult(await sdk.start());
}

async function restartEditor() {
  if (!sdk) return;
  handleSdkResult(await sdk.refresh());
}

document.querySelector('#restart-editor')?.addEventListener('click', () => {
  restartEditor().catch(error => {
    console.error(error);
    writeStatus({error: error instanceof Error ? error.message : String(error)});
  });
});

boot().catch(error => {
  console.error(error);
  writeStatus({error: error instanceof Error ? error.message : String(error)});
});
