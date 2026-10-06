import assert from 'node:assert/strict';
import test from 'node:test';

import { DeploymentService, type DeploymentAction, type DeploymentRepository } from './deployments';
import { ValidationError } from './versioning';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PAGE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RELEASE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const body = {releaseId: RELEASE, expectedRevision: 0, idempotencyKey: 'deployment-key-01', reason: 'Ship version one'};

class CapturingRepository implements DeploymentRepository {
  mutations: Parameters<DeploymentRepository['activate']>[0][] = [];
  states: [string, string][] = [];
  histories: Parameters<DeploymentRepository['listHistory']>[0][] = [];
  resolutions: Parameters<DeploymentRepository['resolve']>[0][] = [];
  async activate(input: Parameters<DeploymentRepository['activate']>[0]) {
    this.mutations.push(input);
    return {deployment: {pageId: input.pageId, revision: 1, activeReleaseId: input.releaseId, activation: null}, replayed: false};
  }
  async getState(userId: string, pageId: string) {
    this.states.push([userId, pageId]);
    return {pageId, revision: 0, activeReleaseId: null, activation: null};
  }
  async listHistory(input: Parameters<DeploymentRepository['listHistory']>[0]) {
    this.histories.push(input);
    return {activations: [], nextBeforeRevision: null};
  }
  async resolve(input: Parameters<DeploymentRepository['resolve']>[0]) {
    this.resolutions.push(input);
    return null;
  }
}

test('deployment validation rejects invalid mutations before reaching the repository', () => {
  const repository = new CapturingRepository();
  const service = new DeploymentService(repository);
  for (const reason of [undefined, null, 12, '', ' \n ', 'x'.repeat(501)]) {
    assert.throws(() => service.activate(USER, PAGE, 'deploy', {...body, reason}), ValidationError);
  }
  for (const expectedRevision of [-1, 0.5, '0', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
    assert.throws(() => service.activate(USER, PAGE, 'deploy', {...body, expectedRevision}), ValidationError);
  }
  for (const idempotencyKey of [undefined, 123, 'short', 'x'.repeat(161), 'deployment key-01', 'deployment/key-01']) {
    assert.throws(() => service.activate(USER, PAGE, 'deploy', {...body, idempotencyKey}), ValidationError);
  }
  for (const releaseId of [undefined, null, 'other-page', 123]) {
    for (const action of ['deploy', 'rollback'] as const) {
      assert.throws(() => service.activate(USER, PAGE, action, {...body, releaseId}), ValidationError);
    }
  }
  assert.throws(() => service.activate(USER, PAGE, 'disable', body), /Disable must not contain/);
  assert.throws(() => service.activate(USER, PAGE, 'publish' as DeploymentAction, body), /Invalid deployment action/);
  assert.throws(() => service.activate('bad-user', PAGE, 'deploy', body), /userId/);
  assert.throws(() => service.activate(USER, 'bad-page', 'deploy', body), /pageId/);
  assert.equal(repository.mutations.length, 0);
});

test('canonical retry hashes ignore reason whitespace and request identity but include every mutation field', async () => {
  const repository = new CapturingRepository();
  const service = new DeploymentService(repository);
  await service.activate(USER, PAGE, 'deploy', {...body, reason: '  Ship version one\n'});
  await service.activate(USER, PAGE, 'deploy', {...body, idempotencyKey: 'deployment-key-02'});
  const [first, retry] = repository.mutations;
  assert.equal(first.reason, body.reason);
  assert.equal(first.payloadHash, retry.payloadHash);
  assert.match(first.payloadHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.id, retry.id);
  for (const [action, change] of [
    ['rollback', {}], ['deploy', {expectedRevision: 1}],
    ['deploy', {reason: 'Ship version two'}], ['deploy', {releaseId: PAGE}],
  ] as const) {
    await service.activate(USER, PAGE, action, {...body, ...change});
    assert.notEqual(repository.mutations[repository.mutations.length - 1]?.payloadHash, first.payloadHash);
  }
  await service.activate(USER, PAGE, 'disable', {...body, releaseId: undefined});
  await service.activate(USER, PAGE, 'disable', {...body, releaseId: null});
  assert.equal(repository.mutations[repository.mutations.length - 1]?.releaseId, null);
  assert.equal(repository.mutations[repository.mutations.length - 1]?.payloadHash, repository.mutations[repository.mutations.length - 2]?.payloadHash);
  await service.activate(USER, PAGE, 'deploy', {...body, reason: '🚀'.repeat(500), expectedRevision: Number.MAX_SAFE_INTEGER});
  assert.equal(repository.mutations[repository.mutations.length - 1]?.reason, '🚀'.repeat(500));
});

test('state and bounded history validate identifiers and pass the cursor to the repository', async () => {
  const repository = new CapturingRepository();
  const service = new DeploymentService(repository);
  await service.getState(USER, PAGE);
  await service.listHistory(USER, PAGE);
  await service.listHistory(USER, PAGE, '9', '100');
  assert.deepEqual(repository.states, [[USER, PAGE]]);
  assert.deepEqual(repository.histories, [
    {userId: USER, pageId: PAGE, limit: 50},
    {userId: USER, pageId: PAGE, limit: 100, beforeRevision: 9},
  ]);
  for (const invalid of [0, -1, 1.5, 'bad', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => service.listHistory(USER, PAGE, invalid), ValidationError);
  }
  for (const invalid of [0, -1, 1.5, 101, 'bad']) {
    assert.throws(() => service.listHistory(USER, PAGE, undefined, invalid), ValidationError);
  }
  assert.throws(() => service.getState(USER, 'invalid'), /pageId/);
  assert.throws(() => service.getState('invalid', PAGE), /userId/);
  assert.throws(() => service.listHistory(USER, 'invalid'), /pageId/);
  assert.throws(() => service.listHistory('invalid', PAGE), /userId/);
  assert.equal(repository.histories.length, 2);
});

test('runtime resolution requires an explicit valid key, pathname and origin', async () => {
  const repository = new CapturingRepository();
  const service = new DeploymentService(repository);
  await service.resolve('pk_example-1', '//pricing///', 'https://example.com');
  assert.deepEqual(repository.resolutions, [{publicKey: 'pk_example-1', pathname: '/pricing', origin: 'https://example.com'}]);
  for (const invalid of [undefined, null, '', 'pk_', 'secret', 'pk_has space', `pk_${'a'.repeat(161)}`]) {
    assert.throws(() => service.resolve(invalid, '/', 'https://example.com'), ValidationError);
  }
  for (const invalid of [undefined, null, 'pricing', '/pricing?x=1', '/pricing#hero', '/pricing\\child']) {
    assert.throws(() => service.resolve('pk_example', invalid, 'https://example.com'), ValidationError);
  }
  for (const invalid of [undefined, null, '', 'example.com', 'file:///tmp/', 'https://user@example.com', 'https://example.com/pricing', 'https://example.com/?x=1', 'https://example.com/#hero', 'https://example.com/', 'https://EXAMPLE.com', 'https://example.com:443']) {
    assert.throws(() => service.resolve('pk_example', '/', invalid), ValidationError);
  }
  assert.equal(repository.resolutions.length, 1);
});
