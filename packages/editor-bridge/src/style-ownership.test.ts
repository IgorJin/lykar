import {afterEach, describe, expect, it} from 'vitest';
import type {OperationV1} from '@lykar/protocol';

import {EditorSession} from './session.js';

const sessions: EditorSession[] = [];
const frameworkKey = Symbol.for('@lykar/framework-roots/v1');

function sessionFor(markup = '<div id="box" style="color: purple">Box</div>', storage?: Storage) {
  document.body.innerHTML = markup;
  const session = new EditorSession(document, {storage, storageKey: 'lykar:style-ownership-test'});
  sessions.push(session);
  return {session, box: document.querySelector<HTMLElement>('#box')!};
}

function style(id: string, property: string, value: string, priority: '' | 'important' = ''): OperationV1 {
  return {schemaVersion: 1, id, kind: 'setStyle', target: {selectors: {css: '#box'}}, property, value, priority};
}

function frameworkSession() {
  document.body.innerHTML = '<main id="app"><button id="box" style="color: gray">Продолжить</button></main>';
  const root = document.querySelector('#app')!;
  (window as unknown as Record<symbol, unknown>)[frameworkKey] = new Map([[root, {root, framework: 'react', phase: 'ready', mode: 'csr', generation: 1}]]);
  const session = new EditorSession(document);
  sessions.push(session);
  const box = document.querySelector<HTMLElement>('#box')!;
  session.captureSelection(box);
  return {session, box};
}

afterEach(() => {
  for (const session of sessions.splice(0)) session.destroy();
  delete (window as unknown as Record<symbol, unknown>)[frameworkKey];
  document.querySelectorAll('[data-style-ownership-test]').forEach(element => element.remove());
  document.body.innerHTML = '';
});

describe('native style ownership', () => {
  it('priority toggles return to zero pending writes for both authored and computed source values', async () => {
    for (const authored of [true, false]) {
      const {session, box} = sessionFor(`<div id="box"${authored ? ' style="font-size: 14px"' : ''}>Box</div>`);
      const css = document.createElement('style');
      css.setAttribute('data-style-ownership-test', '');
      css.textContent = '#box {font-size:14px}'; document.head.append(css);
      for (let index = 0; index < 5; index++) {
        await session.preview(style(`priority-on-${index}`, 'font-size', '14px', 'important'), 'priority', box, 'priority');
        expect(session.pendingOperations()).toHaveLength(1);
        await session.preview(style(`priority-off-${index}`, 'font-size', '14px'), 'priority', box, 'priority');
        expect(session.pendingOperations()).toHaveLength(0);
        expect(session.hasStyleOverride(box, 'font-size')).toBe(false);
        expect(box.style.fontSize).toBe(authored ? '14px' : '');
      }
    }
  });

  it('local reset cancels pending field writes while preserving other fields and Undo/Redo', async () => {
    const {session, box} = sessionFor('<div id="box" style="font-size:14px !important">Box</div>');
    await session.preview(style('size-15', 'font-size', '15px', 'important'), 'size-1', box);
    await session.preview(style('width-200', 'width', '200px'), 'width', box);
    await session.preview(style('size-16', 'font-size', '16px', 'important'), 'size-2', box);
    expect(session.discardPendingStyle(box, 'font-size')).not.toBeNull();
    expect(session.pendingOperations().map(operation => operation.id)).toEqual(['width-200']);
    expect(session.exportDraft().operations.map(operation => operation.id)).toEqual(['width-200']);
    expect(box.style.fontSize).toBe('14px');
    expect(box.style.getPropertyPriority('font-size')).toBe('important');
    expect(box.style.width).toBe('200px');
    expect(session.hasStyleOverride(box, 'font-size')).toBe(false);
    expect(session.undo()).toBe(true);
    expect(box.style.fontSize).toBe('16px');
    expect(session.pendingOperations()).toHaveLength(3);
    await session.redo();
    expect(box.style.fontSize).toBe('14px');
    expect(session.pendingOperations()).toHaveLength(1);
    expect(session.discardPendingStyle(box, 'font-size')).toBeNull();
  });

  it('protects a save batch when the same priority field changes during an in-flight save', async () => {
    const {session, box} = sessionFor(undefined, window.sessionStorage);
    await session.preview(style('priority-frozen', 'color', 'purple', 'important'), 'priority', box, 'priority');
    session.beginSave({idempotencyKey: 'save-frozen', expectedRevision: 0, operations: session.pendingOperations(), sourceSnapshot: await session.sourceSnapshot()});
    await session.preview(style('priority-new-off', 'color', 'purple'), 'priority', box, 'priority');
    expect(session.pendingOperations()).toHaveLength(2);
    await session.preview(style('priority-new-on', 'color', 'purple', 'important'), 'priority', box, 'priority');
    expect(session.pendingOperations().map(operation => operation.id)).toEqual(['priority-frozen']);
    expect(session.discardPendingStyle(box, 'color')).toBeNull();
    session.completeSave(['priority-frozen']);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
  });
  it('never treats computed or original host inline declarations as Lykar overrides', () => {
    const {session, box} = sessionFor();
    const css = document.createElement('style');
    css.setAttribute('data-style-ownership-test', '');
    css.textContent = '#box {font-size: 14px}';
    document.head.append(css);
    expect(getComputedStyle(box).fontSize).toBe('14px');
    expect(session.hasStyleOverride(box, 'font-size')).toBe(false);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.styleOverrideOperationId(box, 'color')).toBeUndefined();
  });

  it('owns an explicit same-as-source write until a reset, with undo/redo retaining the distinction from dirty', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('same-color', 'color', 'purple'), undefined, box);
    expect(session.isStyleDirty(box, 'color')).toBe(false);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    expect(session.styleOverrideOperationId(box, 'color')).toBe('same-color');
    await session.preview({...style('reset-color', 'color', 'purple'), revision: {previousOperationId: 'same-color', reason: 'undo'}}, undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    await session.redo();
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
  });

  it('requires the exact current authored value and priority, and restores a newer host baseline after another edit', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('owned-color', 'color', 'navy'), undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    box.style.setProperty('color', 'navy', 'important');
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    box.style.setProperty('color', 'green', 'important');
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.styleBaseline(box, 'color')).toBeNull();
    await session.preview(style('new-color', 'color', 'red'), undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    expect(session.styleBaseline(box, 'color')).toEqual({value: 'green', priority: 'important'});
    expect(session.styleResetOperationId(box, 'color')).toBe('new-color');
  });

  it('preserves ownership of a committed write after reload and drops it after a persisted reset', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('saved-color', 'color', 'navy'), undefined, box);
    session.markCommitted(['saved-color']);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    const saved = session.exportDraft().operations;
    session.destroy();
    const restored = sessionFor();
    await restored.session.restore(saved);
    expect(restored.session.hasStyleOverride(restored.box, 'color')).toBe(true);
    await restored.session.preview({...style('reset-saved-color', 'color', 'purple'), revision: {previousOperationId: 'saved-color', reason: 'undo'}}, undefined, restored.box);
    restored.session.markCommitted(restored.session.pendingOperations().map(operation => operation.id));
    const reset = restored.session.exportDraft().operations;
    restored.session.destroy();
    const final = sessionFor();
    await final.session.restore(reset);
    expect(final.box.style.color).toBe('purple');
    expect(final.session.hasStyleOverride(final.box, 'color')).toBe(false);
  });

  it('retains an earlier owned value when undoing a later committed style and releases it when undoing to the source', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('first-color', 'color', 'green'), undefined, box);
    await session.preview(style('second-color', 'color', 'navy'), undefined, box);
    session.markCommitted(['first-color', 'second-color']);
    expect(await session.undoCommitted()).not.toBeNull();
    expect(box.style.color).toBe('green');
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    expect(session.styleOverrideOperationId(box, 'color')).toBe('first-color');
    expect(session.undo()).toBe(true);
    expect(box.style.color).toBe('navy');
    expect(session.styleOverrideOperationId(box, 'color')).toBe('second-color');

    await session.preview({...style('reset-all', 'color', 'purple'), revision: {previousOperationId: session.styleResetOperationId(box, 'color')!, reason: 'undo'}}, undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
  });

  it('retains a same-as-source owner on committed undo and releases it when resetting the whole override chain', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('same-source', 'color', 'purple'), undefined, box);
    await session.preview(style('later-color', 'color', 'navy'), undefined, box);
    session.markCommitted(['same-source', 'later-color']);
    expect(await session.undoCommitted()).not.toBeNull();
    expect(box.style.color).toBe('purple');
    expect(session.isStyleDirty(box, 'color')).toBe(false);
    expect(session.styleOverrideOperationId(box, 'color')).toBe('same-source');
    expect(session.styleResetOperationId(box, 'color')).toBe('same-source');

    const baseline = session.styleBaseline(box, 'color')!;
    await session.preview({...style('reset-same-source', 'color', baseline.value, baseline.priority),
      revision: {previousOperationId: session.styleResetOperationId(box, 'color')!, reason: 'undo'}}, undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.styleOverrideOperationId(box, 'color')).toBe('same-source');
    await session.redo();
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    session.markCommitted(session.pendingOperations().map(operation => operation.id));
    const saved = session.exportDraft().operations;
    session.destroy();
    const restored = sessionFor();
    await restored.session.restore(saved);
    expect(restored.box.style.color).toBe('purple');
    expect(restored.session.hasStyleOverride(restored.box, 'color')).toBe(false);
  });

  it('does not claim a removed declaration, and local undo restores the previous ownership', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('color-write', 'color', 'navy'), undefined, box);
    await session.preview(style('color-removal', 'color', ''), undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.styleOverrideOperationId(box, 'color')).toBe('color-write');
    await session.redo();
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
  });

  it('references the original baseline after removal without claiming the restored host declaration', async () => {
    const {session, box} = sessionFor();
    await session.preview(style('color-write', 'color', 'navy'), undefined, box);
    await session.preview(style('color-removal', 'color', ''), undefined, box);
    expect(session.styleOverrideOperationId(box, 'color')).toBeUndefined();
    expect(session.styleResetOperationId(box, 'color')).toBe('color-write');
    expect(session.isStyleDirty(box, 'color')).toBe(true);
    const baseline = session.styleBaseline(box, 'color')!;
    await session.preview({...style('restore-removal', 'color', baseline.value, baseline.priority),
      revision: {previousOperationId: session.styleResetOperationId(box, 'color')!, reason: 'undo'}}, undefined, box);
    expect(box.style.color).toBe('purple');
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.isStyleDirty(box, 'color')).toBe(false);
    expect(session.styleResetOperationId(box, 'color')).toBe('color-write');
    session.markCommitted(session.pendingOperations().map(operation => operation.id));
    const saved = session.exportDraft().operations;
    session.destroy();
    const restored = sessionFor();
    await restored.session.restore(saved);
    expect(restored.box.style.color).toBe('purple');
    expect(restored.session.hasStyleOverride(restored.box, 'color')).toBe(false);
  });

  it('tracks shorthand effects without relinquishing unaffected sides or claiming unrelated host declarations', async () => {
    const {session, box} = sessionFor('<div id="box" style="margin: 8px; color: purple">Box</div>');
    await session.preview(style('margin-write', 'margin', '16px'), undefined, box);
    expect(session.hasStyleOverride(box, 'margin-top')).toBe(true);
    expect(session.styleOverrideOperationId(box, 'margin-top')).toBe('margin-write');
    expect(session.styleBaseline(box, 'margin-top')).toEqual({value: '8px', priority: ''});
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    await session.preview({...style('reset-top', 'margin-top', '8px'), revision: {previousOperationId: 'margin-write', reason: 'undo'}}, undefined, box);
    expect(session.hasStyleOverride(box, 'margin-top')).toBe(false);
    expect(session.hasStyleOverride(box, 'margin-bottom')).toBe(true);
    box.style.marginBottom = '24px';
    expect(session.hasStyleOverride(box, 'margin-bottom')).toBe(false);
  });
});

describe('conditional style ownership', () => {
  it('cancels repeated priority toggles and field resets for the active framework state', async () => {
    const {session, box} = frameworkSession();
    for (let index = 0; index < 3; index++) {
      await session.preview(style(`state-on-${index}`, 'color', 'gray', 'important'), 'priority', box, 'priority');
      expect(session.pendingOperations()).toHaveLength(1);
      await session.preview(style(`state-off-${index}`, 'color', 'gray'), 'priority', box, 'priority');
      expect(session.pendingOperations()).toHaveLength(0);
    }
    await session.preview(style('state-blue', 'color', 'blue'), 'color', box);
    expect(session.discardPendingStyle(box, 'color')).not.toBeNull();
    expect(session.pendingOperations()).toHaveLength(0);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(getComputedStyle(box).color).toBe('rgb(128, 128, 128)');
    expect(session.undo()).toBe(true);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    expect(getComputedStyle(box).color).toBe('rgb(0, 0, 255)');
    await session.redo();
    expect(session.pendingOperations()).toHaveLength(0);
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
  });
  it('owns only the currently active framework state, including same-as-source writes', async () => {
    const {session, box} = frameworkSession();
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    await session.preview(style('state-color', 'color', 'gray'), undefined, box);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    box.firstChild!.nodeValue = 'Ожидаем';
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    box.firstChild!.nodeValue = 'Продолжить';
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    await session.resetConditionalStyle(box, 'color');
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.undo()).toBe(true);
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    await session.redo();
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
  });

  it('retains ownership over newer host source styles, but never claims an unsafe overlay', async () => {
    const {session, box} = frameworkSession();
    await session.preview(style('state-color', 'color', 'navy'), undefined, box);
    box.style.color = 'green';
    expect(session.hasStyleOverride(box, 'color')).toBe(true);
    expect(session.styleBaseline(box, 'color')).toEqual({value: 'green', priority: ''});
    box.style.setProperty('color', 'green', 'important');
    expect(session.hasStyleOverride(box, 'color')).toBe(false);
    expect(session.conditionalState.groups[0].status).toBe('unsafe');
  });

  it('reconstructs committed conditional ownership after reload and rejects a missing or removed effect', async () => {
    const {session, box} = frameworkSession();
    await session.preview(style('state-color', 'color', 'navy'), undefined, box);
    session.markCommitted(['state-color']);
    const saved = session.exportDraft().operations;
    session.destroy();
    const restored = frameworkSession();
    await restored.session.restore(saved);
    expect(restored.session.styleOverrideOperationId(restored.box, 'color')).toBe('state-color');
    await restored.session.resetConditionalStyle(restored.box, 'color');
    expect(restored.session.hasStyleOverride(restored.box, 'color')).toBe(false);
    expect(restored.session.undo()).toBe(true);
    expect(restored.session.hasStyleOverride(restored.box, 'color')).toBe(true);
    restored.box.remove();
    expect(restored.session.hasStyleOverride(restored.box, 'color')).toBe(false);
  });
});
