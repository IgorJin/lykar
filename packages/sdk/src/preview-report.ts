import {isPreviewCheckRequest, type PreviewCheckReport} from '@lykar/protocol';
import type {ApplyReport} from '@lykar/runtime';

/** The Admin sends a one-shot challenge to a preview it opened; opener may remain null. */
export function installPreviewReportBridge(options: {
  document: Document; apiBaseUrl?: string; projectKey: string; report: ApplyReport;
  isCurrent: () => boolean;
}): () => void {
  const view = options.document.defaultView;
  if (!view) return () => {};
  const apiOrigin = new URL(options.apiBaseUrl || view.location.origin, view.location.href).origin;
  const receive = (event: MessageEvent) => {
    if (!options.isCurrent() || event.origin !== apiOrigin || !event.source || event.source === view
      || !isPreviewCheckRequest(event.data)) return;
    const request = event.data;
    const report = options.report;
    if (request.pageId !== report.pageId || request.releaseId !== report.releaseId) return;
    const response: PreviewCheckReport = {
      type: 'lykar:preview-report', schemaVersion: 1, nonce: request.nonce,
      projectKey: options.projectKey, pageId: report.pageId, releaseId: report.releaseId, version: report.version,
      checkedAt: report.finishedAt, sourceStatus: report.compatibility.status,
      operations: report.operations.map(operation => ({id: operation.operationId, kind: operation.kind,
        status: operation.status, ...(operation.code ? {code: operation.code} : {})})),
    };
    (event.source as Window).postMessage(response, event.origin);
  };
  view.addEventListener('message', receive);
  return () => view.removeEventListener('message', receive);
}
