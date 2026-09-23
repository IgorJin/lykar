import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { buildApp } from '../app';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;

test(
  'PostgreSQL workflow freezes immutable versions without changing the native page',
  { skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured' },
  async () => {
    let magicLink = '';
    const app = buildApp({
      logger: false,
      connectionString: databaseUrl,
      appOrigin: 'http://localhost:3000',
      ownerEmail: 'integration@example.com',
      magicLinkSender: { async send(input) { magicLink = input.url; } },
    });

    try {
      await app.inject({ method: 'POST', url: '/api/auth/magic-link', payload: { email: 'integration@example.com' } });
      const loginToken = new URL(magicLink).searchParams.get('token');
      assert.ok(loginToken);
      const loginResponse = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${loginToken}` });
      const cookie = String(loginResponse.headers['set-cookie']).split(';')[0];
      const adminHeaders = { cookie };
      const projectResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/projects',
        headers: adminHeaders,
        payload: { name: 'Integration project', origins: ['https://example.com'] },
      });
      assert.equal(projectResponse.statusCode, 201, projectResponse.body);
      const project = projectResponse.json().project;

      const pagesResponse = await app.inject({
        method: 'GET', url: `/api/admin/projects/${project.id}/pages`, headers: adminHeaders,
      });
      const page = pagesResponse.json().pages[0];
      assert.equal(page.pathname, '/');

      const draftResponse = await app.inject({
        method: 'POST',
        url: `/api/admin/pages/${page.id}/drafts`,
        headers: adminHeaders,
        payload: {},
      });
      assert.equal(draftResponse.statusCode, 201, draftResponse.body);
      const draft = draftResponse.json().draft;

      const firstSavePayload = {
        idempotencyKey: `save-v1-${project.id}`,
        expectedRevision: 0,
        sourceSnapshot: {
          algorithm: 'lykar-dom-v1',
          pageHash: 'a'.repeat(64),
          capturedAt: '2026-08-06T00:00:00.000Z',
        },
        operations: [{
          schemaVersion: 1,
          id: `set-title-${project.id}`,
          kind: 'setText',
          target: { marker: 'hero-title' },
          value: 'Version one',
        }],
      };
      const appendResponse = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draft.id}/operations`,
        headers: adminHeaders,
        payload: firstSavePayload,
      });
      assert.equal(appendResponse.statusCode, 200, appendResponse.body);
      assert.equal(appendResponse.json().draft.revision, 1);
      assert.equal(appendResponse.json().draft.replayed, false);
      assert.match(appendResponse.json().draft.payloadHash, /^[0-9a-f]{64}$/);

      const replayedSave = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/operations`, headers: adminHeaders,
        payload: firstSavePayload,
      });
      assert.equal(replayedSave.statusCode, 200, replayedSave.body);
      assert.equal(replayedSave.json().draft.revision, 1);
      assert.equal(replayedSave.json().draft.replayed, true);

      const reusedKey = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/operations`, headers: adminHeaders,
        payload: {
          ...firstSavePayload,
          operations: [{...firstSavePayload.operations[0], value: 'Different payload'}],
        },
      });
      assert.equal(reusedKey.statusCode, 409, reusedKey.body);
      assert.equal(reusedKey.json().error.code, 'IDEMPOTENCY_CONFLICT');

      const concurrentDraftResponse = await app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/drafts`, headers: adminHeaders, payload: {},
      });
      const concurrentDraft = concurrentDraftResponse.json().draft;
      const concurrentPayload = {
        idempotencyKey: `concurrent-save-${project.id}`,
        expectedRevision: 0,
        operations: [{
          schemaVersion: 1,
          id: `concurrent-title-${project.id}`,
          kind: 'setText',
          target: {marker: 'hero-title'},
          value: 'One effect',
        }],
      };
      const concurrentResponses = await Promise.all([1, 2].map(() => app.inject({
        method: 'POST', url: `/api/admin/drafts/${concurrentDraft.id}/operations`,
        headers: adminHeaders, payload: concurrentPayload,
      })));
      assert.deepEqual(concurrentResponses.map(response => response.statusCode), [200, 200]);
      assert.deepEqual(
        concurrentResponses.map(response => response.json().draft.replayed).sort(),
        [false, true],
      );
      const concurrentPersisted = await app.inject({
        method: 'GET', url: `/api/admin/drafts/${concurrentDraft.id}`, headers: adminHeaders,
      });
      assert.equal(concurrentPersisted.json().draft.revision, 1);
      assert.equal(concurrentPersisted.json().operations.length, 1);

      const failedSaveKey = `failed-save-${project.id}`;
      const failedSave = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/operations`, headers: adminHeaders,
        payload: {
          idempotencyKey: failedSaveKey,
          expectedRevision: 1,
          operations: [firstSavePayload.operations[0]],
        },
      });
      assert.equal(failedSave.statusCode, 409, failedSave.body);
      const rollbackPool = new Pool({connectionString: databaseUrl});
      try {
        const failedRows = await rollbackPool.query(
          'SELECT id FROM draft_save_requests WHERE draft_id = $1 AND idempotency_key = $2',
          [draft.id, failedSaveKey],
        );
        assert.equal(failedRows.rowCount, 0);
      } finally {
        await rollbackPool.end();
      }

      const persistedDraft = await app.inject({
        method: 'GET',
        url: `/api/admin/drafts/${draft.id}`,
        headers: adminHeaders,
      });
      assert.equal(persistedDraft.statusCode, 200, persistedDraft.body);
      assert.equal(persistedDraft.json().draft.revision, 1);
      assert.equal(persistedDraft.json().operations.length, 1);

      const staleAppend = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draft.id}/operations`,
        headers: adminHeaders,
        payload: {
          idempotencyKey: `save-stale-${project.id}`,
          expectedRevision: 0,
          operations: [{
            schemaVersion: 1,
            id: `stale-${project.id}`,
            kind: 'setText',
            target: { marker: 'hero-title' },
            value: 'Stale write',
          }],
        },
      });
      assert.equal(staleAppend.statusCode, 409, staleAppend.body);

      const publishV1Response = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draft.id}/publish`,
        headers: adminHeaders,
        payload: { expectedRevision: 1 },
      });
      assert.equal(publishV1Response.statusCode, 201, publishV1Response.body);
      const releaseV1 = publishV1Response.json().release;
      assert.equal(releaseV1.version, 1);
      assert.equal(releaseV1.sourceSnapshot.pageHash, 'a'.repeat(64));

      const draftV2Response = await app.inject({
        method: 'POST',
        url: `/api/admin/pages/${page.id}/drafts`,
        headers: adminHeaders,
        payload: {},
      });
      const draftV2 = draftV2Response.json().draft;
      assert.equal(draftV2.baseReleaseId, releaseV1.id);

      const editorLaunch = await app.inject({
        method: 'POST',
        url: `/api/admin/pages/${page.id}/editor-launch`,
        headers: adminHeaders,
        payload: { draftId: draftV2.id },
      });
      const editorTarget = new URL(editorLaunch.json().launchUrl);
      const editorExchange = await app.inject({
        method: 'POST',
        url: '/api/editor/exchange',
        payload: {
          code: new URLSearchParams(editorTarget.hash.slice(1)).get('lykar_edit'),
          pageUrl: `${editorTarget.origin}${editorTarget.pathname}`,
        },
      });
      assert.equal(editorExchange.statusCode, 200, editorExchange.body);
      assert.equal(editorExchange.json().capability.draftId, draftV2.id);
      assert.equal(editorExchange.json().capability.expectedRevision, 0);
      assert.equal(editorExchange.json().capability.baseVersion, 1);

      const appendV2Response = await app.inject({
        method: 'POST',
        url: `/api/editor/drafts/${draftV2.id}/operations`,
        headers: { authorization: `Bearer ${editorExchange.json().capability.token}` },
        payload: {
          idempotencyKey: `save-v2-${project.id}`,
          expectedRevision: 0,
          sourceSnapshot: {
            algorithm: 'lykar-dom-v1',
            pageHash: 'a'.repeat(64),
            capturedAt: '2026-08-06T00:00:00.000Z',
          },
          operations: [{
            schemaVersion: 1,
            id: `set-color-${project.id}`,
            kind: 'setStyle',
            target: { marker: 'hero-title' },
            property: 'color',
            value: 'red',
          }],
        },
      });
      assert.equal(appendV2Response.statusCode, 200, appendV2Response.body);

      const editorHeaders = { authorization: `Bearer ${editorExchange.json().capability.token}` };
      const editorDraft = await app.inject({ method: 'GET', url: `/api/editor/drafts/${draftV2.id}`, headers: editorHeaders });
      assert.equal(editorDraft.statusCode, 200, editorDraft.body);
      assert.equal(editorDraft.json().draft.revision, 1);
      assert.equal(editorDraft.json().operations.length, 1);
      const anonymousDraft = await app.inject({ method: 'GET', url: `/api/editor/drafts/${draftV2.id}` });
      assert.equal(anonymousDraft.statusCode, 401);
      const otherDraft = await app.inject({ method: 'GET', url: `/api/editor/drafts/${draft.id}`, headers: editorHeaders });
      assert.equal(otherDraft.statusCode, 401);

      const publishV2Response = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draftV2.id}/publish`,
        headers: adminHeaders,
        payload: { expectedRevision: 1 },
      });
      const releaseV2 = publishV2Response.json().release;
      assert.equal(releaseV2.version, 2);
      assert.equal(releaseV2.operationCount, 2);
      const closedDraft = await app.inject({ method: 'GET', url: `/api/editor/drafts/${draftV2.id}`, headers: editorHeaders });
      assert.equal(closedDraft.statusCode, 401);

      const nativeManifest = await app.inject({
        method: 'GET',
        url: `/api/runtime/projects/${project.publicKey}/manifest?pathname=%2F`,
      });
      assert.equal(nativeManifest.statusCode, 204, nativeManifest.body);

      const shareResponse = await app.inject({
        method: 'POST',
        url: `/api/admin/pages/${page.id}/shares`,
        headers: adminHeaders,
        payload: { releaseId: releaseV2.id, expiresInSeconds: 3600 },
      });
      const sharePath = new URL(shareResponse.json().url).pathname;
      const shareRedirect = await app.inject({ method: 'GET', url: sharePath });
      const target = new URL(String(shareRedirect.headers.location));
      const shareCode = new URLSearchParams(target.hash.slice(1)).get('lykar_share');
      const shareExchange = await app.inject({
        method: 'POST',
        url: '/api/share/exchange',
        payload: { code: shareCode, pageUrl: `${target.origin}${target.pathname}` },
      });
      const immutableV2Manifest = await app.inject({
        method: 'GET',
        url: `/api/runtime/projects/${project.publicKey}/manifest?pathname=%2F&version=2`,
        headers: { authorization: `Bearer ${shareExchange.json().access.token}` },
      });
      assert.equal(immutableV2Manifest.statusCode, 200, immutableV2Manifest.body);
      assert.equal(immutableV2Manifest.json().manifest.releaseId, releaseV2.id);
      assert.equal(immutableV2Manifest.json().manifest.operations.length, 2);

      const verificationPool = new Pool({ connectionString: databaseUrl });
      try {
        await assert.rejects(
          verificationPool.query('UPDATE releases SET version = 99 WHERE id = $1', [releaseV2.id]),
          (error: unknown) => (
            typeof error === 'object'
            && error !== null
            && 'code' in error
            && error.code === 'P0001'
          ),
        );
        const snapshot = await verificationPool.query<{ source_snapshot: { pageHash: string } }>(
          'SELECT source_snapshot FROM releases WHERE id = $1',
          [releaseV2.id],
        );
        assert.equal(snapshot.rows[0].source_snapshot.pageHash, 'a'.repeat(64));
      } finally {
        await verificationPool.end();
      }
    } finally {
      await app.close();
    }
  },
);
