/** Advisory, point-in-time preview diagnostics. Never contains capabilities or DOM text. */
export type PreviewCheckRequest = {
  type: 'lykar:preview-check'; schemaVersion: 1; nonce: string; pageId: string; releaseId: string;
};
export type PreviewOperationReport = {id: string; kind: string; status: 'applied' | 'skipped' | 'error'; code?: string};
export type PreviewCheckReport = {
  type: 'lykar:preview-report'; schemaVersion: 1; nonce: string;
  projectKey: string; pageId: string; releaseId: string; version: number;
  checkedAt: string; sourceStatus: 'compatible' | 'drifted' | 'unknown';
  operations: PreviewOperationReport[];
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown, max = 160): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
export function isPreviewCheckRequest(value: unknown): value is PreviewCheckRequest {
  return record(value) && value.type === 'lykar:preview-check' && value.schemaVersion === 1
    && typeof value.nonce === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value.nonce)
    && text(value.pageId) && text(value.releaseId);
}
export function isPreviewCheckReport(value: unknown): value is PreviewCheckReport {
  return record(value) && value.type === 'lykar:preview-report' && value.schemaVersion === 1
    && isPreviewCheckRequest({...value, type: 'lykar:preview-check'})
    && text(value.projectKey) && Number.isSafeInteger(value.version) && (value.version as number) > 0
    && text(value.checkedAt, 64) && Number.isFinite(Date.parse(value.checkedAt))
    && ['compatible', 'drifted', 'unknown'].includes(String(value.sourceStatus))
    && Array.isArray(value.operations) && value.operations.length <= 1000
    && value.operations.every(operation => record(operation) && text(operation.id) && text(operation.kind, 40)
      && ['applied', 'skipped', 'error'].includes(String(operation.status))
      && (operation.code === undefined || text(operation.code, 100)));
}
