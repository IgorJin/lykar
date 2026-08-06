import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPERATION_SCHEMA_VERSION,
  parseOperationV1,
  parsePublishedManifestV1,
  validateOperationV1,
  validatePublishedManifestV1,
} from '../dist/index.js';

const target = {
  marker: 'hero-title',
  selectors: { css: '#hero-title', xpath: '//*[@id="hero-title"]' },
};

test('accepts every operation kind in schema version 1', () => {
  const operations = [
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
      node: {
        type: 'element',
        tag: 'span',
        attributes: { class: 'badge' },
        children: [{ type: 'text', value: 'New' }],
      },
    },
    { schemaVersion: 1, id: 'remove', kind: 'removeNode', target },
    { schemaVersion: 1, id: 'move', kind: 'moveNode', target, destination: target, position: 'after' },
  ];

  for (const operation of operations) {
    const result = validateOperationV1(operation);
    assert.equal(result.ok, true, JSON.stringify(result));
  }

  assert.equal(OPERATION_SCHEMA_VERSION, 1);
  assert.equal(operations.length, 7);
});

test('rejects operations without a stable target locator', () => {
  const result = validateOperationV1({
    schemaVersion: 1,
    id: 'invalid-target',
    kind: 'setText',
    target: {},
    value: 'Hello',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /target/);
});

test('rejects malformed markers even when a selector fallback exists', () => {
  const result = validateOperationV1({
    schemaVersion: 1,
    id: 'invalid-marker',
    kind: 'removeNode',
    target: { marker: 42, selectors: { css: '#target' } },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /target/);
});

test('rejects unknown schema versions and operation kinds', () => {
  assert.throws(
    () => parseOperationV1({
      schemaVersion: 2,
      id: 'future-operation',
      kind: 'executeScript',
      target,
    }),
    /schemaVersion must be 1.*kind is not supported/,
  );
});

test('accepts a published manifest containing protocol v1 operations', () => {
  const result = validatePublishedManifestV1({
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/pricing',
    releaseId: 'release-1',
    version: 3,
    manifestHash: 'a'.repeat(64),
    sourceSnapshot: {
      algorithm: 'lykar-dom-v1',
      pageHash: 'b'.repeat(64),
      capturedAt: '2026-08-06T00:00:00.000Z',
    },
    operations: [
      { schemaVersion: 1, id: 'text', kind: 'setText', target, value: 'Hello' },
    ],
    createdAt: '2026-08-06T00:00:00.000Z',
  });

  assert.equal(result.ok, true, JSON.stringify(result));
});

test('rejects malformed source compatibility snapshots', () => {
  const result = validatePublishedManifestV1({
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/pricing',
    releaseId: 'release-1',
    version: 1,
    manifestHash: 'a'.repeat(64),
    sourceSnapshot: { algorithm: 'unknown', pageHash: 'short', capturedAt: 'never' },
    operations: [],
    createdAt: '2026-08-06T00:00:00.000Z',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /sourceSnapshot/);
});

test('reports indexed operation failures in malformed manifests', () => {
  assert.throws(
    () => parsePublishedManifestV1({
      schemaVersion: 1,
      projectId: 'project-1',
      pageId: 'page-1',
      pathname: '/pricing',
      releaseId: 'release-1',
      version: 0,
      manifestHash: 'not-a-hash',
      operations: [{ schemaVersion: 1, id: 'unsafe', kind: 'executeScript', target }],
      createdAt: 'not-a-date',
    }),
    /version must be a positive integer.*createdAt must be an ISO-compatible date string.*operations\[0\]/,
  );
});
