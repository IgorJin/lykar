let editor;

function startPlaygroundEditor() {
  editor?.destroy();
  editor = window.LykarEditor.start({
    onApply(draft, report) {
      window.__LYKAR_LAST_DRAFT__ = draft;
      window.__LYKAR_LAST_REPORT__ = report;
      document.querySelector('#draft-output').textContent = JSON.stringify({
        page: draft.page,
        operationCount: draft.operations.length,
        lastReport: {
          applied: report.applied,
          skipped: report.skipped,
          errors: report.errors,
        },
        operations: draft.operations,
      }, null, 2);
    },
  });
  window.__LYKAR_EDITOR__ = editor;
}

document.querySelector('#restart-editor').addEventListener('click', startPlaygroundEditor);
startPlaygroundEditor();
