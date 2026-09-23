import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  appendTargetBindingV1,
  OPERATION_SCHEMA_VERSION,
  PROTOCOL_LIMITS,
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

test('accepts optional style priority while keeping legacy style operations valid', () => {
  const base = {schemaVersion: 1, id: 'style-priority', kind: 'setStyle', target, property: 'color', value: 'red'};
  assert.equal(validateOperationV1(base).ok, true);
  assert.equal(validateOperationV1({...base, priority: 'important'}).ok, true);
  assert.equal(validateOperationV1({...base, value: '', priority: ''}).ok, true);
  assert.equal(validateOperationV1({...base, priority: 'urgent'}).ok, false);
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

test('accepts append-only undo/repair revisions and rejects forward revision references', () => {
  const manifest = {
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/',
    releaseId: 'release-revisions',
    version: 1,
    manifestHash: 'a'.repeat(64),
    operations: [
      {schemaVersion: 1, id: 'original', kind: 'setText', target, value: 'After'},
      {
        schemaVersion: 1, id: 'undo', kind: 'setText', target, value: 'Before',
        revision: {previousOperationId: 'original', reason: 'undo'},
      },
    ],
    createdAt: '2026-09-22T00:00:00.000Z',
  };

  assert.equal(validatePublishedManifestV1(manifest).ok, true);
  const invalid = structuredClone(manifest);
  invalid.operations.reverse();
  const result = validatePublishedManifestV1(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /revision must reference a preceding operation/);
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

test('accepts explicit dependencies and serializable references to inserted element and text nodes', () => {
  const manifest = {
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/',
    releaseId: 'release-ledger',
    version: 1,
    manifestHash: 'd'.repeat(64),
    operations: [
      {
        schemaVersion: 1,
        id: 'insert-card',
        kind: 'insertNode',
        target: {marker: 'root'},
        position: 'append',
        node: {
          type: 'element',
          tag: 'article',
          children: [{type: 'text', value: 'Draft'}],
        },
      },
      {
        schemaVersion: 1,
        id: 'edit-text',
        kind: 'setText',
        target: {nodeRef: {operationId: 'insert-card', path: [0]}},
        dependsOn: ['insert-card'],
        value: 'Ready',
      },
    ],
    createdAt: '2026-09-22T00:00:00.000Z',
  };

  const result = validatePublishedManifestV1(manifest);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(JSON.stringify(manifest).includes('nodeType'), false);
  assert.equal(JSON.stringify(manifest).includes('ownerDocument'), false);
});

test('rejects unavailable, forward, and implicit node dependencies', () => {
  const base = {
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/',
    releaseId: 'release-invalid-dependencies',
    version: 1,
    manifestHash: 'e'.repeat(64),
    createdAt: '2026-09-22T00:00:00.000Z',
  };
  const insertion = {
    schemaVersion: 1,
    id: 'later-insert',
    kind: 'insertNode',
    target: {marker: 'root'},
    position: 'append',
    node: {type: 'element', tag: 'span'},
  };
  const result = validatePublishedManifestV1({
    ...base,
    operations: [
      {
        schemaVersion: 1,
        id: 'early-edit',
        kind: 'setText',
        target: {nodeRef: {operationId: 'later-insert'}},
        dependsOn: ['later-insert'],
        value: 'No',
      },
      insertion,
      {
        schemaVersion: 1,
        id: 'implicit-edit',
        kind: 'setText',
        target: {nodeRef: {operationId: 'later-insert', path: [4]}},
        value: 'No',
      },
      {
        schemaVersion: 1,
        id: 'unknown',
        kind: 'setText',
        target: {marker: 'root'},
        dependsOn: ['missing'],
        value: 'No',
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /preceding operation/);
  assert.match(result.errors.join(' '), /must also appear in dependsOn/);
  assert.match(result.errors.join(' '), /path does not exist/);
  assert.match(result.errors.join(' '), /unknown operation missing/);
});

test('bounds operation count and serialized node depth before replay', () => {
  let node = {type: 'text', value: 'deep'};
  for (let index = 0; index < PROTOCOL_LIMITS.serializedNodeDepth; index += 1) {
    node = {type: 'element', tag: 'div', children: [node]};
  }
  const operation = {
    schemaVersion: 1,
    id: 'deep',
    kind: 'insertNode',
    target: {marker: 'root'},
    position: 'append',
    node,
  };
  const operationResult = validateOperationV1(operation);
  assert.equal(operationResult.ok, false);
  assert.match(operationResult.errors.join(' '), /insertNode.node is invalid/);

  const manifestResult = validatePublishedManifestV1({
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/',
    releaseId: 'release-too-many',
    version: 1,
    manifestHash: 'f'.repeat(64),
    operations: Array.from({length: PROTOCOL_LIMITS.operations + 1}, (_, index) => ({
      schemaVersion: 1,
      id: `operation-${index}`,
      kind: 'setText',
      target: {marker: 'root'},
      value: 'bounded',
    })),
    createdAt: '2026-09-22T00:00:00.000Z',
  });
  assert.equal(manifestResult.ok, false);
  assert.match(manifestResult.errors.join(' '), /at most 1000 items/);
});
