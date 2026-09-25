import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ExperimentRecord,
  ExperimentRepository,
  VariantRuntimeResolution,
} from './experiments';
import { ExperimentService } from './experiments';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RELEASE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

class CapturingExperimentRepository implements ExperimentRepository {
  created: Parameters<ExperimentRepository['createExperiment']>[0] | null = null;
  updated: Parameters<ExperimentRepository['updateVariant']>[0] | null = null;
  linkInput: Parameters<ExperimentRepository['createVariantLink']>[0] | null = null;

  async createExperiment(input: Parameters<ExperimentRepository['createExperiment']>[0]): Promise<ExperimentRecord> {
    this.created = input;
    return record(input.id, input.name);
  }
  async listExperiments(): Promise<ExperimentRecord[]> { return []; }
  async updateVariant(input: Parameters<ExperimentRepository['updateVariant']>[0]): Promise<ExperimentRecord> {
    this.updated = input;
    return record(input.experimentId, 'CTA test');
  }
  async transition(): Promise<ExperimentRecord> { throw new Error('unused'); }
  async createExperimentLink(): ReturnType<ExperimentRepository['createExperimentLink']> { throw new Error('unused'); }
  async revokeExperimentLink(): Promise<boolean> { return true; }
  async createVariantLink(input: Parameters<ExperimentRepository['createVariantLink']>[0]) {
    this.linkInput = input;
    return {
      link: { id: input.id, variantId: 'variant-a', tokenHint: input.tokenHint, revokedAt: null, createdAt: new Date().toISOString() },
      origin: 'https://example.com',
      pathname: '/pricing',
    };
  }
  async revokeVariantLink(): Promise<boolean> { return true; }
  async resolveVariant(): Promise<VariantRuntimeResolution | null> { return null; }
}

test('experiment creation requires exactly A and B with at least one immutable release', async () => {
  const repository = new CapturingExperimentRepository();
  const service = new ExperimentService(repository);

  await service.createExperiment(USER_ID, PAGE_ID, 'CTA test', [
    { key: 'A', releaseId: null, description: 'Native control' },
    { key: 'B', releaseId: RELEASE_ID, description: 'Treatment' },
  ]);

  assert.deepEqual(repository.created?.variants.map(variant => [variant.key, variant.releaseId]), [
    ['A', null],
    ['B', RELEASE_ID],
  ]);
  assert.throws(
    () => service.createExperiment(USER_ID, PAGE_ID, 'Empty', [
      { key: 'A', releaseId: null },
      { key: 'B', releaseId: null },
    ]),
    /at least one experiment variant/i,
  );
});

test('partial variant updates preserve omitted fields and retain explicit nulls', async () => {
  const repository = new CapturingExperimentRepository();
  const service = new ExperimentService(repository);
  const experimentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  await service.updateVariant(USER_ID, experimentId, 'B', undefined, undefined, 6000);
  assert.equal(repository.updated?.releaseId, undefined);
  assert.equal(repository.updated?.description, undefined);
  assert.equal(repository.updated?.weightBps, 6000);

  await service.updateVariant(USER_ID, experimentId, 'B', null, null, undefined);
  assert.equal(repository.updated?.releaseId, null);
  assert.equal(repository.updated?.description, null);
  assert.equal(repository.updated?.weightBps, undefined);
});

test('variant URLs expose an opaque token while repositories receive only its hash', async () => {
  const repository = new CapturingExperimentRepository();
  const service = new ExperimentService(repository);
  const result = await service.createVariantLink(
    USER_ID,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'A',
  );

  const token = new URLSearchParams(new URL(result.url).hash.slice(1)).get('lykar_variant');
  assert.ok(token);
  assert.ok(token.length >= 32);
  assert.notEqual(repository.linkInput?.tokenHash, token);
  assert.match(repository.linkInput?.tokenHash ?? '', /^[0-9a-f]{64}$/);
  assert.equal(repository.linkInput?.tokenHint, token.slice(-8));
});

function record(id: string, name: string): ExperimentRecord {
  const now = new Date().toISOString();
  return {
    id, projectId: 'project', pageId: PAGE_ID, name, status: 'draft',
    winnerVariantKey: null,
    firstActivatedAt: null, activatedAt: null, pausedAt: null, completedAt: null,
    createdAt: now, updatedAt: now, links: [],
    variants: [
      { id: 'variant-a', key: 'A', releaseId: null, releaseVersion: null, description: null, weightBps: 5000, links: [] },
      { id: 'variant-b', key: 'B', releaseId: RELEASE_ID, releaseVersion: 1, description: null, weightBps: 5000, links: [] },
    ],
  };
}
