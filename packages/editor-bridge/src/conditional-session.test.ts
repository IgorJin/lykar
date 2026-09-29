import {afterEach, describe, expect, it, vi} from 'vitest';
import {EditorSession} from './session.js';

let session: EditorSession | undefined;
const key = Symbol.for('@lykar/framework-roots/v1');
function setup() {
  document.body.innerHTML = '<main id="app"><button id="action" style="color: gray">Продолжить</button></main>';
  const root = document.querySelector('#app')!;
  (window as unknown as Record<symbol, unknown>)[key] = new Map([[root, {root, framework: 'react', phase: 'ready', mode: 'csr', generation: 1}]]);
  session = new EditorSession(document);
  const button = document.querySelector('#action') as HTMLButtonElement;
  session.captureSelection(button);
  return {session, button};
}
afterEach(() => {
  session?.destroy();
  delete (window as unknown as Record<symbol, unknown>)[key];
  document.body.innerHTML = '';
});

describe('automatic conditional editor session', () => {
  it('captures the host variant once, groups text/style, and restores after rerender', async () => {
    const {session, button} = setup();
    const textNode = button.firstChild!;
    await session.preview({schemaVersion: 1, id: 'text', kind: 'setText', target: {selectors: {css: '#action'}}, value: 'Далее'}, undefined, button);
    await session.preview({schemaVersion: 1, id: 'color', kind: 'setStyle', target: {selectors: {css: '#action'}}, property: 'color', value: 'navy'}, undefined, button);
    const operations = session.exportDraft().operations;
    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatchObject({schemaVersion: 2, condition: {text: 'Продолжить'}});
    if (operations[0].schemaVersion !== 2 || operations[1].schemaVersion !== 2) throw new Error('Missing conditions');
    expect(operations[0].condition.id).toBe(operations[1].condition.id);
    expect(button.firstChild).toBe(textNode);
    button.firstChild!.nodeValue = 'Ожидаем';
    await Promise.resolve();
    expect(button.textContent).toBe('Ожидаем');
    expect(getComputedStyle(button).color).toBe('rgb(128, 128, 128)');
    button.firstChild!.nodeValue = 'Продолжить';
    await Promise.resolve();
    expect(button.textContent).toBe('Далее');
    expect(getComputedStyle(button).color).toBe('rgb(0, 0, 128)');
  });

  it('undoes saved conditions without restoring stale host styles or undoing twice', async () => {
    const {session, button} = setup();
    await session.preview({schemaVersion: 1, id: 'color', kind: 'setStyle', target: {selectors: {css: '#action'}}, property: 'color', value: 'navy'}, undefined, button);
    session.markCommitted(['color']);
    button.style.color = 'green';
    await Promise.resolve();
    expect(getComputedStyle(button).color).toBe('rgb(0, 0, 128)');
    expect(await session.undoCommitted()).not.toBeNull();
    expect(button.style.color).toBe('green');
    session.markCommitted(session.pendingOperations().map(operation => operation.id));
    expect(await session.undoCommitted()).toBeNull();
  });

  it('reset cancels all overrides for a property and redo/undo preserve registration', async () => {
    const {session, button} = setup();
    await session.preview({schemaVersion: 1, id: 'c1', kind: 'setStyle', target: {selectors: {css: '#action'}}, property: 'color', value: 'navy'}, undefined, button);
    await session.preview({schemaVersion: 1, id: 'c2', kind: 'setStyle', target: {selectors: {css: '#action'}}, property: 'color', value: 'red'}, undefined, button);
    await session.resetConditionalStyle(button, 'color');
    expect(getComputedStyle(button).color).toBe('rgb(128, 128, 128)');
    expect(session.undo()).toBe(true);
    expect(getComputedStyle(button).color).toBe('rgb(255, 0, 0)');
    await session.redo();
    expect(getComputedStyle(button).color).toBe('rgb(128, 128, 128)');
  });

  it('requires reselection after the host changes variant and reports dirty overlay state', async () => {
    const {session, button} = setup();
    await session.preview({schemaVersion: 1, id: 'color', kind: 'setStyle', target: {selectors: {css: '#action'}}, property: 'color', value: 'navy'}, undefined, button);
    expect(session.isStyleDirty(button, 'color')).toBe(true);
    expect(session.styleView(button)?.color).toBe('navy');
    expect(button.style.color).toBe('gray');
    button.firstChild!.nodeValue = 'Ожидаем';
    await Promise.resolve();
    expect(session.isStyleDirty(button, 'color')).toBe(false);
    expect(session.styleView(button)?.color).toBe('gray');
    await expect(session.preview({schemaVersion: 1, id: 'stale', kind: 'setText', target: {selectors: {css: '#action'}}, value: 'Далее'}, undefined, button)).rejects.toThrow('Состояние');
    expect(session.pendingOperations()).toHaveLength(1);
    session.captureSelection(button);
    await session.preview({schemaVersion: 1, id: 'waiting', kind: 'setText', target: {selectors: {css: '#action'}}, value: 'Пожалуйста, подождите'}, undefined, button);
    expect(button.textContent).toBe('Пожалуйста, подождите');
    expect(getComputedStyle(button).color).toBe('rgb(128, 128, 128)');
  });

  it('rolls back rejected CSS registration and preserves the earlier text edit', async () => {
    const {session, button} = setup();
    await session.preview({schemaVersion: 1, id: 'text', kind: 'setText', target: {selectors: {css: '#action'}}, value: 'Далее'}, undefined, button);
    const append = vi.spyOn(document.head, 'append').mockImplementation(() => {throw new Error('stylesheet blocked');});
    try {
      await expect(session.preview({schemaVersion: 1, id: 'blocked-color', kind: 'setStyle', target: {selectors: {css: '#action'}}, property: 'color', value: 'navy'}, undefined, button)).rejects.toThrow('Условная правка не применена');
      expect(session.pendingOperations().map(operation => operation.id)).toEqual(['text']);
      expect(button.textContent).toBe('Далее');
      expect(button.style.color).toBe('gray');
    } finally {append.mockRestore();}
  });

  it('rejects structural edits in a framework-owned tree before creating history', async () => {
    const {session, button} = setup();
    await expect(session.preview({schemaVersion: 1, id: 'remove', kind: 'removeNode', target: {selectors: {css: '#action'}}}, undefined, button)).rejects.toThrow('React/Vue');
    expect(session.pendingOperations()).toEqual([]);
    expect(button.isConnected).toBe(true);
  });
});
