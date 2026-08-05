import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ActivationResult,
  AppendOperationsResult,
  DraftRecord,
  ProjectRecord,
  PublishResult,
  ReleaseRecord,
  RuntimeManifest,
  VersioningRepository,
} from './domain/versioning';
import type { OperationV1 } from '@lykar/protocol';
import { buildApp } from './app';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_ID = '33333333-3333-4333-8333-333333333333';
const MANIFEST_HASH = 'a'.repeat(64);

class ApiRepository implements VersioningRepository {
  createProjectCalls = 0;

  async createProject(input: Parameters<VersioningRepository['createProject']>[0]): Promise<ProjectRecord> {
    this.createProjectCalls++;
    return {
      id: PROJECT_ID,
      name: input.name,
      publicKey: input.publicKey,
      origins: input.origins.map(item => item.origin),
      createdAt: '2026-01-01T00:00:00.000Z',
    };
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return [];
  }

  async createDraft(input: Parameters<VersioningRepository['createDraft']>[0]): Promise<DraftRecord> {
    return {
      id: DRAFT_ID,
      projectId: input.projectId,
      baseReleaseId: input.baseReleaseId ?? null,
      publishedReleaseId: null,
      status: 'open',
      revision: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  async listDrafts(): Promise<DraftRecord[]> {
    return [];
  }

  async getDraft(): Promise<{ draft: DraftRecord; operations: OperationV1[] }> {
    throw new Error('Not used in this test');
  }

  async appendOperations(
    input: Parameters<VersioningRepository['appendOperations']>[0],
  ): Promise<AppendOperationsResult> {
    return { draftId: input.draftId, revision: input.expectedRevision + 1, appended: input.operations.length };
  }

  async publishDraft(): Promise<PublishResult> {
    throw new Error('Not used in this test');
  }

  async activateRelease(): Promise<ActivationResult> {
    throw new Error('Not used in this test');
  }

  async listReleases(): Promise<ReleaseRecord[]> {
    return [];
  }

  async resolveRuntimeManifest(): Promise<RuntimeManifest> {
    return {
      projectId: PROJECT_ID,
      releaseId: RELEASE_ID,
      version: 1,
      manifestHash: MANIFEST_HASH,
      operations: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
  }
}

test('admin endpoints fail closed without the configured token', async () => {
  const repository = new ApiRepository();
  const app = buildApp({ logger: false, adminToken: 'admin-secret', versioningRepository: repository });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/projects',
      payload: { name: 'Site', origins: ['https://example.com'] },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error.code, 'UNAUTHORIZED');
    assert.equal(repository.createProjectCalls, 0);
  } finally {
    await app.close();
  }
});

test('authorized admin can create a project', async () => {
  const repository = new ApiRepository();
  const app = buildApp({ logger: false, adminToken: 'admin-secret', versioningRepository: repository });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/projects',
      headers: { 'x-lykar-admin-token': 'admin-secret' },
      payload: { name: 'Site', origins: ['https://Example.com'] },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().project.id, PROJECT_ID);
    assert.deepEqual(response.json().project.origins, ['https://example.com']);
    assert.equal(repository.createProjectCalls, 1);
  } finally {
    await app.close();
  }
});

test('public immutable manifest supports cache validation without admin auth', async () => {
  const app = buildApp({ logger: false, adminToken: 'admin-secret', versioningRepository: new ApiRepository() });

  try {
    const first = await app.inject({
      method: 'GET',
      url: '/api/runtime/projects/pk_public/manifest?version=1',
    });

    assert.equal(first.statusCode, 200);
    assert.equal(first.headers.etag, `"${MANIFEST_HASH}"`);
    assert.match(first.headers['cache-control'] ?? '', /immutable/);

    const cached = await app.inject({
      method: 'GET',
      url: '/api/runtime/projects/pk_public/manifest?version=1',
      headers: { 'if-none-match': `"${MANIFEST_HASH}"` },
    });
    assert.equal(cached.statusCode, 304);
  } finally {
    await app.close();
  }
});

test('invalid persisted operation is rejected with a structured 400 response', async () => {
  const app = buildApp({ logger: false, adminToken: 'admin-secret', versioningRepository: new ApiRepository() });

  try {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/drafts/${DRAFT_ID}/operations`,
      headers: { 'x-lykar-admin-token': 'admin-secret' },
      payload: {
        expectedRevision: 0,
        operations: [{ schemaVersion: 1, id: 'bad', kind: 'executeScript', target: { marker: 'hero' } }],
      },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error.code, 'VALIDATION_ERROR');
  } finally {
    await app.close();
  }
});
