import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EditorSession} from './session.js';
import {LykarEditor} from './editor.js';
import type {OperationV1} from '@lykar/protocol';

beforeEach(() => { document.body.innerHTML = ''; sessionStorage.clear(); });
const operation = (id: string, property: string, value: string): OperationV1 => ({schemaVersion: 1, id, kind: 'setStyle', target: {marker: 'box'}, property, value});
const mount = (style = '') => {
  document.body.innerHTML = `<div data-lykar-id="box" style="${style}">Box</div>`;
  return document.querySelector<HTMLElement>('[data-lykar-id="box"]')!;
};

describe('style transaction acceptance', () => {
  it('undoes a saved linked group atomically after reload and preserves the prior release', async () => {
    let box = mount('padding: 1px 2em 3px 4rem');
    const session = new EditorSession(document);
    const report = await session.previewGroup(['top', 'right', 'bottom', 'left'].map(side => operation(side, `padding-${side}`, '8px')));
    expect(report, JSON.stringify(report)).toMatchObject({outcome: 'applied'});
    const release = structuredClone(session.pendingOperations());
    session.markCommitted(release.map(item => item.id));
    box = mount('padding: 1px 2em 3px 4rem');
    const restored = new EditorSession(document);
    await restored.restore(release);
    expect((await restored.undoCommitted())?.errors).toBe(0);
    expect([box.style.paddingTop, box.style.paddingRight, box.style.paddingBottom, box.style.paddingLeft]).toEqual(['1px', '2em', '3px', '4rem']);
    expect(box.style.getPropertyPriority('padding-top')).toBe('');
    expect(release).toHaveLength(4);
    expect(release.every(item => item.kind === 'setStyle' && item.value === '8px')).toBe(true);
    const saved = [...release, ...restored.pendingOperations()];
    box = mount('padding: 1px 2em 3px 4rem');
    await new EditorSession(document).restore(saved);
    expect(box.style.padding).toBe('1px 2em 3px 4rem');
  });

  it('does not partially undo a saved group when the host changes only priority', async () => {
    const box = mount();
    const session = new EditorSession(document);
    await session.previewGroup([operation('top', 'padding-top', '8px'), operation('left', 'padding-left', '8px')]);
    session.markCommitted(session.pendingOperations().map(item => item.id));
    box.style.setProperty('padding-left', '8px', 'important');
    expect(await session.undoCommitted()).toBeNull();
    expect(box.style.paddingTop).toBe('8px');
    expect(session.pendingOperations()).toHaveLength(0);
  });

  it('restores mixed shorthand declarations without deleting an unrelated host edit', async () => {
    const box = mount('margin-top: 1px !important; margin-right: 2em; margin-bottom: 3px; margin-left: 4rem');
    const before = box.style.cssText;
    const session = new EditorSession(document);
    await session.preview(operation('margin', 'margin', '8px'));
    box.style.color = 'blue';
    expect(session.undo()).toBe(true);
    const expected = document.createElement('div').style;
    expected.cssText = before;
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(box.style.getPropertyValue(`margin-${side}`)).toBe(expected.getPropertyValue(`margin-${side}`));
      expect(box.style.getPropertyPriority(`margin-${side}`)).toBe(expected.getPropertyPriority(`margin-${side}`));
    }
    expect(box.style.color).toBe('blue');
  });

  it('50 native color events produce one undo step and a later gesture another', async () => {
    const box = mount();
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('[aria-label="Поиск свойства"]')!;
    search.value = 'color'; search.dispatchEvent(new Event('input'));
    const swatch = panel.querySelector<HTMLInputElement>('[data-field="color"] [data-role="swatch"]')!;
    swatch.focus();
    for (let i = 0; i < 50; i++) { swatch.value = `#ff00${i.toString(16).padStart(2, '0')}`; swatch.dispatchEvent(new Event('input')); }
    swatch.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(box.style.color).toBe('rgb(255, 0, 49)'));
    expect(editor.session.pendingOperations()).toHaveLength(1);
    swatch.value = '#00ff00'; swatch.dispatchEvent(new Event('input')); swatch.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(box.style.color).toBe('rgb(0, 255, 0)'));
    expect(editor.session.pendingOperations()).toHaveLength(2);
    expect(editor.session.undo()).toBe(true);
    expect(box.style.color).toBe('rgb(255, 0, 49)');
    editor.destroy();
  });

  it('flushes a queued valid field value before programmatic save and cancels work on destroy', async () => {
    const box = mount();
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('[aria-label="Поиск свойства"]')!;
    search.value = 'width'; search.dispatchEvent(new Event('input'));
    const input = panel.querySelector<HTMLInputElement>('[aria-label="Width"]')!;
    input.focus(); input.value = '120px'; input.dispatchEvent(new Event('input'));
    await vi.waitFor(() => expect(box.style.width).toBe('120px'));
    input.value = '123px'; input.dispatchEvent(new Event('input'));
    panel.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await vi.waitFor(() => expect(editor.session.getChanges()[0]?.committed).toBe(true));
    expect(box.style.width).toBe('123px');
    input.value = '456px'; input.dispatchEvent(new Event('input'));
    editor.destroy();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(box.style.width).toBe('123px');
  });
});
