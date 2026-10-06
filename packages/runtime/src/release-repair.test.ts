import type {Operation, PublishedManifestV1} from '@lykar/protocol';
import {JSDOM} from 'jsdom';
import {afterEach, describe, expect, it} from 'vitest';
import {Lykar} from './runtime.js';

const instances: Lykar[] = [];
const documents: JSDOM[] = [];
function runtime(operations: Operation[], version = 2) {
  const dom = new JSDOM('<p id="old">Old native</p><p id="new">New native</p>', {url: 'https://site.test/page'});
  documents.push(dom);
  const manifest: PublishedManifestV1 = {schemaVersion: 1, projectId: 'project', pageId: 'page',
    pathname: '/page', releaseId: `release-${version}`, version, manifestHash: 'a'.repeat(64), operations,
    createdAt: '2026-10-04T00:00:00.000Z'};
  const instance = new Lykar({projectKey: 'pk_repair', version, document: dom.window.document, waitForDom: false,
    fetch: async () => ({ok: true, status: 200, json: async () => ({manifest})}) as Response});
  instances.push(instance);
  return {instance, document: dom.window.document};
}

afterEach(() => {
  for (const instance of instances.splice(0)) instance.destroy();
  for (const dom of documents.splice(0)) dom.window.close();
});

describe('published target repair chains', () => {
  it('keeps the old release immutable and executes only the repaired target in a new release', async () => {
    const original: Operation = {schemaVersion: 1, id: 'original', kind: 'setText',
      target: {selectors: {css: '#old'}}, value: 'Published'};
    const repaired: Operation = {...original, id: 'repaired', target: {selectors: {css: '#new'}},
      revision: {previousOperationId: 'original', reason: 'target-repair'}};
    const old = runtime([original], 1);
    const next = runtime([original, repaired]);
    await expect(old.instance.start()).resolves.toMatchObject({applied: 1});
    expect(old.document.querySelector('#old')?.textContent).toBe('Published');
    expect(old.document.querySelector('#new')?.textContent).toBe('New native');
    await expect(next.instance.start()).resolves.toMatchObject({applied: 1, operations: [
      {operationId: 'original', status: 'skipped', code: 'OPERATION_SUPERSEDED'},
      {operationId: 'repaired', status: 'applied'},
    ]});
    expect(next.document.querySelector('#old')?.textContent).toBe('Old native');
    expect(next.document.querySelector('#new')?.textContent).toBe('Published');
  });

  it('executes ordinary undo after the repair rather than filtering it as another repair', async () => {
    const original: Operation = {schemaVersion: 1, id: 'original', kind: 'setText',
      target: {selectors: {css: '#old'}}, value: 'Published'};
    const repaired: Operation = {...original, id: 'repaired', target: {selectors: {css: '#new'}},
      revision: {previousOperationId: 'original', reason: 'target-repair'}};
    const undo: Operation = {...repaired, id: 'undo', value: 'New native',
      revision: {previousOperationId: 'repaired', reason: 'undo'}};
    const page = runtime([original, repaired, undo]);
    await expect(page.instance.start()).resolves.toMatchObject({applied: 2, errors: 0});
    expect(page.document.querySelector('#old')?.textContent).toBe('Old native');
    expect(page.document.querySelector('#new')?.textContent).toBe('New native');
  });

  it('compiles only repaired conditional group effects under one owner', async () => {
    const base: Operation[] = [
      {schemaVersion: 2, id: 'text', kind: 'setText', target: {selectors: {css: '#old'}},
        condition: {id: 'group', text: 'Old native'}, value: 'Next'},
      {schemaVersion: 2, id: 'color', kind: 'setStyle', target: {selectors: {css: '#old'}},
        condition: {id: 'group', text: 'Old native'}, property: 'color', value: 'navy'},
    ];
    const repaired: Operation[] = base.map(operation => ({...operation, id: `${operation.id}-repair`,
      target: {selectors: {css: '#new'}}, revision: {previousOperationId: operation.id, reason: 'target-repair'}}));
    const page = runtime([...base, ...repaired]);
    page.document.querySelector('#new')!.textContent = 'Old native';
    const root = page.document.body;
    (page.document.defaultView as unknown as Record<symbol, unknown>)[Symbol.for('@lykar/framework-roots/v1')] =
      new Map([[root, {root, framework: 'react', phase: 'ready', mode: 'csr', generation: 1}]]);
    await expect(page.instance.start()).resolves.toMatchObject({applied: 2, errors: 0, operations: [
      {operationId: 'text', code: 'OPERATION_SUPERSEDED'}, {operationId: 'color', code: 'OPERATION_SUPERSEDED'},
      {operationId: 'text-repair', code: 'CONDITIONAL_ACTIVE'}, {operationId: 'color-repair', code: 'CONDITIONAL_ACTIVE'},
    ]});
    expect(page.document.querySelector('#old')?.textContent).toBe('Old native');
    expect(page.document.querySelector('#new')?.textContent).toBe('Next');
    expect(page.instance.conditionalState.groups).toHaveLength(1);
    page.instance.destroy();
    expect(page.document.querySelector('#new')?.textContent).toBe('Old native');
    expect(page.document.head.querySelectorAll('style')).toHaveLength(0);
  });
});
