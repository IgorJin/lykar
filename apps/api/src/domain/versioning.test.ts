import assert from 'node:assert/strict';
import test from 'node:test';

import type { OperationV1 } from '@lykar/protocol';

import {
  hashSavePayload,
  VersioningService,
  type AppendOperationsResult,
  type DraftRecord,
  type PageRecord,
  type ProjectRecord,
  type PublishResult,
  type ReleaseRecord,
  type RuntimeManifest,
  type VersioningRepository,
} from './versioning';

const DRAFT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const IDEMPOTENCY_KEY = 'save-request-00000001';

class CapturingRepository implements VersioningRepository {
  createdProjectInput: Parameters<VersioningRepository['createProject']>[0] | undefined;
  appendedInput: Parameters<VersioningRepository['appendOperations']>[0] | undefined;

  async createProject(input: Parameters<VersioningRepository['createProject']>[0]): Promise<ProjectRecord> {
    this.createdProjectInput = input;
    return {
      id: input.id,
      name: input.name,
      publicKey: input.publicKey,
      origins: input.origins.map(item => item.origin),
      createdBy: input.ownerUserId,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return [];
  }

  async createPage(input: Parameters<VersioningRepository['createPage']>[0]): Promise<PageRecord> {
    return {
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      pathname: input.pathname,
      createdBy: input.userId,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  async listPages(): Promise<PageRecord[]> { return []; }

  async createDraft(input: Parameters<VersioningRepository['createDraft']>[0]): Promise<DraftRecord> {
    return {
      id: input.id,
      projectId: '22222222-2222-4222-8222-222222222222',
      pageId: input.pageId,
      baseReleaseId: input.baseReleaseId ?? null,
      publishedReleaseId: null,
      status: 'open',
      revision: 0,
      sourceSnapshot: null,
      createdBy: input.userId,
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
    this.appendedInput = input;
    return {
      draftId: input.draftId,
      revision: input.expectedRevision + 1,
      appended: input.operations.length,
      operationIds: input.operations.map(operation => operation.id),
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.payloadHash,
      replayed: false,
      savedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: input.resultExpiresAt,
    };
  }

  async publishDraft(): Promise<PublishResult> {
    throw new Error('Not used in this test');
  }

  async listReleases(): Promise<ReleaseRecord[]> {
    return [];
  }

  async resolveRuntimeManifest(): Promise<RuntimeManifest> {
    throw new Error('Not used in this test');
  }
}

test('createProject normalizes and deduplicates origins', async () => {
  const repository = new CapturingRepository();
  const service = new VersioningService(repository);

  const project = await service.createProject(USER_ID, '  Marketing site  ', [
    'https://Example.com',
    'https://example.com/',
  ]);

  assert.equal(project.name, 'Marketing site');
  assert.deepEqual(project.origins, ['https://example.com']);
  assert.match(project.publicKey, /^pk_[A-Za-z0-9_-]+$/);
  assert.equal(repository.createdProjectInput?.origins.length, 1);
});

test('appendOperations validates protocol v1 before touching the repository', () => {
  const repository = new CapturingRepository();
  const service = new VersioningService(repository);

  assert.throws(
    () => service.appendOperations(USER_ID, DRAFT_ID, IDEMPOTENCY_KEY, 0, [{
      schemaVersion: 1,
      id: 'unsafe',
      kind: 'executeScript',
      target: { marker: 'hero' },
    }]),
    /operations\[0\] is invalid/,
  );
  assert.equal(repository.appendedInput, undefined);
});

test('appendOperations accepts the complete static-page operation set', async () => {
  const repository = new CapturingRepository();
  const service = new VersioningService(repository);
  const target = { marker: 'hero' };
  const operations: OperationV1[] = [
    { schemaVersion: 1, id: 'text', kind: 'setText', target, value: 'Hello' },
    { schemaVersion: 1, id: 'style', kind: 'setStyle', target, property: 'color', value: 'red' },
    { schemaVersion: 1, id: 'attribute', kind: 'setAttribute', target, name: 'aria-label', value: 'Hero' },
    { schemaVersion: 1, id: 'remove-attribute', kind: 'removeAttribute', target, name: 'hidden' },
    {
      schemaVersion: 1,
      id: 'insert',
      kind: 'insertNode',
      target,
      position: 'append',
      node: { type: 'text', value: 'New' },
    },
    { schemaVersion: 1, id: 'remove', kind: 'removeNode', target },
    { schemaVersion: 1, id: 'move', kind: 'moveNode', target, destination: target, position: 'after' },
  ];

  const result = await service.appendOperations(USER_ID, DRAFT_ID, IDEMPOTENCY_KEY, 7, operations);

  assert.equal(result.revision, 8);
  assert.equal(result.appended, 7);
  assert.equal(result.idempotencyKey, IDEMPOTENCY_KEY);
  assert.deepEqual(repository.appendedInput?.operations, operations);
  assert.equal(repository.appendedInput?.payloadHash, hashSavePayload({expectedRevision: 7, operations}));
});

test('save payload hash is canonical and includes expected revision', () => {
  const operation: OperationV1 = {
    schemaVersion: 1, id: 'canonical', kind: 'setText', target: {marker: 'hero'}, value: 'Hello',
  };
  const reordered = {
    value: 'Hello', target: {marker: 'hero'}, kind: 'setText', id: 'canonical', schemaVersion: 1,
  } as OperationV1;

  assert.equal(
    hashSavePayload({expectedRevision: 2, operations: [operation]}),
    hashSavePayload({operations: [reordered], expectedRevision: 2}),
  );
  assert.notEqual(
    hashSavePayload({expectedRevision: 2, operations: [operation]}),
    hashSavePayload({expectedRevision: 3, operations: [operation]}),
  );
});
