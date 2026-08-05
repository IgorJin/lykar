import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { buildApp } from '../app';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;
const adminHeaders = { 'x-lykar-admin-token': 'integration-admin-token' };

test(
  'PostgreSQL workflow publishes immutable versions and rolls the environment back',
  { skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured' },
  async () => {
    const app = buildApp({
      logger: false,
      connectionString: databaseUrl,
      adminToken: 'integration-admin-token',
    });

    try {
      const projectResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/projects',
        headers: adminHeaders,
        payload: { name: 'Integration project', origins: ['https://example.com'] },
      });
      assert.equal(projectResponse.statusCode, 201, projectResponse.body);
      const project = projectResponse.json().project;

      const draftResponse = await app.inject({
        method: 'POST',
        url: `/api/admin/projects/${project.id}/drafts`,
        headers: adminHeaders,
        payload: {},
      });
      assert.equal(draftResponse.statusCode, 201, draftResponse.body);
      const draft = draftResponse.json().draft;

      const appendResponse = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draft.id}/operations`,
        headers: adminHeaders,
        payload: {
          expectedRevision: 0,
          operations: [{
            schemaVersion: 1,
            id: `set-title-${project.id}`,
            kind: 'setText',
            target: { marker: 'hero-title' },
            value: 'Version one',
          }],
        },
      });
      assert.equal(appendResponse.statusCode, 200, appendResponse.body);
      assert.equal(appendResponse.json().draft.revision, 1);

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

      const draftV2Response = await app.inject({
        method: 'POST',
        url: `/api/admin/projects/${project.id}/drafts`,
        headers: adminHeaders,
        payload: {},
      });
      const draftV2 = draftV2Response.json().draft;
      assert.equal(draftV2.baseReleaseId, releaseV1.id);

      const appendV2Response = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draftV2.id}/operations`,
        headers: adminHeaders,
        payload: {
          expectedRevision: 0,
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

      const publishV2Response = await app.inject({
        method: 'POST',
        url: `/api/admin/drafts/${draftV2.id}/publish`,
        headers: adminHeaders,
        payload: { expectedRevision: 1 },
      });
      const releaseV2 = publishV2Response.json().release;
      assert.equal(releaseV2.version, 2);
      assert.equal(releaseV2.operationCount, 2);

      const rollbackResponse = await app.inject({
        method: 'POST',
        url: `/api/admin/projects/${project.id}/rollback`,
        headers: adminHeaders,
        payload: { releaseId: releaseV1.id },
      });
      assert.equal(rollbackResponse.statusCode, 200, rollbackResponse.body);
      assert.equal(rollbackResponse.json().activation.previousReleaseId, releaseV2.id);

      const activeManifest = await app.inject({
        method: 'GET',
        url: `/api/runtime/projects/${project.publicKey}/manifest`,
      });
      assert.equal(activeManifest.statusCode, 200, activeManifest.body);
      assert.equal(activeManifest.json().manifest.releaseId, releaseV1.id);
      assert.equal(activeManifest.json().manifest.operations.length, 1);

      const immutableV2Manifest = await app.inject({
        method: 'GET',
        url: `/api/runtime/projects/${project.publicKey}/manifest?version=2`,
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
      } finally {
        await verificationPool.end();
      }
    } finally {
      await app.close();
    }
  },
);
