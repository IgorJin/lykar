import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';

import { buildApp } from '../app';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;

test('PostgreSQL deployments serialize activations and isolate public runtime resolution', {
  skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured',
}, async () => {
  const suffix = randomUUID();
  const email = `deployments-${suffix}@example.com`;
  const origin = `https://deployments-${suffix}.example.com`;
  let magicLink = '';
  const app = buildApp({ emailLimits: false,
    logger: false, connectionString: databaseUrl, appOrigin: 'http://localhost:3000', ownerEmail: email,
    magicLinkSender: { async send(input) { magicLink = input.url; } },
  });
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const requested = await app.inject({ method: 'POST', url: '/api/auth/magic-link', payload: { email } });
    assert.equal(requested.statusCode, 202, requested.body);
    const token = new URL(magicLink).searchParams.get('token');
    assert.ok(token);
    const login = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${token}` });
    assert.equal(login.statusCode, 302, login.body);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const ownerHeaders = { cookie };
    const createProject = async (name: string) => {
      const response = await app.inject({
        method: 'POST', url: '/api/admin/projects', headers: ownerHeaders,
        payload: { name, origins: [origin] },
      });
      assert.equal(response.statusCode, 201, response.body);
      const project = response.json().project;
      const pages = await app.inject({
        method: 'GET', url: `/api/admin/projects/${project.id}/pages`, headers: ownerHeaders,
      });
      assert.equal(pages.statusCode, 200, pages.body);
      return { project, page: pages.json().pages[0] };
    };
    const { project, page } = await createProject('Deployments project');
    const base = `/api/admin/pages/${page.id}/deployment`;
    const runtimeUrl = `/api/runtime/projects/${project.publicKey}/deployment?pathname=%2F`;
    const state = async () => {
      const response = await app.inject({ method: 'GET', url: base, headers: ownerHeaders });
      assert.equal(response.statusCode, 200, response.body);
      noStore(response);
      return response.json().deployment;
    };
    const mutate = (action: 'deploy' | 'disable' | 'rollback', payload: Record<string, unknown>, headers = ownerHeaders) =>
      app.inject({ method: 'POST', url: `${base}/${action}`, headers, payload });
    const key = (label: string) => `${label}-${suffix}`;
    const publish = async (pageId: string, label: string) => {
      const draftResponse = await app.inject({
        method: 'POST', url: `/api/admin/pages/${pageId}/drafts`, headers: ownerHeaders, payload: {},
      });
      assert.equal(draftResponse.statusCode, 201, draftResponse.body);
      const draft = draftResponse.json().draft;
      const append = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/operations`, headers: ownerHeaders,
        payload: {
          idempotencyKey: key(`save-${label}`), expectedRevision: 0,
          sourceSnapshot: { algorithm: 'lykar-dom-v1', pageHash: 'c'.repeat(64), capturedAt: '2026-08-06T00:00:00.000Z' },
          operations: [{ schemaVersion: 1, id: key(label), kind: 'setText', target: { marker: 'hero-title' }, value: label }],
        },
      });
      assert.equal(append.statusCode, 200, append.body);
      const response = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/publish`, headers: ownerHeaders,
        payload: { expectedRevision: 1 },
      });
      assert.equal(response.statusCode, 201, response.body);
      return response.json().release;
    };

    assert.deepEqual(await state(), { pageId: page.id, revision: 0, activeReleaseId: null, activation: null });
    const v1 = await publish(page.id, 'first');
    const v2 = await publish(page.id, 'second');
    const v3 = await publish(page.id, 'never-activated');
    const releasesBefore = await pool.query('SELECT * FROM releases WHERE page_id = $1 ORDER BY version', [page.id]);

    // Allowed origins are deliberately unverified until a verification event occurs.
    await pool.query('UPDATE project_origins SET verified_at = NULL WHERE project_id = $1', [project.id]);
    const unverified = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin } });
    assert.equal(unverified.statusCode, 204, unverified.body);
    noStore(unverified);
    assert.equal(unverified.headers['access-control-allow-origin'], undefined);
    await pool.query('UPDATE project_origins SET verified_at = NOW() WHERE project_id = $1', [project.id]);
    const native = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin } });
    assert.equal(native.statusCode, 200, native.body);
    assert.deepEqual(native.json(), { pageId: page.id, revision: 0, activeReleaseId: null, manifest: null });
    noStore(native);
    assert.equal(native.headers['access-control-allow-origin'], origin);
    assert.match(String(native.headers.vary), /origin/i);

    const firstPayload = { releaseId: v1.id, expectedRevision: 0, idempotencyKey: key('deploy-first'), reason: '  Launch first  ' };
    const first = await mutate('deploy', firstPayload);
    assert.equal(first.statusCode, 200, first.body);
    noStore(first);
    assert.equal(first.json().replayed, false);
    assert.equal(first.json().deployment.revision, 1);
    assert.equal(first.json().deployment.activeReleaseId, v1.id);
    assert.equal(first.json().deployment.activation.reason, 'Launch first');
    assert.equal(first.json().deployment.activation.previousReleaseId, null);
    const deployed = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin } });
    assert.equal(deployed.statusCode, 200, deployed.body);
    assert.equal(deployed.json().manifest.releaseId, v1.id);
    assert.equal(deployed.json().manifest.sourceSnapshot.pageHash, 'c'.repeat(64));
    noStore(deployed);
    assert.equal(deployed.headers['access-control-allow-origin'], origin);
    const legacy = await app.inject({
      method: 'GET', url: `/api/runtime/projects/${project.publicKey}/manifest?pathname=%2F`, headers: { origin },
    });
    assert.equal(legacy.statusCode, 204, legacy.body);

    const second = await mutate('deploy', { releaseId: v2.id, expectedRevision: 1, idempotencyKey: key('deploy-second'), reason: 'Launch second' });
    assert.equal(second.statusCode, 200, second.body);
    const disabled = await mutate('disable', { expectedRevision: 2, idempotencyKey: key('disable'), reason: 'Native fallback' });
    assert.equal(disabled.statusCode, 200, disabled.body);
    assert.equal(disabled.json().deployment.activeReleaseId, null);
    assert.equal(disabled.json().deployment.activation.previousReleaseId, v2.id);
    const disabledRuntime = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin } });
    assert.equal(disabledRuntime.statusCode, 200, disabledRuntime.body);
    assert.equal(disabledRuntime.json().revision, 3);
    assert.equal(disabledRuntime.json().manifest, null);
    const rolledBack = await mutate('rollback', { releaseId: v1.id, expectedRevision: 3, idempotencyKey: key('rollback'), reason: 'Restore known release' });
    assert.equal(rolledBack.statusCode, 200, rolledBack.body);
    assert.equal(rolledBack.json().deployment.revision, 4);
    assert.equal(rolledBack.json().deployment.activeReleaseId, v1.id);

    const historicalRetry = await mutate('deploy', firstPayload);
    assert.equal(historicalRetry.statusCode, 200, historicalRetry.body);
    assert.equal(historicalRetry.json().replayed, true);
    assert.deepEqual(historicalRetry.json().deployment, first.json().deployment);
    assert.equal((await state()).revision, 4);
    const conflictingRetry = await mutate('deploy', { ...firstPayload, reason: 'Different reason' });
    assert.equal(conflictingRetry.statusCode, 409, conflictingRetry.body);
    assert.equal(conflictingRetry.json().error.code, 'IDEMPOTENCY_CONFLICT');
    noStore(conflictingRetry);
    const stale = await mutate('disable', { expectedRevision: 0, idempotencyKey: key('stale'), reason: 'Stale request' });
    assert.equal(stale.statusCode, 409, stale.body);
    assert.equal(stale.json().error.code, 'DEPLOYMENT_REVISION_CONFLICT');
    noStore(stale);

    const firstHistory = await app.inject({ method: 'GET', url: `${base}/activations?limit=2`, headers: ownerHeaders });
    assert.equal(firstHistory.statusCode, 200, firstHistory.body);
    noStore(firstHistory);
    assert.deepEqual(firstHistory.json().activations.map((activation: { revision: number }) => activation.revision), [4, 3]);
    assert.equal(firstHistory.json().nextBeforeRevision, 3);
    const secondHistory = await app.inject({ method: 'GET', url: `${base}/activations?limit=2&beforeRevision=3`, headers: ownerHeaders });
    assert.equal(secondHistory.statusCode, 200, secondHistory.body);
    assert.deepEqual(secondHistory.json().activations.map((activation: { revision: number }) => activation.revision), [2, 1]);
    assert.equal(secondHistory.json().nextBeforeRevision, null);

    const failedKeys: string[] = [key('stale')];
    for (const [label, releaseId] of [['never', v3.id], ['current', v1.id]]) {
      const idempotencyKey = key(`rollback-${label}`);
      failedKeys.push(idempotencyKey);
      const response = await mutate('rollback', { releaseId, expectedRevision: 4, idempotencyKey, reason: 'Must not activate' });
      assert.equal(response.statusCode, 409, response.body);
      noStore(response);
    }
    const otherPageResponse = await app.inject({
      method: 'POST', url: `/api/admin/projects/${project.id}/pages`, headers: ownerHeaders,
      payload: { name: 'Other page', pathname: '/other' },
    });
    assert.equal(otherPageResponse.statusCode, 201, otherPageResponse.body);
    const otherPageRelease = await publish(otherPageResponse.json().page.id, 'other-page');
    const foreign = await createProject('Foreign deployment project');
    const foreignRelease = await publish(foreign.page.id, 'foreign-project');
    for (const [label, releaseId] of [['other-page', otherPageRelease.id], ['foreign', foreignRelease.id], ['missing', randomUUID()]]) {
      const idempotencyKey = key(`invalid-${label}`);
      failedKeys.push(idempotencyKey);
      const response = await mutate('deploy', { releaseId, expectedRevision: 4, idempotencyKey, reason: 'Must not activate' });
      assert.equal(response.statusCode, 404, response.body);
      noStore(response);
    }
    const failedRows = await pool.query('SELECT id FROM page_deployment_activations WHERE page_id = $1 AND idempotency_key = ANY($2::text[])', [page.id, failedKeys]);
    assert.equal(failedRows.rowCount, 0);
    assert.equal((await state()).revision, 4);

    const race = await Promise.all(['a', 'b'].map(label => mutate('deploy', {
      releaseId: v2.id, expectedRevision: 4, idempotencyKey: key(`race-${label}`), reason: 'Concurrent activation',
    })));
    assert.deepEqual(race.map(response => response.statusCode).sort(), [200, 409]);
    const loser = race.find(response => response.statusCode === 409)!;
    assert.equal(loser.json().error.code, 'DEPLOYMENT_REVISION_CONFLICT');
    const retryPayload = { releaseId: v1.id, expectedRevision: 5, idempotencyKey: key('concurrent-identical'), reason: 'Single activation' };
    const identical = await Promise.all([mutate('deploy', retryPayload), mutate('deploy', retryPayload)]);
    assert.deepEqual(identical.map(response => response.statusCode), [200, 200]);
    assert.deepEqual(identical.map(response => response.json().replayed).sort(), [false, true]);
    assert.deepEqual(identical[0].json().deployment, identical[1].json().deployment);
    assert.equal((await state()).revision, 6);

    const members: Record<string, { cookie: string; membershipId: string; userId: string }> = {};
    for (const role of ['admin', 'editor', 'viewer', 'outsider']) {
      const userId = randomUUID();
      const sessionToken = randomUUID();
      const membershipId = randomUUID();
      await pool.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${role}-${suffix}@example.com`]);
      await pool.query('INSERT INTO admin_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'1 hour\')',
        [randomUUID(), userId, createHash('sha256').update(sessionToken).digest('hex')]);
      if (role !== 'outsider') await pool.query('INSERT INTO project_memberships (id, project_id, user_id, role) VALUES ($1, $2, $3, $4)', [membershipId, project.id, userId, role]);
      members[role] = { cookie: `lykar_session=${sessionToken}`, membershipId, userId };
    }
    for (const role of ['editor', 'viewer', 'outsider']) {
      const headers = { cookie: members[role].cookie };
      for (const url of [base, `${base}/activations`]) {
        const response = await app.inject({ method: 'GET', url, headers });
        assert.equal(response.statusCode, role === 'outsider' ? 403 : 200, response.body);
        noStore(response);
      }
      for (const action of ['deploy', 'disable', 'rollback'] as const) {
        const response = await mutate(action, {
          ...(action === 'disable' ? {} : { releaseId: v2.id }), expectedRevision: 6,
          idempotencyKey: key(`denied-${role}-${action}`), reason: 'Forbidden mutation',
        }, headers);
        assert.equal(response.statusCode, 403, response.body);
        noStore(response);
      }
    }
    const adminDeploy = await mutate('deploy', { ...firstPayload, expectedRevision: 6, releaseId: v2.id, reason: 'Admin shares actor-scoped key' }, { cookie: members.admin.cookie });
    assert.equal(adminDeploy.statusCode, 200, adminDeploy.body);
    assert.equal(adminDeploy.json().replayed, false);
    assert.equal(adminDeploy.json().deployment.activation.actorUserId, members.admin.userId);
    assert.equal(adminDeploy.json().deployment.revision, 7);
    await pool.query('UPDATE project_memberships SET revoked_at = NOW() WHERE id = $1', [members.admin.membershipId]);
    const revokedRetry = await mutate('deploy', { ...firstPayload, expectedRevision: 6, releaseId: v2.id, reason: 'Admin shares actor-scoped key' }, { cookie: members.admin.cookie });
    assert.equal(revokedRetry.statusCode, 403, revokedRetry.body);
    const revokedRead = await app.inject({ method: 'GET', url: base, headers: { cookie: members.admin.cookie } });
    assert.equal(revokedRead.statusCode, 403, revokedRead.body);

    for (const url of [base, `${base}/activations`]) {
      const anonymous = await app.inject({ method: 'GET', url });
      assert.equal(anonymous.statusCode, 401, anonymous.body);
      noStore(anonymous);
    }
    const anonymousMutation = await app.inject({ method: 'POST', url: `${base}/disable`, payload: { expectedRevision: 7, idempotencyKey: key('anonymous'), reason: 'Unauthorized' } });
    assert.equal(anonymousMutation.statusCode, 401, anonymousMutation.body);
    noStore(anonymousMutation);
    const csrf = await app.inject({ method: 'POST', url: `${base}/disable`, headers: { cookie, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, payload: { expectedRevision: 7, idempotencyKey: key('csrf'), reason: 'Cross-origin request' } });
    assert.equal(csrf.statusCode, 403, csrf.body);
    assert.equal(csrf.json().error.code, 'CSRF_REJECTED');
    noStore(csrf);
    const invalid = await mutate('disable', { expectedRevision: 7, idempotencyKey: 'short', reason: '   ' });
    assert.equal(invalid.statusCode, 400, invalid.body);
    noStore(invalid);

    for (const suppliedOrigin of [undefined, 'null', 'garbage', `${origin}/path`]) {
      const response = await app.inject({ method: 'GET', url: runtimeUrl, headers: suppliedOrigin === undefined ? {} : { origin: suppliedOrigin } });
      assert.equal(response.statusCode, 400, response.body);
      noStore(response);
      assert.match(String(response.headers.vary), /origin/i);
    }
    for (const url of [runtimeUrl, runtimeUrl.replace('%2F', '%2Fmissing'), runtimeUrl.replace(project.publicKey, `pk_unknown_${suffix}`)]) {
      const response = await app.inject({ method: 'GET', url, headers: { origin: url === runtimeUrl ? 'https://evil.example' : origin } });
      assert.equal(response.statusCode, 204, response.body);
      assert.equal(response.body, '');
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      noStore(response);
      assert.match(String(response.headers.vary), /origin/i);
    }
    for (const selector of ['version=1', 'variantToken=private', 'shareToken=private', 'experimentToken=private', 'releaseId=' + v1.id]) {
      const response = await app.inject({ method: 'GET', url: `${runtimeUrl}&${selector}`, headers: { origin } });
      assert.equal(response.statusCode, 400, response.body);
      noStore(response);
    }
    const share = await app.inject({ method: 'POST', url: `/api/admin/pages/${page.id}/shares`, headers: ownerHeaders, payload: { releaseId: v1.id, expiresInSeconds: 3600 } });
    assert.equal(share.statusCode, 201, share.body);
    const redirect = await app.inject({ method: 'GET', url: new URL(share.json().url).pathname });
    const target = new URL(String(redirect.headers.location));
    const exchange = await app.inject({ method: 'POST', url: '/api/share/exchange', payload: { code: new URLSearchParams(target.hash.slice(1)).get('lykar_share'), pageUrl: `${target.origin}${target.pathname}` } });
    assert.equal(exchange.statusCode, 200, exchange.body);
    const privateRuntime = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin, authorization: `Bearer ${exchange.json().access.token}` } });
    assert.equal(privateRuntime.statusCode, 400, privateRuntime.body);
    noStore(privateRuntime);
    const publicRuntime = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin } });
    assert.equal(publicRuntime.statusCode, 200, publicRuntime.body);
    assert.equal(publicRuntime.json().manifest.releaseId, v2.id);
    assert.equal(publicRuntime.json().revision, 7);

    // QA links keep native control semantics even while the explicit deployment is active.
    const deploymentBeforeExperiment = await state();
    const experimentResponse = await app.inject({
      method: 'POST', url: `/api/admin/pages/${page.id}/experiments`, headers: ownerHeaders,
      payload: {
        name: 'Deployment isolation A/B',
        variants: [
          { key: 'A', releaseId: null, description: 'Native control' },
          { key: 'B', releaseId: v1.id, description: 'Different release winner' },
        ],
      },
    });
    assert.equal(experimentResponse.statusCode, 201, experimentResponse.body);
    const experimentId = experimentResponse.json().experiment.id;
    const activatedExperiment = await app.inject({
      method: 'POST', url: `/api/admin/experiments/${experimentId}/activate`, headers: ownerHeaders, payload: {},
    });
    assert.equal(activatedExperiment.statusCode, 200, activatedExperiment.body);
    const aLink = await app.inject({
      method: 'POST', url: `/api/admin/experiments/${experimentId}/variants/A/links`, headers: ownerHeaders, payload: {},
    });
    assert.equal(aLink.statusCode, 201, aLink.body);
    const aToken = new URLSearchParams(new URL(aLink.json().url).hash.slice(1)).get('lykar_variant');
    assert.ok(aToken);
    const nativeControl = await app.inject({
      method: 'GET', url: `/api/runtime/projects/${project.publicKey}/manifest?pathname=%2F`,
      headers: { authorization: `Bearer ${aToken}` },
    });
    assert.equal(nativeControl.statusCode, 200, nativeControl.body);
    assert.equal(nativeControl.json().manifest, null);
    assert.deepEqual(nativeControl.json().variant, { experimentId, key: 'A' });
    assert.deepEqual(await state(), deploymentBeforeExperiment);
    const completedExperiment = await app.inject({
      method: 'POST', url: `/api/admin/experiments/${experimentId}/complete`, headers: ownerHeaders,
      payload: { winnerVariantKey: 'B' },
    });
    assert.equal(completedExperiment.statusCode, 200, completedExperiment.body);
    assert.equal(completedExperiment.json().experiment.winnerVariantKey, 'B');
    assert.deepEqual(await state(), deploymentBeforeExperiment);
    const runtimeAfterWinner = await app.inject({ method: 'GET', url: runtimeUrl, headers: { origin } });
    assert.equal(runtimeAfterWinner.statusCode, 200, runtimeAfterWinner.body);
    assert.equal(runtimeAfterWinner.json().revision, 7);
    assert.equal(runtimeAfterWinner.json().activeReleaseId, v2.id);
    assert.equal(runtimeAfterWinner.json().manifest.releaseId, v2.id);

    const persisted = await pool.query('SELECT * FROM page_deployment_activations WHERE page_id = $1 ORDER BY revision', [page.id]);
    assert.equal(persisted.rowCount, 7);
    assert.deepEqual(persisted.rows.map(row => Number(row.revision)), [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(persisted.rows[0].reason, 'Launch first');
    assert.match(persisted.rows[0].payload_hash.trim(), /^[0-9a-f]{64}$/);
    await assert.rejects(pool.query('UPDATE page_deployment_activations SET reason = \'changed\' WHERE id = $1', [persisted.rows[0].id]), immutableError);
    await assert.rejects(pool.query('DELETE FROM page_deployment_activations WHERE id = $1', [persisted.rows[0].id]), immutableError);
    await assert.rejects(pool.query('UPDATE releases SET version = 99 WHERE id = $1', [v1.id]), immutableError);
    const releasesAfter = await pool.query('SELECT * FROM releases WHERE page_id = $1 ORDER BY version', [page.id]);
    assert.deepEqual(releasesAfter.rows, releasesBefore.rows);
    const retained = await pool.query('SELECT * FROM page_deployment_activations WHERE page_id = $1 ORDER BY revision', [page.id]);
    assert.deepEqual(retained.rows, persisted.rows);
    assert.equal((await state()).revision, 7);
  } finally {
    await app.close();
    await pool.end();
  }
});

function noStore(response: { headers: Record<string, unknown> }): void {
  assert.match(String(response.headers['cache-control']), /\bno-store\b/);
}

function immutableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P0001';
}
