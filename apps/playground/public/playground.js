let editor;
let editorCapability;
let config;

function writeStatus(value) {
  const output = document.querySelector('#draft-output');
  if (output) output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function loadRuntime(accessToken, version) {
  const runtime = new window.Lykar({
    projectKey: config.projectKey,
    apiBaseUrl: config.apiBaseUrl,
    accessToken,
    version,
    waitForDom: false,
    onReport(report) {
      window.__LYKAR_RUNTIME_REPORT__ = report;
    },
  });
  try {
    return await runtime.start();
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

function startPlaygroundEditor() {
  if (!editorCapability) {
    writeStatus(`Editor capability отсутствует. Откройте ${config.adminUrl} и нажмите «Открыть редактор».`);
    return;
  }
  editor?.destroy();
  editor = window.LykarEditor.start({
    capability: editorCapability,
    onApply(draft, report) {
      window.__LYKAR_LAST_DRAFT__ = draft;
      window.__LYKAR_LAST_REPORT__ = report;
    },
    onCommit(result, draft) {
      writeStatus({
        saved: result.saved,
        revision: result.revision,
        pathname: draft.page.pathname,
        operationCount: draft.operations.length,
        operations: draft.operations,
      });
    },
  });
  window.__LYKAR_EDITOR__ = editor;
}

async function boot() {
  config = await fetch('/lykar-config.json', { cache: 'no-store' }).then(response => response.json());
  const editorAccess = await window.LykarEditor.exchangeEditorLaunch({ apiBaseUrl: config.apiBaseUrl });
  const shareAccess = editorAccess
    ? null
    : await window.LykarEditor.exchangeShareAccess({ apiBaseUrl: config.apiBaseUrl });
  const requestedVersion = new URLSearchParams(location.search).get('version');
  const version = shareAccess?.version ?? (requestedVersion ? Number(requestedVersion) : undefined);
  const accessToken = editorAccess?.token ?? shareAccess?.token;

  const report = await loadRuntime(accessToken, version);
  if (shareAccess) {
    document.body.dataset.lykarMode = 'share';
    writeStatus({ mode: 'share', version: shareAccess.version, report });
    return;
  }

  if (editorAccess) {
    document.body.dataset.lykarMode = 'editor';
    editorCapability = editorAccess;
    startPlaygroundEditor();
    return;
  }

  document.body.dataset.lykarMode = 'runtime';
  writeStatus(report
    ? { mode: 'runtime', version: report.version, report }
    : `Активного release для ${location.pathname} пока нет. Откройте ${config.adminUrl}.`);
}

document.querySelector('#restart-editor')?.addEventListener('click', startPlaygroundEditor);
boot().catch(error => {
  console.error(error);
  writeStatus({ error: error instanceof Error ? error.message : String(error) });
});
