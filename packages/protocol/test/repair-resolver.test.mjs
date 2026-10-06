import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveTargetRepairs, parsePublishedManifestV1} from '../dist/index.js';

const text = (id, target = '#old', revision) => ({schemaVersion: 1, id, kind: 'setText',
  target: {selectors: {css: target}}, value: 'Published', ...(revision ? {revision} : {})});
const repair = (id, previousOperationId, target) => text(id, target, {previousOperationId, reason: 'target-repair'});
const published = operations => ({schemaVersion: 1, projectId: 'project', pageId: 'page',
  pathname: '/page', releaseId: 'release', version: 2, manifestHash: 'a'.repeat(64), operations,
  createdAt: '2026-10-04T00:00:00.000Z'});

test('target repairs select the leaf without changing immutable history or dropping undo', () => {
  const original = text('original');
  const first = repair('first', 'original', '#first');
  const last = repair('last', 'first', '#last');
  const undo = {...text('undo', '#last', {previousOperationId: 'last', reason: 'undo'}), value: 'Native'};
  const operations = [original, first, last, undo];
  const snapshot = JSON.stringify(operations);
  assert.deepEqual(resolveTargetRepairs(operations).map(operation => operation.id), ['last', 'undo']);
  assert.equal(JSON.stringify(operations), snapshot);
  assert.equal(parsePublishedManifestV1(published(operations)).operations.length, 4);
});

test('repair references must identify an active preceding operation of the same kind', () => {
  for (const operations of [
    [repair('repair', 'unknown', '#new')],
    [text('original'), repair('first', 'original', '#first'), repair('branch', 'original', '#branch')],
    [text('original'), {...repair('wrong-kind', 'original', '#new'), kind: 'setStyle', property: 'color'}],
  ]) assert.throws(() => resolveTargetRepairs(operations), /active preceding/);
});

test('conditional repairs retarget the complete group before consistency validation', () => {
  const base = {schemaVersion: 2, target: {selectors: {css: '#old'}}, condition: {id: 'group', text: 'Continue'}};
  const first = {...base, id: 'text', kind: 'setText', value: 'Next'};
  const second = {...base, id: 'color', kind: 'setStyle', property: 'color', value: 'navy'};
  const revised = [first, second].map(operation => ({...operation, id: `${operation.id}-repair`,
    target: {selectors: {css: '#new'}}, revision: {previousOperationId: operation.id, reason: 'target-repair'}}));
  assert.deepEqual(resolveTargetRepairs([first, second, ...revised]).map(operation => operation.id), ['text-repair', 'color-repair']);
  assert.equal(parsePublishedManifestV1(published([first, second, ...revised])).operations.length, 4);
  assert.throws(() => parsePublishedManifestV1(published([first, second, revised[0]])), /disagrees/);
  assert.throws(() => resolveTargetRepairs([first, {...revised[0], condition: {id: 'other', text: 'Continue'}}]), /preserve/);
  assert.throws(() => resolveTargetRepairs([second, {...revised[1], priority: 'important'}]), /preserve/);
});
