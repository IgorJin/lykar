import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { DEV_SESSION_TOKEN, PRICING_PAGE_ID, PROJECT_ID, PROJECT_KEY, ROOT_PAGE_ID } from './fixture.mjs';

export async function runSmoke({ apiBaseUrl, playgroundBaseUrl }) {
  const cookie = `lykar_session=${DEV_SESSION_TOKEN}`;
  const admin = (path, init = {}) => request(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { cookie, ...init.headers },
  });

  const site = await fetch(`${playgroundBaseUrl}/`);
  assert.equal(site.status, 200);
  assert.match(await site.text(), /Northstar/);
  assert.equal((await fetch(`${playgroundBaseUrl}/runtime.iife.js`)).status, 200);
  assert.equal((await fetch(`${playgroundBaseUrl}/editor.iife.js`)).status, 200);

  const projects = await admin('/api/admin/projects');
  assert.ok(projects.projects.some(project => project.id === PROJECT_ID));
  const pages = await admin(`/api/admin/projects/${PROJECT_ID}/pages`);
  assert.deepEqual(new Set(pages.pages.map(page => page.id)), new Set([ROOT_PAGE_ID, PRICING_PAGE_ID]));

  const drafts = await admin(`/api/admin/pages/${ROOT_PAGE_ID}/drafts`);
  let draft = drafts.drafts.find(item => item.status === 'open');
  if (!draft) {
    draft = (await admin(`/api/admin/pages/${ROOT_PAGE_ID}/drafts`, { method: 'POST', body: '{}' })).draft;
  }

  const launch = await admin(`/api/admin/pages/${ROOT_PAGE_ID}/editor-launch`, {
    method: 'POST', body: JSON.stringify({ draftId: draft.id }),
  });
  const launchUrl = new URL(launch.launchUrl);
  const launchCode = new URLSearchParams(launchUrl.hash.slice(1)).get('lykar_edit');
  assert.ok(launchCode);
  const capability = (await request(`${apiBaseUrl}/api/editor/exchange`, {
    method: 'POST',
    body: JSON.stringify({ code: launchCode, pageUrl: `${launchUrl.origin}${launchUrl.pathname}` }),
  })).capability;
  assert.equal(capability.draftId, draft.id);

  const operation = {
    schemaVersion: 1,
    id: `smoke-${randomUUID()}`,
    kind: 'setText',
    target: { marker: 'hero-title' },
    value: 'Northstar published through Lykar E2E',
  };
  const appended = await request(`${apiBaseUrl}/api/editor/drafts/${draft.id}/operations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${capability.token}` },
    body: JSON.stringify({ expectedRevision: capability.expectedRevision, operations: [operation] }),
  });
  const published = await admin(`/api/admin/drafts/${draft.id}/publish`, {
    method: 'POST', body: JSON.stringify({ expectedRevision: appended.draft.revision }),
  });

  const active = await request(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2F`);
  assert.equal(active.manifest.releaseId, published.release.id);
  assert.equal(active.manifest.operations.at(-1).value, operation.value);
  const directUrl = `${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2F&version=${published.release.version}`;
  assert.equal((await fetch(directUrl)).status, 401);
  const direct = await request(directUrl, { headers: { authorization: `Bearer ${capability.token}` } });
  assert.equal(direct.manifest.version, published.release.version);
  assert.equal((await fetch(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2Fpricing`)).status, 404);

  const share = await admin(`/api/admin/pages/${ROOT_PAGE_ID}/shares`, {
    method: 'POST',
    body: JSON.stringify({ releaseId: published.release.id, expiresInSeconds: 3600 }),
  });
  const shareRedirect = await fetch(share.url, { redirect: 'manual' });
  assert.equal(shareRedirect.status, 302);
  const shareTarget = new URL(shareRedirect.headers.get('location'));
  const shareCode = new URLSearchParams(shareTarget.hash.slice(1)).get('lykar_share');
  const shareAccess = (await request(`${apiBaseUrl}/api/share/exchange`, {
    method: 'POST',
    body: JSON.stringify({ code: shareCode, pageUrl: `${shareTarget.origin}${shareTarget.pathname}` }),
  })).access;
  const shared = await request(directUrl, { headers: { authorization: `Bearer ${shareAccess.token}` } });
  assert.equal(shared.manifest.releaseId, published.release.id);

  return {
    projectKey: PROJECT_KEY,
    pageId: ROOT_PAGE_ID,
    releaseId: published.release.id,
    version: published.release.version,
    operationId: operation.id,
  };
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} returned ${response.status}: ${await response.text()}`);
  return response.json();
}
