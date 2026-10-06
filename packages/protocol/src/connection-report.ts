/** Connection evidence is diagnostic only; it never proves domain ownership. */
export type ConnectionAssetState = 'ready' | 'unavailable' | 'unchecked';
export type ConnectionReport = {
  type: 'lykar:connection-report'; schemaVersion: 1; nonce: string; pageUrl: string;
  projectKey: string; sdkVersion: string; api: 'reachable' | 'unreachable' | 'unchecked'; runtimeAsset: ConnectionAssetState;
  editorAsset: ConnectionAssetState; readiness: 'ready' | 'unsupported' | 'pending';
  csp: Array<'connect-src' | 'script-src' | 'style-src'>;
};
export type ConnectionCheckRequest = {type: 'lykar:connection-check'; schemaVersion: 1; nonce: string; pageUrl: string};
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonce = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(v);
const page = (v: unknown) => {
  if (typeof v !== 'string' || v.length > 2048) return false;
  try { const u = new URL(v); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.search && !u.hash && u.origin + u.pathname === v; }
  catch { return false; }
};
export function isConnectionCheckRequest(v: unknown): v is ConnectionCheckRequest {
  return record(v) && v.type === 'lykar:connection-check' && v.schemaVersion === 1 && nonce(v.nonce) && page(v.pageUrl);
}
export function isConnectionReport(v: unknown): v is ConnectionReport {
  return record(v) && v.type === 'lykar:connection-report' && v.schemaVersion === 1 && nonce(v.nonce) && page(v.pageUrl)
    && ['reachable', 'unreachable', 'unchecked'].includes(v.api as string)
    && typeof v.projectKey === 'string' && /^pk_[A-Za-z0-9_-]{1,160}$/.test(v.projectKey)
    && typeof v.sdkVersion === 'string' && /^[A-Za-z0-9.+_-]{1,80}$/.test(v.sdkVersion)
    && ['ready', 'unavailable', 'unchecked'].includes(v.runtimeAsset as string)
    && ['ready', 'unavailable', 'unchecked'].includes(v.editorAsset as string)
    && ['ready', 'unsupported', 'pending'].includes(v.readiness as string)
    && Array.isArray(v.csp) && v.csp.length <= 3 && new Set(v.csp).size === v.csp.length
    && v.csp.every(x => ['connect-src', 'script-src', 'style-src'].includes(x));
}
