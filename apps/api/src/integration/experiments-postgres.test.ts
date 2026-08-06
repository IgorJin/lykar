import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

import { buildApp } from '../app';

const databaseUrl = process.env.LYKAR_TEST_DATABASE_URL;

test(
  'PostgreSQL experiments expose only active A/B variant links and preserve the native default',
  { skip: databaseUrl ? false : 'LYKAR_TEST_DATABASE_URL is not configured' },
  async () => {
    let magicLink = '';
    const email = `experiments-${Date.now()}@example.com`;
    const app = buildApp({
      logger: false,
      connectionString: databaseUrl,
      appOrigin: 'http://localhost:3000',
      ownerEmail: email,
      magicLinkSender: { async send(input) { magicLink = input.url; } },
    });

    try {
      await app.inject({ method: 'POST', url: '/api/auth/magic-link', payload: { email } });
      const loginToken = new URL(magicLink).searchParams.get('token');
      assert.ok(loginToken);
      const login = await app.inject({ method: 'GET', url: `/api/auth/verify?token=${loginToken}` });
      const headers = { cookie: String(login.headers['set-cookie']).split(';')[0] };

      const projectResponse = await app.inject({
        method: 'POST', url: '/api/admin/projects', headers,
        payload: { name: 'Experiment project', origins: ['https://experiment.example.com'] },
      });
      const project = projectResponse.json().project;
      const pages = await app.inject({ method: 'GET', url: `/api/admin/projects/${project.id}/pages`, headers });
      const page = pages.json().pages[0];
      const draftResponse = await app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/drafts`, headers, payload: {},
      });
      const draft = draftResponse.json().draft;
      const append = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/operations`, headers,
        payload: {
          expectedRevision: 0,
          sourceSnapshot: {
            algorithm: 'lykar-dom-v1',
            pageHash: 'b'.repeat(64),
            capturedAt: '2026-08-06T00:00:00.000Z',
          },
          operations: [{
            schemaVersion: 1,
            id: `experiment-title-${project.id}`,
            kind: 'setText',
            target: { marker: 'hero-title', fingerprint: { tag: 'h1' } },
            value: 'Variant B',
          }],
        },
      });
      const publish = await app.inject({
        method: 'POST', url: `/api/admin/drafts/${draft.id}/publish`, headers,
        payload: { expectedRevision: append.json().draft.revision },
      });
      const release = publish.json().release;

      const createExperiment = async (name: string) => app.inject({
        method: 'POST', url: `/api/admin/pages/${page.id}/experiments`, headers,
        payload: {
          name,
          variants: [
            { key: 'A', releaseId: null, description: 'Native control' },
            { key: 'B', releaseId: release.id, description: 'Treatment' },
          ],
        },
      });
      const firstResponse = await createExperiment('First A/B');
      assert.equal(firstResponse.statusCode, 201, firstResponse.body);
      const first = firstResponse.json().experiment;
      const activation = await app.inject({
        method: 'POST', url: `/api/admin/experiments/${first.id}/activate`, headers, payload: {},
      });
      assert.equal(activation.statusCode, 200, activation.body);
      assert.equal(activation.json().experiment.status, 'active');

      const createLink = async (key: 'A' | 'B') => app.inject({
        method: 'POST', url: `/api/admin/experiments/${first.id}/variants/${key}/links`, headers, payload: {},
      });
      const aLinkResponse = await createLink('A');
      const bLinkResponse = await createLink('B');
      const aToken = new URL(aLinkResponse.json().url).searchParams.get('lykar_variant');
      const bToken = new URL(bLinkResponse.json().url).searchParams.get('lykar_variant');
      assert.ok(aToken && bToken);

      const runtimeUrl = `/api/runtime/projects/${project.publicKey}/manifest?pathname=%2F&variantToken=`;
      const nativeA = await app.inject({ method: 'GET', url: `${runtimeUrl}${aToken}` });
      assert.equal(nativeA.statusCode, 200, nativeA.body);
      assert.equal(nativeA.json().manifest, null);
      assert.deepEqual(nativeA.json().variant, { experimentId: first.id, key: 'A' });
      const treatmentB = await app.inject({ method: 'GET', url: `${runtimeUrl}${bToken}` });
      assert.equal(treatmentB.statusCode, 200, treatmentB.body);
      assert.equal(treatmentB.json().manifest.releaseId, release.id);
      assert.equal(treatmentB.json().manifest.sourceSnapshot.pageHash, 'b'.repeat(64));

      const lockedUpdate = await app.inject({
        method: 'PATCH', url: `/api/admin/experiments/${first.id}/variants/B`, headers,
        payload: { releaseId: null },
      });
      assert.equal(lockedUpdate.statusCode, 409, lockedUpdate.body);

      const second = (await createExperiment('Second A/B')).json().experiment;
      const conflictingActivation = await app.inject({
        method: 'POST', url: `/api/admin/experiments/${second.id}/activate`, headers, payload: {},
      });
      assert.equal(conflictingActivation.statusCode, 409, conflictingActivation.body);

      const revoked = await app.inject({
        method: 'DELETE', url: `/api/admin/variant-links/${bLinkResponse.json().link.id}`, headers,
      });
      assert.equal(revoked.statusCode, 204, revoked.body);
      assert.equal((await app.inject({ method: 'GET', url: `${runtimeUrl}${bToken}` })).statusCode, 204);

      const replacementB = await createLink('B');
      const replacementToken = new URL(replacementB.json().url).searchParams.get('lykar_variant');
      assert.ok(replacementToken);
      await app.inject({ method: 'POST', url: `/api/admin/experiments/${first.id}/pause`, headers, payload: {} });
      assert.equal((await app.inject({ method: 'GET', url: `${runtimeUrl}${replacementToken}` })).statusCode, 204);
      await app.inject({ method: 'POST', url: `/api/admin/experiments/${first.id}/activate`, headers, payload: {} });
      assert.equal((await app.inject({ method: 'GET', url: `${runtimeUrl}${replacementToken}` })).statusCode, 200);
      await app.inject({ method: 'POST', url: `/api/admin/experiments/${first.id}/complete`, headers, payload: {} });
      assert.equal((await app.inject({ method: 'GET', url: `${runtimeUrl}${replacementToken}` })).statusCode, 204);
      const cannotRestart = await app.inject({
        method: 'POST', url: `/api/admin/experiments/${first.id}/activate`, headers, payload: {},
      });
      assert.equal(cannotRestart.statusCode, 409, cannotRestart.body);
      assert.equal((await app.inject({
        method: 'POST', url: `/api/admin/experiments/${second.id}/activate`, headers, payload: {},
      })).statusCode, 200);

      const pool = new Pool({ connectionString: databaseUrl });
      try {
        const stored = await pool.query<{ token_hash: string }>(
          'SELECT token_hash FROM experiment_variant_links WHERE id = $1',
          [replacementB.json().link.id],
        );
        assert.equal(stored.rows[0].token_hash.trim(), createHash('sha256').update(replacementToken).digest('hex'));
        assert.notEqual(stored.rows[0].token_hash.trim(), replacementToken);
      } finally {
        await pool.end();
      }
    } finally {
      await app.close();
    }
  },
);
