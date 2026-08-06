import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AnalyticsService,
  assignmentBucket,
  type AnalyticsRepository,
  type ExperimentAnalyticsReport,
} from './analytics';

const ASSIGNMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXPERIMENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ANONYMOUS_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-08-06T12:00:00.000Z');

class CapturingRepository implements AnalyticsRepository {
  resolution?: Parameters<AnalyticsRepository['resolveAssignment']>[0];
  event?: Parameters<AnalyticsRepository['recordEvent']>[0];

  async resolveAssignment(input: Parameters<AnalyticsRepository['resolveAssignment']>[0]) {
    this.resolution = input;
    return { assignmentId: ASSIGNMENT_ID, experimentId: EXPERIMENT_ID, variantKey: 'B' as const, manifest: null };
  }
  async recordEvent(input: Parameters<AnalyticsRepository['recordEvent']>[0]) {
    this.event = input;
    return { duplicate: false };
  }
  async getReport(): Promise<ExperimentAnalyticsReport> { throw new Error('unused'); }
}

test('experiment selection hashes the browser ID and issues a scoped event capability', async () => {
  const repository = new CapturingRepository();
  const service = new AnalyticsService(repository, { signingSecret: 's'.repeat(32), now: () => NOW });
  const selection = await service.resolveExperiment('pk_public', '/pricing/', 't'.repeat(43), ANONYMOUS_ID);

  assert.ok(selection);
  assert.equal(repository.resolution?.pathname, '/pricing');
  assert.notEqual(repository.resolution?.visitorHash, ANONYMOUS_ID);
  assert.match(repository.resolution?.visitorHash ?? '', /^[0-9a-f]{64}$/);
  assert.equal(selection.assignmentId, ASSIGNMENT_ID);

  const recorded = await service.recordEvent(
    selection.capability,
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'conversion',
    'signup',
    { plan: 'pro', seats: 3 },
    NOW.toISOString(),
  );
  assert.deepEqual(recorded, { accepted: true, duplicate: false });
  assert.equal(repository.event?.assignmentId, ASSIGNMENT_ID);
  assert.deepEqual(repository.event?.properties, { plan: 'pro', seats: 3 });
});

test('analytics capability rejects tampering and event properties reject page data', async () => {
  const repository = new CapturingRepository();
  const service = new AnalyticsService(repository, { signingSecret: 's'.repeat(32), now: () => NOW });
  const selection = await service.resolveExperiment('pk_public', '/', 't'.repeat(43), ANONYMOUS_ID);
  assert.ok(selection);

  await assert.rejects(
    service.recordEvent(
      `${selection.capability}x`,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'exposure', '$exposure', {}, NOW.toISOString(),
    ),
    /capability is invalid/i,
  );
  await assert.rejects(
    service.recordEvent(
      selection.capability,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'conversion', 'signup', { url: 'https://private.example/path' }, NOW.toISOString(),
    ),
    /property url is not allowed/i,
  );
});

test('assignment bucket is deterministic and bounded', () => {
  const first = assignmentBucket(EXPERIMENT_ID, 'a'.repeat(64));
  assert.equal(first, assignmentBucket(EXPERIMENT_ID, 'a'.repeat(64)));
  assert.ok(first >= 0 && first < 10000);
});
