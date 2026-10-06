import {afterEach, describe, expect, it, vi} from 'vitest';
import type {ApplyReport} from '@lykar/runtime';
import {installPreviewReportBridge} from './preview-report.js';

const apiOrigin = 'https://api.test:8443';
const nonce = 'preview_nonce_123456';
const request = {type: 'lykar:preview-check', schemaVersion: 1, nonce,
  pageId: 'page-preview', releaseId: 'release-preview'};

function report(): ApplyReport {
  const operation = {operationId: 'text-operation', kind: 'setText' as const,
    target: {marker: 'private-target'}, status: 'applied' as const,
    message: 'private DOM text', value: 'private operation value', token: 'private operation token'};
  return {
    projectId: 'private-project-id', pageId: request.pageId, releaseId: request.releaseId, version: 3,
    startedAt: '2026-10-04T10:00:00.000Z', finishedAt: '2026-10-04T10:00:01.000Z',
    applied: 1, skipped: 1, errors: 1, alreadyApplied: false,
    compatibility: {status: 'drifted', basis: 'structural', visualStatus: 'unknown', baseline: 'clean',
      expectedPageHash: 'private-expected-hash', actualPageHash: 'private-actual-hash'},
    journal: [], compensation: [],
    operations: [operation,
      {operationId: 'skip-operation', kind: 'setText', target: {marker: 'private-skip-target'},
        status: 'skipped', code: 'TARGET_NOT_FOUND', message: 'private skip details'},
      {operationId: 'error-operation', kind: 'setText', target: {marker: 'private-error-target'},
        status: 'error', code: 'APPLY_FAILED', message: 'private error details'}],
  };
}

const cleanups: Array<() => void> = [];
function install(options: Partial<Parameters<typeof installPreviewReportBridge>[0]> = {}) {
  const cleanup = installPreviewReportBridge({document, apiBaseUrl: `${apiOrigin}/v1/`,
    projectKey: 'pk_preview', report: report(), isCurrent: () => true, ...options});
  cleanups.push(cleanup);
  return cleanup;
}

function send(data: unknown = request, origin = apiOrigin,
  source: object | null = {postMessage: vi.fn()}) {
  const event = new MessageEvent('message', {data, origin});
  Object.defineProperty(event, 'source', {value: source});
  window.dispatchEvent(event);
}

describe('preview report bridge', () => {
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    vi.restoreAllMocks();
  });

  it.each(['a'.repeat(16), 'Z_9-'.repeat(32)])('returns only sanitized diagnostics for valid nonce %s', validNonce => {
    const postMessage = vi.fn();
    const sensitiveReport = {...report(), token: 'private-report-token', accessToken: 'private-access-token'};
    install({report: sensitiveReport});
    send({...request, nonce: validNonce, token: 'private-request-token'}, apiOrigin, {postMessage});

    expect(postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'lykar:preview-report', schemaVersion: 1, nonce: validNonce,
      projectKey: 'pk_preview', pageId: request.pageId, releaseId: request.releaseId, version: 3,
      checkedAt: sensitiveReport.finishedAt, sourceStatus: 'drifted',
      operations: [
        {id: 'text-operation', kind: 'setText', status: 'applied'},
        {id: 'skip-operation', kind: 'setText', status: 'skipped', code: 'TARGET_NOT_FOUND'},
        {id: 'error-operation', kind: 'setText', status: 'error', code: 'APPLY_FAILED'},
      ],
    }, apiOrigin);
    expect(JSON.stringify(postMessage.mock.calls[0][0])).not.toContain('private-');
  });

  it.each(['https://other.test:8443', 'https://api.test', 'http://api.test:8443',
    'https://api.test.evil:8443', 'null'])('rejects origin %s', origin => {
    const postMessage = vi.fn();
    install();
    send(request, origin, {postMessage});
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('rejects absent and self sources', () => {
    const postMessage = vi.spyOn(window, 'postMessage');
    install();
    send(request, apiOrigin, null);
    send(request, apiOrigin, window);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it.each(['', 'a'.repeat(15), 'a'.repeat(129), 'invalid nonce 123456', 'invalid/nonce123456', null, 123])(
    'rejects malformed nonce %s', invalidNonce => {
      const postMessage = vi.fn();
      install();
      send({...request, nonce: invalidNonce}, apiOrigin, {postMessage});
      expect(postMessage).not.toHaveBeenCalled();
    });

  it.each([{pageId: 'other-page'}, {releaseId: 'other-release'},
    {type: 'lykar:preview-report'}, {schemaVersion: 2}])('rejects mismatched request %j', changes => {
    const postMessage = vi.fn();
    install();
    send({...request, ...changes}, apiOrigin, {postMessage});
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('checks the current generation when each request arrives', () => {
    const postMessage = vi.fn();
    let current = true;
    install({isCurrent: () => current});
    send(request, apiOrigin, {postMessage});
    expect(postMessage).toHaveBeenCalledOnce();
    current = false;
    send(request, apiOrigin, {postMessage});
    expect(postMessage).toHaveBeenCalledOnce();
  });

  it('uses the document origin when no API base URL is configured', () => {
    const postMessage = vi.fn();
    install({apiBaseUrl: undefined});
    send(request, apiOrigin, {postMessage});
    expect(postMessage).not.toHaveBeenCalled();
    send(request, window.location.origin, {postMessage});
    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][1]).toBe(window.location.origin);
  });

  it('removes the installed message listener on cleanup', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const postMessage = vi.fn();
    const cleanup = install();
    const listener = addListener.mock.calls.find(([type]) => type === 'message')?.[1];
    expect(listener).toBeTypeOf('function');
    cleanup();
    expect(removeListener).toHaveBeenCalledWith('message', listener);
    send(request, apiOrigin, {postMessage});
    expect(postMessage).not.toHaveBeenCalled();
  });
});
