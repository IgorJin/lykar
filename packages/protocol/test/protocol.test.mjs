import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  appendTargetBindingV1,
  OPERATION_SCHEMA_VERSION,
  parseTargetRegistryV1,
  parseOperationV1,
  parsePublishedManifestV1,
  validateTargetRegistryV1,
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

test('serializes a scoped logical target with immutable environment bindings', () => {
  const registry = {
    schemaVersion: 1,
    targets: [{
      id: 'checkout-cta',
      scope: {
        projectId: 'project-1',
        pageId: 'page-1',
        root: { id: 'pricing-card', kind: 'element', descriptor: { marker: 'pricing-card' } },
      },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
    bindings: [{
      schemaVersion: 1,
      targetId: 'checkout-cta',
      bindingVersion: 1,
      environment: 'production',
      descriptor: { marker: 'checkout', selectors: { css: '.checkout' } },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
  };

  const parsed = parseTargetRegistryV1(JSON.parse(JSON.stringify(registry)));
  assert.deepEqual(parsed, registry);
});

test('rejects duplicate binding versions and bindings for unknown targets', () => {
  const result = validateTargetRegistryV1({
    schemaVersion: 1,
    targets: [],
    bindings: [{
      schemaVersion: 1,
      targetId: 'missing',
      bindingVersion: 1,
      environment: 'production',
      descriptor: { marker: 'cta' },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /does not exist/);
});

test('appends a rebind revision without changing the frozen registry bytes', () => {
  const registry = {
    schemaVersion: 1,
    targets: [{
      id: 'cta',
      scope: { projectId: 'project-1', pageId: 'page-1', root: { id: 'document', kind: 'document' } },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
    bindings: [{
      schemaVersion: 1,
      targetId: 'cta',
      bindingVersion: 1,
      environment: 'production',
      descriptor: { marker: 'old-cta' },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
  };
  const frozenBytes = JSON.stringify(registry);
  const frozenHash = createHash('sha256').update(frozenBytes).digest('hex');
  const result = appendTargetBindingV1(registry, {
    targetId: 'cta',
    environment: 'production',
    descriptor: { marker: 'new-cta' },
    createdAt: '2026-09-22T00:00:00.000Z',
  });

  assert.equal(result.reference.bindingVersion, 2);
  assert.equal(result.snapshot.bindings.length, 2);
  assert.equal(JSON.stringify(registry), frozenBytes);
  assert.equal(createHash('sha256').update(JSON.stringify(registry)).digest('hex'), frozenHash);
});

test('keeps mutable before-state separate from locator identity and desired-state', () => {
  const result = validateOperationV1({
    schemaVersion: 1,
    id: 'text-state',
    kind: 'setText',
    target: { marker: 'hero', fingerprint: { tag: 'h1' } },
    precondition: { before: { textHash: 'a'.repeat(64), attributes: { lang: null } } },
    desiredState: { textHash: 'b'.repeat(64) },
    value: 'After',
  });

  assert.equal(result.ok, true, JSON.stringify(result));
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

test('requires an exact frozen binding and matching release environment', () => {
  const registry = {
    schemaVersion: 1,
    targets: [{
      id: 'hero',
      scope: { projectId: 'project-1', pageId: 'page-1', root: { id: 'document', kind: 'document' } },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
    bindings: [{
      schemaVersion: 1,
      targetId: 'hero',
      bindingVersion: 2,
      environment: 'production',
      descriptor: { marker: 'hero' },
      createdAt: '2026-09-21T00:00:00.000Z',
    }],
  };
  const manifest = {
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/',
    releaseId: 'release-1',
    version: 1,
    manifestHash: 'a'.repeat(64),
    targetEnvironment: 'production',
    targetRegistry: registry,
    operations: [{
      schemaVersion: 1,
      id: 'text',
      kind: 'setText',
      target: { binding: { targetId: 'hero', bindingVersion: 2, environment: 'production' } },
      value: 'Hello',
    }],
    createdAt: '2026-09-21T00:00:00.000Z',
  };

  assert.equal(validatePublishedManifestV1(manifest).ok, true);
  const mutableLatest = structuredClone(manifest);
  mutableLatest.operations[0].target.binding.bindingVersion = 3;
  const result = validatePublishedManifestV1(mutableLatest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /not frozen/);
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
