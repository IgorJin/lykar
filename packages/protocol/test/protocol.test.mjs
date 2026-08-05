import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPERATION_SCHEMA_VERSION,
  parseOperationV1,
  validateOperationV1,
} from '../dist/index.js';

const target = {
  marker: 'hero-title',
  selectors: { css: '#hero-title', xpath: '//*[@id="hero-title"]' },
};

test('accepts every operation kind in schema version 1', () => {
  const operations = [
    { schemaVersion: 1, id: 'text', kind: 'setText', target, value: 'Hello' },
    { schemaVersion: 1, id: 'style', kind: 'setStyle', target, property: 'color', value: 'red' },
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
