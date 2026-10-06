import type {Operation, OperationV1} from '@lykar/protocol';
import {afterEach, describe, expect, it} from 'vitest';
import {EditorSession} from './session.js';

const sessions: EditorSession[] = [];
const frameworkKey = Symbol.for('@lykar/framework-roots/v1');
function readyRoot() {
  const root = document.body;
  (window as unknown as Record<symbol, unknown>)[frameworkKey] = new Map([[root,
    {root, framework: 'react', phase: 'ready', mode: 'csr', generation: 1},
  ]]);
}
function session(storage: Storage | null = null) {
  const instance = new EditorSession(document, {storage, storageKey: 'repair-draft'});
  sessions.push(instance);
  return instance;
}
const baseText: OperationV1 = {schemaVersion: 1, id: 'base-text', kind: 'setText',
  target: {selectors: {css: '#missing'}}, value: 'Published'};

afterEach(() => {
  for (const instance of sessions.splice(0)) instance.destroy();
  document.body.innerHTML = '';
  delete (window as unknown as Record<symbol, unknown>)[frameworkKey];
  sessionStorage.clear();
});

describe('repair from immutable base release', () => {
  it('cleans imported base ownership while preserving newer host and Draft changes', async () => {
    document.body.innerHTML = '<p id="copy" style="color: red">Native</p><p id="owned">Native owned</p>';
    const editor = session();
    await editor.restore([], undefined, [
      {...baseText, target: {selectors: {css: '#copy'}}},
      {schemaVersion: 1, id: 'base-color', kind: 'setStyle', target: {selectors: {css: '#copy'}}, property: 'color', value: 'blue'},
      {...baseText, id: 'owned-text', target: {selectors: {css: '#owned'}}, value: 'Base owned'},
    ]);
    expect(editor.getChanges().every(change => change.origin === 'release' && change.committed)).toBe(true);
    await editor.apply({operations: [{...baseText, id: 'draft-text', target: {selectors: {css: '#copy'}}, value: 'Draft'}]});
    document.querySelector<HTMLElement>('#copy')!.style.color = 'green';
    editor.destroy();
    expect(document.querySelector('#copy')?.textContent).toBe('Draft');
    expect(document.querySelector<HTMLElement>('#copy')?.style.color).toBe('green');
    expect(document.querySelector('#owned')?.textContent).toBe('Native owned');
  });

  it('compensates imported insertion and move chains in reverse order', async () => {
    document.body.innerHTML = '<main id="source"><p id="existing">Existing</p></main><main id="destination"></main>';
    const editor = session();
    await editor.restore([], undefined, [
      {schemaVersion: 1, id: 'insert', kind: 'insertNode', target: {selectors: {css: '#source'}}, position: 'append',
        node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Inserted'}]}},
      {schemaVersion: 1, id: 'title-insertion', kind: 'setAttribute', target: {nodeRef: {operationId: 'insert'}},
        dependsOn: ['insert'], name: 'title', value: 'Base title'},
      {schemaVersion: 1, id: 'move-existing', kind: 'moveNode', target: {selectors: {css: '#existing'}},
        destination: {selectors: {css: '#destination'}}, position: 'append'},
    ]);
    expect(document.querySelector('#destination #existing')).not.toBeNull();
    expect(document.querySelector('#source')?.children.length).toBe(1);
    editor.destroy();
    expect(document.querySelector('#source')?.innerHTML).toBe('<p id="existing">Existing</p>');
    expect(document.querySelector('#destination')?.children.length).toBe(0);
  });

  it('keeps an imported insertion when later host content changes it', async () => {
    document.body.innerHTML = '<main id="source"></main>';
    const editor = session();
    await editor.restore([], undefined, [{schemaVersion: 1, id: 'insert', kind: 'insertNode',
      target: {selectors: {css: '#source'}}, position: 'append',
      node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Inserted'}]}}]);
    document.querySelector('p')!.textContent = 'Host changed';
    editor.destroy();
    expect(document.querySelector('p')?.textContent).toBe('Host changed');
  });

  it('imports failed base commands as committed history and saves only the repair delta', async () => {
    document.body.innerHTML = '<p id="new">Native</p>';
    const editor = session();
    const immutable = JSON.stringify(baseText);
    await editor.restore([], undefined, [baseText]);
    expect(editor.getChanges()).toMatchObject([{id: 'base-text', committed: true, status: 'skipped', code: 'TARGET_NOT_FOUND'}]);
    expect(editor.pendingOperations()).toEqual([]);
    await expect(editor.repair('base-text', document.querySelector('p')!)).resolves.toMatchObject({applied: 1});
    expect(document.querySelector('p')?.textContent).toBe('Published');
    const delta = editor.pendingOperations();
    expect(delta).toHaveLength(1);
    expect(delta[0]).toMatchObject({revision: {previousOperationId: 'base-text', reason: 'target-repair'}});
    expect(editor.getChanges()[0]).toMatchObject({committed: true, code: 'OPERATION_SUPERSEDED'});
    expect(JSON.stringify(baseText)).toBe(immutable);

    editor.markCommitted(delta.map(operation => operation.id));
    editor.destroy();
    document.body.innerHTML = '<p id="missing">Original target returned</p><p id="new">Native</p>';
    const restored = session();
    await restored.restore(delta, undefined, [baseText]);
    expect(document.querySelector('#missing')?.textContent).toBe('Original target returned');
    expect(document.querySelector('#new')?.textContent).toBe('Published');
    expect(restored.pendingOperations()).toEqual([]);
    expect(restored.getChanges()).toMatchObject([
      {id: 'base-text', committed: true, code: 'OPERATION_SUPERSEDED'},
      {id: delta[0]!.id, committed: true, status: 'applied'},
    ]);
  });

  it('resolves unsaved recovered repairs before replaying their failed base target', async () => {
    document.body.innerHTML = '<p id="new">Native</p>';
    const first = session(sessionStorage);
    await first.restore([], undefined, [baseText]);
    await first.repair('base-text', document.querySelector('p')!);
    const delta = first.pendingOperations();
    first.destroy();
    document.body.innerHTML = '<p id="missing">Old native</p><p id="new">Native</p>';
    const recovered = session(sessionStorage);
    await recovered.restore([], undefined, [baseText]);
    expect(document.querySelector('#missing')?.textContent).toBe('Old native');
    expect(document.querySelector('#new')?.textContent).toBe('Published');
    expect(recovered.pendingOperations()).toEqual(delta);
  });

  it('rewrites repaired insertion dependencies and node references on reload', async () => {
    document.body.innerHTML = '<main id="destination"></main>';
    const base: Operation[] = [
      {schemaVersion: 1, id: 'insert', kind: 'insertNode', target: {selectors: {css: '#missing'}},
        position: 'append', node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Inserted'}]}},
      {schemaVersion: 1, id: 'color', kind: 'setStyle', target: {nodeRef: {operationId: 'insert'}},
        dependsOn: ['insert'], property: 'color', value: 'purple'},
    ];
    const first = session();
    await first.restore([], undefined, base);
    await first.repair('insert', document.querySelector('main')!);
    const delta = first.pendingOperations();
    expect(delta).toHaveLength(2);
    expect(delta[1]).toMatchObject({dependsOn: [delta[0]!.id], target: {nodeRef: {operationId: delta[0]!.id}}});
    first.destroy();
    document.body.innerHTML = '<main id="missing"></main><main id="destination"></main>';
    const reloaded = session();
    await reloaded.restore(delta, undefined, base);
    expect(document.querySelector('#missing')?.children.length).toBe(0);
    expect(document.querySelector('#destination p')?.textContent).toBe('Inserted');
    expect(document.querySelector<HTMLElement>('#destination p')?.style.color).toBe('purple');
    expect(reloaded.pendingOperations()).toEqual([]);
  });

  it('repairs every conditional group member under one overlay owner', async () => {
    document.body.innerHTML = '<button id="new" style="color: gray">Continue</button>';
    readyRoot();
    const base: Operation[] = [
      {schemaVersion: 2, id: 'text', kind: 'setText', target: {selectors: {css: '#old'}},
        condition: {id: 'group', text: 'Continue'}, value: 'Next'},
      {schemaVersion: 2, id: 'color', kind: 'setStyle', target: {selectors: {css: '#old'}},
        condition: {id: 'group', text: 'Continue'}, property: 'color', value: 'navy'},
    ];
    const editor = session();
    await editor.restore([], undefined, base);
    expect(editor.getChanges().map(change => change.code)).toEqual(['TARGET_NOT_FOUND', 'TARGET_NOT_FOUND']);
    await editor.repair('text', document.querySelector('button')!);
    const delta = editor.pendingOperations();
    expect(delta).toHaveLength(2);
    expect(delta.map(operation => operation.revision?.previousOperationId)).toEqual(['text', 'color']);
    expect(editor.conditionalState.groups).toMatchObject([{id: 'group', status: 'active'}]);
    expect(document.querySelector('button')?.textContent).toBe('Next');
    editor.destroy();
    expect(document.querySelector('button')?.textContent).toBe('Continue');
    document.body.innerHTML = '<button id="old">Continue</button><button id="new" style="color: gray">Continue</button>';
    const reloaded = session();
    await reloaded.restore(delta, undefined, base);
    expect(document.querySelector('#old')?.textContent).toBe('Continue');
    expect(document.querySelector('#new')?.textContent).toBe('Next');
    expect(reloaded.pendingOperations()).toEqual([]);
  });

  it('exposes unsafe conditional structure for explicit repair and leaves inactive conditions waiting', async () => {
    document.body.innerHTML = '<button id="old"><span>Continue</span></button><button id="new">Continue</button>';
    readyRoot();
    const base: Operation = {schemaVersion: 2, id: 'conditional', kind: 'setText',
      target: {selectors: {css: '#old'}}, condition: {id: 'group', text: 'Continue'}, value: 'Next'};
    const editor = session();
    await editor.restore([], undefined, [base]);
    expect(editor.getChanges()[0]).toMatchObject({status: 'error', code: 'UNSAFE_TARGET_STRUCTURE'});
    await editor.repair('conditional', document.querySelector('#new')!);
    expect(document.querySelector('#old')?.innerHTML).toBe('<span>Continue</span>');
    expect(document.querySelector('#new')?.textContent).toBe('Next');
    editor.destroy();
    document.body.innerHTML = '<button id="old">Waiting</button><button id="new">Continue</button>';
    const inactive = session();
    await inactive.restore([], undefined, [base]);
    expect(inactive.getChanges()[0]).toMatchObject({status: 'skipped', code: 'CONDITIONAL_REGISTERED'});
    await expect(inactive.repair('conditional', document.querySelector('#new')!)).rejects.toThrow(/неприменённого/);
    expect(inactive.pendingOperations()).toEqual([]);
  });
});
