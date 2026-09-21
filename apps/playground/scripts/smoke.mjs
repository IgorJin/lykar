import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { PRICING_PAGE_ID, PROJECT_ID, PROJECT_KEY, ROOT_PAGE_ID } from './fixture.mjs';

export async function runSmoke({ apiBaseUrl, playgroundBaseUrl }) {
  const loginResponse = await fetch(`${apiBaseUrl}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie);
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
    body: JSON.stringify({
      expectedRevision: capability.expectedRevision,
      sourceSnapshot: {
        algorithm: 'lykar-dom-v1',
        pageHash: 'c'.repeat(64),
        capturedAt: '2026-08-06T00:00:00.000Z',
      },
      operations: [operation],
    }),
  });
  const published = await admin(`/api/admin/drafts/${draft.id}/publish`, {
    method: 'POST', body: JSON.stringify({ expectedRevision: appended.draft.revision }),
  });

  const native = await fetch(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2F`);
  assert.equal(native.status, 204);
  const directUrl = `${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2F&version=${published.release.version}`;
  assert.equal((await fetch(directUrl)).status, 401);
  const direct = await request(directUrl, { headers: { authorization: `Bearer ${capability.token}` } });
  assert.equal(direct.manifest.version, published.release.version);
  assert.equal((await fetch(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2Fpricing`)).status, 204);

  const experiment = (await admin(`/api/admin/pages/${ROOT_PAGE_ID}/experiments`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke A/B ${randomUUID()}`,
      variants: [
        { key: 'A', releaseId: null, description: 'Native control', weightBps: 5000 },
        { key: 'B', releaseId: published.release.id, description: 'Treatment', weightBps: 5000 },
      ],
    }),
  })).experiment;
  await admin(`/api/admin/experiments/${experiment.id}/activate`, { method: 'POST', body: '{}' });
  const variantA = await admin(`/api/admin/experiments/${experiment.id}/variants/A/links`, { method: 'POST', body: '{}' });
  const variantB = await admin(`/api/admin/experiments/${experiment.id}/variants/B/links`, { method: 'POST', body: '{}' });
  const tokenA = new URL(variantA.url).searchParams.get('lykar_variant');
  const tokenB = new URL(variantB.url).searchParams.get('lykar_variant');
  assert.ok(tokenA && tokenB);
  const variantEndpoint = `${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2F&variantToken=`;
  const control = await request(`${variantEndpoint}${tokenA}`);
  assert.equal(control.manifest, null);
  assert.equal(control.variant.key, 'A');
  const treatment = await request(`${variantEndpoint}${tokenB}`);
  assert.equal(treatment.manifest.releaseId, published.release.id);
  await admin(`/api/admin/variant-links/${variantB.link.id}`, { method: 'DELETE' });
  assert.equal((await fetch(`${variantEndpoint}${tokenB}`)).status, 204);
  const replacementB = await admin(`/api/admin/experiments/${experiment.id}/variants/B/links`, { method: 'POST', body: '{}' });

  const experimentLink = await admin(`/api/admin/experiments/${experiment.id}/links`, { method: 'POST', body: '{}' });
  const experimentToken = new URL(experimentLink.url).searchParams.get('lykar_experiment');
  assert.ok(experimentToken);
  const anonymousId = randomUUID();
  const resolveExperiment = anonymous => request(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/experiments/resolve`, {
    method: 'POST',
    body: JSON.stringify({ pathname: '/', experimentToken, anonymousId: anonymous }),
  });
  const assignment = (await resolveExperiment(anonymousId)).selection;
  const sticky = (await resolveExperiment(anonymousId)).selection;
  assert.equal(sticky.assignmentId, assignment.assignmentId);
  assert.equal(sticky.variantKey, assignment.variantKey);
  const event = (eventType, name) => request(`${apiBaseUrl}/api/runtime/analytics/events`, {
    method: 'POST',
    body: JSON.stringify({
      capability: assignment.capability,
      clientEventId: randomUUID(),
      eventType,
      name,
      properties: eventType === 'conversion' ? { plan: 'pro' } : {},
      occurredAt: new Date().toISOString(),
    }),
  });
  assert.equal((await event('exposure', '$exposure')).accepted, true);
  assert.equal((await event('conversion', 'signup')).accepted, true);
  const analytics = (await admin(`/api/admin/experiments/${experiment.id}/analytics`)).report;
  const selectedReport = analytics.variants.find(variant => variant.key === assignment.variantKey);
  assert.equal(selectedReport.visitors, 1);
  assert.equal(selectedReport.views, 1);
  assert.equal(selectedReport.uniqueConversions, 1);
  await admin(`/api/admin/experiment-links/${experimentLink.link.id}`, { method: 'DELETE' });
  const revoked = await fetch(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/experiments/resolve`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pathname: '/', experimentToken, anonymousId: randomUUID() }),
  });
  assert.equal(revoked.status, 204);

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
  await admin(`/api/admin/experiments/${experiment.id}/complete`, {
    method: 'POST', body: JSON.stringify({ winnerVariantKey: 'B' }),
  });
  const afterComplete = await admin(`/api/admin/pages/${ROOT_PAGE_ID}/experiments`);
  assert.equal(afterComplete.experiments.find(item => item.id === experiment.id).winnerVariantKey, 'B');
  assert.equal((await fetch(`${apiBaseUrl}/api/runtime/projects/${PROJECT_KEY}/manifest?pathname=%2F`)).status, 204);

  return {
    projectKey: PROJECT_KEY,
    pageId: ROOT_PAGE_ID,
    releaseId: published.release.id,
    version: published.release.version,
    operationId: operation.id,
    experimentId: experiment.id,
    variantAUrl: variantA.url,
    variantBUrl: replacementB.url,
    experimentUrl: experimentLink.url,
  };
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${url} returned ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}
