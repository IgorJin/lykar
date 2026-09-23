import type { OperationV1 } from '@lykar/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LykarEditor } from './editor.js';
import { DummyProposalProvider } from './proposal.js';
import { EditorSession } from './session.js';
import { buildTargetDescriptor, serializeEditableElement } from './target-builder.js';

beforeEach(() => {
  document.body.innerHTML = '';
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('target builder', () => {
  it('uses an existing marker and produces CSS/XPath fallbacks without mutating the page', () => {
    document.body.innerHTML = `
      <main><section><p data-lykar-id="hero-copy">Text</p><p>Other</p></section></main>
    `;
    const target = document.querySelector('[data-lykar-id="hero-copy"]')!;
    const before = target.outerHTML;
    const descriptor = buildTargetDescriptor(target);

    expect(descriptor.marker).toBe('hero-copy');
    expect(descriptor.fingerprint).toMatchObject({
      tag: 'p', attributes: { 'data-lykar-id': 'hero-copy' },
    });
    expect(document.querySelector(descriptor.selectors!.css!)).toBe(target);
    expect(document.evaluate(
      descriptor.selectors!.xpath!,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    ).singleNodeValue).toBe(target);
    expect(target.outerHTML).toBe(before);
  });

  it('creates a unique structural selector when no marker or id exists', () => {
    document.body.innerHTML = '<main><div><span>One</span><span>Two</span></div></main>';
    const target = document.querySelectorAll('span')[1];
    const descriptor = buildTargetDescriptor(target);

    expect(descriptor.marker).toBeUndefined();
    expect(descriptor.selectors?.css).toContain(':nth-of-type(2)');
    expect(document.querySelector(descriptor.selectors!.css!)).toBe(target);
  });

  it('strips unique editor markers and ids when serializing a duplicate', () => {
    document.body.innerHTML = '<article id="feature" data-lykar-id="feature"><h2 id="title">Title</h2></article>';
    const serialized = serializeEditableElement(document.querySelector('article')!);

    expect(serialized.attributes).toBeUndefined();
    expect(serialized.children?.[0]).toMatchObject({ type: 'element', tag: 'h2', children: [{ value: 'Title' }] });
    expect((serialized.children?.[0] as { attributes?: unknown }).attributes).toBeUndefined();
  });
});

describe('local editor session', () => {
  it('edits catalog and arbitrary CSS through the active panel, then resets the authored value', async () => {
    document.body.innerHTML = '<div id="box" style="color: purple">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLElement>('.style-section[data-section="typography"] summary')!.click();
    await vi.waitFor(() => expect(panel.querySelector('[data-field="color"]')).not.toBeNull());
    const color = panel.querySelector<HTMLInputElement>('[data-field="color"] input[aria-label="Text Color"]')!;
    expect(color.value).toBe('purple');
    expect(editor.exportDraft().operations).toHaveLength(0);

    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'hyphens';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="CSS property"]')!.value).toBe('hyphens');
    search.value = 'grid-column';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const grid = panel.querySelector<HTMLInputElement>('[data-field="grid-column"] input[aria-label="Grid Column"]')!;
    expect(grid.closest('details')?.open).toBe(true);
    grid.value = '2 / span 3';
    grid.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.gridColumn).toBe('2 / span 3'));

    const property = panel.querySelector<HTMLInputElement>('input[aria-label="CSS property"]')!;
    const value = panel.querySelector<HTMLInputElement>('input[aria-label="CSS value"]')!;
    property.value = '--BrandAccent';
    value.value = '#abc';
    panel.querySelector<HTMLButtonElement>('.style-custom-row button')!.click();
    await vi.waitFor(() => expect(box.style.getPropertyValue('--BrandAccent')).toBe('#abc'));
    expect(editor.exportDraft().operations).toEqual(expect.arrayContaining([
      expect.objectContaining({kind: 'setStyle', property: '--BrandAccent', value: '#abc'}),
    ]));

    panel.querySelector<HTMLButtonElement>('[data-field="grid-column"] button')!.click();
    await vi.waitFor(() => expect(box.style.gridColumn).toBe(''));
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect(box.style.gridColumn).toBe('2 / span 3'));
    editor.destroy();
  });

  it('edits one side of an authored spacing shorthand without losing the other sides', async () => {
    document.body.innerHTML = '<div id="box" style="margin: 10px 20px">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!.value = 'margin';
    panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!.dispatchEvent(new Event('input', {bubbles: true}));
    const right = panel.querySelector<HTMLInputElement>('input[aria-label="Margin: Right"]')!;
    expect(right.value).toBe('20px');
    right.value = '2rem';
    right.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.marginRight).toBe('2rem'));
    expect(box.style.marginTop).toBe('10px');
    expect(box.style.marginBottom).toBe('10px');
    expect(box.style.marginLeft).toBe('20px');
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect(box.style.marginRight).toBe('20px'));
    editor.destroy();
  });

  it('keeps separate style edits to the same field as separate undo steps', async () => {
    document.body.innerHTML = '<div id="box">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'width';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const width = panel.querySelector<HTMLInputElement>('[data-field="width"] input[aria-label="Width"]')!;
    width.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
    width.value = '1';
    width.dispatchEvent(new Event('change', {bubbles: true}));
    expect(editor.exportDraft().operations).toHaveLength(0);
    width.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true}));
    width.value = '100px';
    width.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.width).toBe('100px'));
    width.value = '200px';
    width.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.width).toBe('200px'));
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect(box.style.width).toBe('100px'));
    editor.destroy();
  });

  it('compacts a burst of live style input into one undo step and saves its final value', async () => {
    document.body.innerHTML = '<div id="box">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'width';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const width = panel.querySelector<HTMLInputElement>('[data-field="width"] input[aria-label="Width"]')!;
    width.focus();
    for (let index = 0; index < 50; index += 1) {
      width.value = `${100 + index}px`;
      width.dispatchEvent(new Event('input', {bubbles: true}));
    }
    await vi.waitFor(() => expect(box.style.width).toBe('149px'));
    expect(editor.session.pendingOperations()).toHaveLength(1);
    expect(editor.session.pendingOperations()[0]).toMatchObject({kind: 'setStyle', property: 'width', value: '149px'});
    width.blur();
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect(box.style.width).toBe(''));
    editor.destroy();
  });

  it('Escape cancels a live field edit without clearing selection; Enter commits once', async () => {
    document.body.innerHTML = '<div id="box">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'width';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const width = panel.querySelector<HTMLInputElement>('[data-field="width"] input[aria-label="Width"]')!;
    width.focus();
    width.value = '100px';
    width.dispatchEvent(new Event('input', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.width).toBe('100px'));
    width.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true}));
    await vi.waitFor(() => expect(box.style.width).toBe(''));
    expect(panel.querySelector<HTMLElement>('[data-view="editor"]')!.hidden).toBe(false);
    width.focus();
    width.value = '120px';
    width.dispatchEvent(new Event('input', {bubbles: true}));
    width.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, composed: true}));
    await vi.waitFor(() => expect(box.style.width).toBe('120px'));
    expect(editor.session.pendingOperations()).toHaveLength(1);
    editor.destroy();
  });

  it('does not redirect an unfinished style field edit to a newly selected element', async () => {
    document.body.innerHTML = '<div id="first">First</div><div id="second">Second</div>';
    const first = document.querySelector<HTMLElement>('#first')!;
    const second = document.querySelector<HTMLElement>('#second')!;
    const editor = new LykarEditor({document}).start();
    editor.select(first);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'width';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const width = panel.querySelector<HTMLInputElement>('[data-field="width"] input[aria-label="Width"]')!;
    width.focus();
    width.value = '100px';
    width.dispatchEvent(new Event('input', {bubbles: true}));
    await vi.waitFor(() => expect(first.style.width).toBe('100px'));
    editor.select(second);
    width.value = '200px';
    width.dispatchEvent(new Event('change', {bubbles: true}));
    width.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, composed: true}));
    await Promise.resolve();
    expect(second.style.width).toBe('');
    expect(first.style.width).toBe('100px');
    editor.destroy();
  });

  it('changes one component of a simple border shorthand without dropping the rest', async () => {
    document.body.innerHTML = '<div id="box" style="border: 1px solid red !important">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    expect(panel.querySelector('.style-section[data-section="custom"] input[aria-label="border-top-width"]')).toBeNull();
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'border';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const width = panel.querySelector<HTMLInputElement>('input[aria-label="Border: Width"]')!;
    width.value = '3px';
    width.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.borderTopWidth).toBe('3px'));
    expect(box.style.borderTopStyle).toBe('solid');
    expect(box.style.borderTopColor).toBe('red');
    expect(box.style.getPropertyPriority('border')).toBe('important');
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect(box.style.borderTopWidth).toBe('1px'));
    expect(box.style.borderTopStyle).toBe('solid');
    expect(box.style.borderTopColor).toBe('red');
    expect(box.style.getPropertyPriority('border')).toBe('important');
    editor.destroy();
  });

  it('links padding sides into one undo step and restores their different units', async () => {
    document.body.innerHTML = '<div id="box" style="padding: 1px 2em 3px 4rem">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'padding';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const linked = panel.querySelector<HTMLInputElement>('[data-field="padding"] input[data-role="linked-spacing"]')!;
    linked.checked = true;
    const top = panel.querySelector<HTMLInputElement>('input[aria-label="Padding: Top"]')!;
    top.value = '8px';
    top.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect([box.style.paddingTop, box.style.paddingRight, box.style.paddingBottom, box.style.paddingLeft]).toEqual(['8px', '8px', '8px', '8px']));
    expect(editor.session.pendingOperations()).toHaveLength(4);
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect([box.style.paddingTop, box.style.paddingRight, box.style.paddingBottom, box.style.paddingLeft]).toEqual(['1px', '2em', '3px', '4rem']));
    expect(editor.session.pendingOperations()).toHaveLength(0);
    linked.checked = false;
    expect([box.style.paddingTop, box.style.paddingRight, box.style.paddingBottom, box.style.paddingLeft]).toEqual(['1px', '2em', '3px', '4rem']);
    editor.destroy();
  });

  it('keeps a linked style group intact when the host changes one member before undo', async () => {
    document.body.innerHTML = '<div data-lykar-id="box" style="color: green; padding-top: 1px"></div>';
    const box = document.querySelector<HTMLElement>('[data-lykar-id="box"]')!;
    const session = new EditorSession(document);
    const target = {marker: 'box'};
    const report = await session.previewGroup([
      {schemaVersion: 1, id: 'linked-color', kind: 'setStyle', target, property: 'color', value: 'red'},
      {schemaVersion: 1, id: 'linked-padding', kind: 'setStyle', target, property: 'padding-top', value: '8px'},
    ]);
    expect(report.outcome).toBe('applied');
    box.style.color = 'blue';

    expect(session.undo()).toBe(false);
    expect(box.style.color).toBe('blue');
    expect(box.style.paddingTop).toBe('8px');
    expect(session.pendingOperations()).toHaveLength(2);
  });

  it('rolls back a style group when a later CSS value is rejected', async () => {
    document.body.innerHTML = '<div data-lykar-id="box" style="color: green"></div>';
    const box = document.querySelector<HTMLElement>('[data-lykar-id="box"]')!;
    const session = new EditorSession(document);
    const target = {marker: 'box'};
    const report = await session.previewGroup([
      {schemaVersion: 1, id: 'group-color', kind: 'setStyle', target, property: 'color', value: 'red'},
      {schemaVersion: 1, id: 'group-width', kind: 'setStyle', target, property: 'width', value: 'not-a-width'},
    ]);

    expect(report.outcome).toBe('rolled-back');
    expect(report.rolledBack).toBe(1);
    expect(box.style.color).toBe('green');
    expect(session.pendingOperations()).toHaveLength(0);
  });

  it('edits an authored background shorthand without treating generated longhands as overrides', async () => {
    document.body.innerHTML = '<div id="box" style="background: red">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const search = panel.querySelector<HTMLInputElement>('input[aria-label="Поиск свойства"]')!;
    search.value = 'background';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    const background = panel.querySelector<HTMLInputElement>('[data-field="background"] input[aria-label="Background Layers"]')!;
    background.value = 'blue';
    background.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.background).toBe('blue'));
    editor.destroy();
  });

  it('restores the pre-Lykar inline value and priority separately from deleting a declaration', async () => {
    document.body.innerHTML = '<div id="box" style="color: purple !important">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLElement>('.style-section[data-section="typography"] summary')!.click();
    await vi.waitFor(() => expect(panel.querySelector('[data-field="color"]')).not.toBeNull());
    const color = panel.querySelector<HTMLInputElement>('[data-field="color"] input[aria-label="Text Color"]')!;
    expect(panel.querySelector<HTMLElement>('[data-field="color"]')!.dataset.dirty).toBe('false');
    expect(panel.querySelector<HTMLInputElement>('[data-field="color"] input[data-role="priority"]')!.checked).toBe(true);
    color.value = 'green';
    color.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.color).toBe('green'));
    expect(box.style.getPropertyPriority('color')).toBe('important');
    expect(panel.querySelector<HTMLElement>('[data-field="color"]')!.dataset.dirty).toBe('true');
    panel.querySelector<HTMLButtonElement>('[data-field="color"] button[aria-label="Вернуть исходный Text Color"]')!.click();
    await vi.waitFor(() => expect(box.style.color).toBe('purple'));
    expect(box.style.getPropertyPriority('color')).toBe('important');
    expect(panel.querySelector<HTMLElement>('[data-field="color"]')!.dataset.dirty).toBe('false');
    const count = editor.exportDraft().operations.length;
    panel.querySelector<HTMLButtonElement>('[data-field="color"] button[aria-label="Вернуть исходный Text Color"]')!.click();
    await vi.waitFor(() => expect(editor.exportDraft().operations).toHaveLength(count));
    panel.querySelector<HTMLButtonElement>('[data-action="undo"]')!.click();
    await vi.waitFor(() => expect(box.style.color).toBe('green'));
    editor.destroy();
  });

  it('shows an applicability hint when a flex/grid property is authored on a block', async () => {
    document.body.innerHTML = '<div id="box">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const field = panel.querySelector<HTMLInputElement>('[data-field="justify-content"] input[aria-label="Justify Content"]')!;
    field.value = 'center';
    field.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.justifyContent).toBe('center'));
    expect(panel.querySelector<HTMLElement>('[data-field="justify-content"] .style-applicability')?.textContent).toContain('Возможно не действует');
    editor.destroy();
  });

  it('refuses to reset a style that the host changed after Lykar preview', async () => {
    document.body.innerHTML = '<div id="box" style="color: purple">Box</div>';
    const box = document.querySelector<HTMLElement>('#box')!;
    const editor = new LykarEditor({document}).start();
    editor.select(box);
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLElement>('.style-section[data-section="typography"] summary')!.click();
    await vi.waitFor(() => expect(panel.querySelector('[data-field="color"]')).not.toBeNull());
    const color = panel.querySelector<HTMLInputElement>('[data-field="color"] input[aria-label="Text Color"]')!;
    color.value = 'green';
    color.dispatchEvent(new Event('change', {bubbles: true}));
    await vi.waitFor(() => expect(box.style.color).toBe('green'));
    box.style.color = 'blue';
    const count = editor.exportDraft().operations.length;
    panel.querySelector<HTMLButtonElement>('[data-field="color"] button[aria-label="Вернуть исходный Text Color"]')!.click();
    await vi.waitFor(() => expect(panel.querySelector('[data-field="status"]')?.textContent).toContain('изменён страницей'));
    expect(box.style.color).toBe('blue');
    expect(editor.exportDraft().operations).toHaveLength(count);
    editor.destroy();
  });

  it('confines replay to its root and does not restore another draft pending queue', async () => {
    document.body.innerHTML = `
      <main id="a"><p data-lykar-id="copy">A</p></main>
      <main id="b"><p data-lykar-id="copy">B</p></main>
    `;
    const pending: OperationV1 = {
      schemaVersion: 1, id: 'pending-a', kind: 'setText',
      target: {marker: 'copy'}, value: 'A pending',
    };
    window.sessionStorage.setItem('lykar:draft:draft-a', JSON.stringify({operations: [pending]}));
    const rootB = document.querySelector('#b')!;
    const pageB = new EditorSession(document, {
      root: rootB, storage: window.sessionStorage, storageKey: 'lykar:draft:draft-b',
    });

    expect(await pageB.restore()).toBeNull();
    await pageB.apply({operations: [{...pending, id: 'page-b', value: 'B changed'}]});

    expect(document.querySelector('#a p')?.textContent).toBe('A');
    expect(document.querySelector('#b p')?.textContent).toBe('B changed');
    expect(pageB.pendingOperations().map(operation => operation.id)).toEqual(['page-b']);
    expect(JSON.parse(window.sessionStorage.getItem('lykar:draft:draft-a')!).operations).toEqual([pending]);
  });

  it('applies a page-scoped batch only on Apply and supports undo/redo', async () => {
    window.history.replaceState({}, '', '/pricing?version=9');
    document.body.innerHTML = '<a id="cta" href="/old">Old label</a>';
    const link = document.querySelector('a')!;
    const target = buildTargetDescriptor(link);
    const operations: OperationV1[] = [
      { schemaVersion: 1, id: 'text', kind: 'setText', target, value: 'New label' },
      { schemaVersion: 1, id: 'style', kind: 'setStyle', target, property: 'color', value: 'purple' },
      { schemaVersion: 1, id: 'href', kind: 'setAttribute', target, name: 'href', value: '/new' },
    ];
    const session = new EditorSession(document);

    expect(link.textContent).toBe('Old label');
    const report = await session.apply({ id: 'pricing-edit', operations });

    expect(report).toMatchObject({ applied: 3, skipped: 0, errors: 0 });
    expect(link.textContent).toBe('New label');
    expect((link as HTMLElement).style.color).toBe('purple');
    expect(link.getAttribute('href')).toBe('/new');
    expect(session.exportDraft()).toMatchObject({
      page: { pathname: '/pricing', url: 'http://localhost:3000/pricing' },
      operations,
    });

    expect(session.undo()).toBe(true);
    expect(link.textContent).toBe('Old label');
    expect((link as HTMLElement).style.color).toBe('');
    expect(link.getAttribute('href')).toBe('/old');

    const redo = await session.redo();
    expect(redo?.applied).toBe(3);
    expect(link.textContent).toBe('New label');
  });

  it('undoes insert, move, and remove operations as one batch', async () => {
    document.body.innerHTML = `
      <main id="left"><p id="item">Item</p></main>
      <main id="right"></main>
    `;
    const left = document.querySelector('#left')!;
    const item = document.querySelector('#item')!;
    const right = document.querySelector('#right')!;
    const session = new EditorSession(document);
    const operations: OperationV1[] = [
      {
        schemaVersion: 1,
        id: 'insert',
        kind: 'insertNode',
        target: buildTargetDescriptor(item),
        position: 'after',
        node: { type: 'element', tag: 'span', children: [{ type: 'text', value: 'New' }] },
      },
      {
        schemaVersion: 1,
        id: 'move',
        kind: 'moveNode',
        target: buildTargetDescriptor(item),
        destination: buildTargetDescriptor(right),
        position: 'append',
      },
      {
        schemaVersion: 1,
        id: 'remove',
        kind: 'removeNode',
        target: buildTargetDescriptor(left),
      },
    ];

    const report = await session.apply({ operations });
    expect(report.applied).toBe(3);
    expect(document.querySelector('#left')).toBeNull();
    expect(right.querySelector('#item')).toBe(item);

    session.undo();
    expect(document.querySelector('#left')).toBe(left);
    expect(left.querySelector('#item')).toBe(item);
    expect(left.querySelector('span')).toBeNull();
  });

  it('compacts repeated live field previews and persists pending changes locally', async () => {
    document.body.innerHTML = '<h1 id="hero">Before</h1>';
    const heading = document.querySelector('h1')!;
    const session = new EditorSession(document, { storage: window.sessionStorage });
    const target = buildTargetDescriptor(heading);

    await session.preview({ schemaVersion: 1, id: 'first', kind: 'setText', target, value: 'A' }, 'hero:text', heading);
    await session.preview({ schemaVersion: 1, id: 'second', kind: 'setText', target, value: 'After' }, 'hero:text', heading);

    expect(heading.textContent).toBe('After');
    expect(session.exportDraft().operations).toHaveLength(1);
    expect(session.exportDraft().operations[0].id).toBe('second');
    expect(JSON.parse(window.sessionStorage.getItem('lykar:draft:http://localhost:3000/')!).operations).toHaveLength(1);
  });

  it('keeps skipped changes in the diagnostics tree model', async () => {
    document.body.innerHTML = '<main></main>';
    const session = new EditorSession(document);
    const report = await session.preview({
      schemaVersion: 1,
      id: 'missing',
      kind: 'setText',
      target: { marker: 'absent' },
      value: 'Never',
    });

    expect(report.skipped).toBe(1);
    expect(session.getChanges()[0]).toMatchObject({ id: 'missing', status: 'skipped', code: 'TARGET_NOT_FOUND' });
    expect(session.exportDraft().operations).toHaveLength(1);
  });

  it('keeps ambiguous candidate evidence for a future manual rebind UI', async () => {
    document.body.innerHTML = '<button id="one" class="cta">One</button><button id="two" class="cta">Two</button>';
    const session = new EditorSession(document);
    const target = { selectors: { css: '.cta' } };
    const report = await session.preview({
      schemaVersion: 1,
      id: 'ambiguous-repair',
      kind: 'setText',
      target,
      value: 'Never',
    });

    expect(report.operations[0]).toMatchObject({
      target,
      targetResolution: 'ambiguous',
      resolutionEvidence: {
        reason: 'MULTIPLE_CANDIDATES',
        candidateCount: 2,
        candidates: [
          { attributes: { id: 'one' } },
          { attributes: { id: 'two' } },
        ],
      },
    });
    expect(session.getChanges()[0].resolutionEvidence?.candidates).toHaveLength(2);
  });

  it('continues independent commands after an error and skips only dependent commands', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const session = new EditorSession(document);
    const report = await session.apply({operations: [
      {schemaVersion: 1, id: 'missing', kind: 'setText', target: {marker: 'absent'}, value: 'Never'},
      {schemaVersion: 1, id: 'dependent', kind: 'setStyle', target: {marker: 'hero'}, property: 'color', value: 'red', dependsOn: ['missing']},
      {schemaVersion: 1, id: 'independent', kind: 'setText', target: {marker: 'hero'}, value: 'After'},
    ]});

    expect(report.operations).toMatchObject([
      {operationId: 'missing', status: 'skipped', code: 'TARGET_NOT_FOUND'},
      {operationId: 'dependent', status: 'skipped', code: 'DEPENDENCY_UNAVAILABLE'},
      {operationId: 'independent', status: 'applied'},
    ]);
    expect(document.querySelector('h1')?.textContent).toBe('After');
  });

  it('undoes a saved change by appending a new pending revision', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const saved: OperationV1 = {
      schemaVersion: 1, id: 'saved-text', kind: 'setText', target: {marker: 'hero'}, value: 'Saved',
    };
    const session = new EditorSession(document);
    await session.restore([saved]);

    const report = await session.undoCommitted();

    expect(report).toMatchObject({applied: 1, errors: 0});
    expect(document.querySelector('h1')?.textContent).toBe('Before');
    expect(session.exportDraft().operations[0]).toEqual(saved);
    expect(session.pendingOperations()).toMatchObject([{
      kind: 'setText', value: 'Before', revision: {previousOperationId: 'saved-text', reason: 'undo'},
    }]);
    expect(session.pendingOperations()[0].id).not.toBe(saved.id);
  });

  it('restores a pending structural undo after its saved dependency', async () => {
    document.body.innerHTML = '<main data-lykar-id="root"></main>';
    const inserted: OperationV1 = {
      schemaVersion: 1, id: 'saved-insert', kind: 'insertNode', target: {marker: 'root'}, position: 'append',
      node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Saved child'}]},
    };
    const undo: OperationV1 = {
      schemaVersion: 1, id: 'pending-remove', kind: 'removeNode', target: {nodeRef: {operationId: 'saved-insert'}},
      dependsOn: ['saved-insert'], revision: {previousOperationId: 'saved-insert', reason: 'undo'},
    };
    window.sessionStorage.setItem('lykar:draft:structural', JSON.stringify({operations: [undo]}));
    const session = new EditorSession(document, {storage: window.sessionStorage, storageKey: 'lykar:draft:structural'});

    await session.restore([inserted]);

    expect(document.querySelector('[data-lykar-id="root"]')?.children).toHaveLength(0);
    expect(session.pendingOperations()).toEqual([undo]);
    expect(session.getChanges().at(-1)).toMatchObject({status: 'applied', code: undefined});
  });

  it('preserves a later host value when pending undo no longer owns the DOM state', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const heading = document.querySelector('h1')!;
    const session = new EditorSession(document);
    await session.apply({operations: [{
      schemaVersion: 1, id: 'local-text', kind: 'setText', target: {marker: 'hero'}, value: 'Editor',
    }]});
    heading.textContent = 'Host';

    expect(session.undo()).toBe(true);
    expect(heading.textContent).toBe('Host');
  });

  it('does not overwrite a later host value while undoing a saved change', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const heading = document.querySelector('h1')!;
    const session = new EditorSession(document);
    await session.restore([{
      schemaVersion: 1, id: 'saved-owned-text', kind: 'setText', target: {marker: 'hero'}, value: 'Saved',
    }]);
    heading.textContent = 'Host';

    const report = await session.undoCommitted();

    expect(report?.operations[0]).toMatchObject({status: 'skipped', code: 'BEFORE_TEXT_DRIFT'});
    expect(heading.textContent).toBe('Host');
  });

  it('repairs a missing target with a new operation revision and previews its dependent chain', async () => {
    document.body.innerHTML = '<main id="destination"></main>';
    const destination = document.querySelector('main')!;
    const session = new EditorSession(document);
    await session.apply({operations: [
      {
        schemaVersion: 1, id: 'failed-insert', kind: 'insertNode', target: {marker: 'missing'}, position: 'append',
        node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Repaired'}]},
      },
      {
        schemaVersion: 1, id: 'failed-style', kind: 'setStyle', target: {nodeRef: {operationId: 'failed-insert'}},
        property: 'color', value: 'purple', dependsOn: ['failed-insert'],
      },
    ]});

    const report = await session.repair('failed-insert', destination);

    expect(report).toMatchObject({applied: 2, skipped: 0, errors: 0});
    expect(destination.querySelector('p')?.textContent).toBe('Repaired');
    expect((destination.querySelector('p') as HTMLElement).style.color).toBe('purple');
    expect(session.pendingOperations().slice(-2)).toMatchObject([
      {revision: {previousOperationId: 'failed-insert', reason: 'target-repair'}},
      {revision: {previousOperationId: 'failed-style', reason: 'target-repair'}},
    ]);
    expect(session.getChanges().slice(0, 2).map(change => change.status)).toEqual(['skipped', 'skipped']);
  });
});

describe('editor UI and proposals', () => {
  it('removes overlay, panel, listeners and selection ownership on destroy', () => {
    document.body.innerHTML = '<main id="root"><button id="target">Target</button></main>';
    const root = document.querySelector('#root')!;
    const target = document.querySelector('#target')!;
    const selection = vi.fn();
    const editor = new LykarEditor({document, root, onSelection: selection}).start();

    expect(document.querySelectorAll('[data-lykar-editor-root]')).toHaveLength(2);
    editor.destroy();
    editor.destroy();
    const click = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true});
    target.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(selection).not.toHaveBeenCalled();
    expect(document.querySelector('[data-lykar-editor-root]')).toBeNull();
  });

  it('restores backend operations without losing unsaved local edits', async () => {
    document.body.innerHTML = '<h1 id="hero">Before</h1>';
    const target = buildTargetDescriptor(document.querySelector('h1')!);
    const saved: OperationV1 = { schemaVersion: 1, id: 'saved', kind: 'setText', target, value: 'Saved' };
    const pending: OperationV1 = { ...saved, id: 'pending', value: 'Unsaved' };
    window.sessionStorage.setItem('lykar:draft:draft', JSON.stringify({ operations: [pending] }));
    const editor = new LykarEditor({ document, capability: {
      token: 'editor-token', expiresAt: '2099-01-01', projectId: 'project',
      pageUrl: 'http://localhost:3000/', draftId: 'draft',
    }, persistence: {
      draftId: 'draft', expectedRevision: 0,
      fetch: vi.fn(async () => new Response(JSON.stringify({ draft: { revision: 1 }, operations: [saved] }))),
    } }).start();
    try {
      await vi.waitFor(() => expect(editor.session.getState().operationCount).toBe(2));
      expect(document.querySelector('h1')?.textContent).toBe('Unsaved');
      expect(editor.session.pendingOperations()).toEqual([pending]);
      expect(JSON.parse(window.sessionStorage.getItem('lykar:draft:draft')!).operations).toEqual([pending]);
      expect(editor.session.undo()).toBe(true);
      expect(document.querySelector('h1')?.textContent).toBe('Saved');
      expect(editor.session.pendingOperations()).toEqual([]);
      expect(editor.session.undo()).toBe(false);
      await editor.session.redo();
      expect(document.querySelector('h1')?.textContent).toBe('Unsaved');
      expect(editor.session.pendingOperations()).toEqual([pending]);
    } finally { editor.destroy(); }
  });

  it('does not mutate the page when a draft load finishes after destroy', async () => {
    document.body.innerHTML = '<h1 id="hero">Before</h1>';
    const target = buildTargetDescriptor(document.querySelector('h1')!);
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    const editor = new LykarEditor({ document, persistence: {
      draftId: 'draft', expectedRevision: 0, accessToken: 'token', fetch: fetcher,
    } }).start();
    editor.destroy();
    resolve(new Response(JSON.stringify({ draft: { revision: 1 }, operations: [
      { schemaVersion: 1, id: 'late', kind: 'setText', target, value: 'Late' },
    ] })));
    await new Promise(done => setTimeout(done, 20));
    expect(document.querySelector('h1')?.textContent).toBe('Before');
  });

  it('previews panel input immediately and commits the local draft on Apply', async () => {
    document.body.innerHTML = '<main><h1 id="hero">Before</h1></main>';
    const onApply = vi.fn();
    const editor = new LykarEditor({ document, onApply }).start();
    const heading = document.querySelector('h1')!;

    const pageClick = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    heading.dispatchEvent(pageClick);
    expect(pageClick.defaultPrevented).toBe(true);

    const panelHost = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!;
    const shadow = panelHost.shadowRoot!;
    const text = shadow.querySelector<HTMLTextAreaElement>('[data-field="text"]')!;
    const apply = shadow.querySelector<HTMLButtonElement>('[data-action="apply"]')!;
    expect(text.value).toBe('Before');

    text.value = 'After';
    text.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.waitFor(() => expect(heading.textContent).toBe('After'));
    expect(onApply).not.toHaveBeenCalled();
    apply.click();

    await vi.waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(editor.exportDraft().operations[0]).toMatchObject({ kind: 'setText', value: 'After' });
    editor.destroy();
  });

  it('renders command identity, target, result and manual repair controls in the Change Tree', async () => {
    document.body.innerHTML = '<main id="replacement"></main>';
    const editor = new LykarEditor({document}).start();
    await editor.session.apply({operations: [{
      schemaVersion: 1,
      id: 'missing-command',
      kind: 'insertNode',
      target: {marker: 'gone'},
      position: 'append',
      node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Restored'}]},
    }]});
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const change = panel.querySelector<HTMLElement>('[data-operation-id="missing-command"]')!;

    expect(change.textContent).toContain('missing-command');
    expect(change.textContent).toContain('insertNode · skipped');
    expect(change.textContent).toContain('[data-lykar-id="gone"]');
    expect(change.textContent).toContain('TARGET_NOT_FOUND');
    change.querySelector<HTMLButtonElement>('.repair')!.click();
    document.querySelector<HTMLElement>('#replacement')!.click();

    await vi.waitFor(() => expect(document.querySelector('#replacement p')?.textContent).toBe('Restored'));
    expect(editor.session.pendingOperations().at(-1)).toMatchObject({
      revision: {previousOperationId: 'missing-command', reason: 'target-repair'},
    });
    editor.destroy();
  });

  it('validates and previews a proposal summary without applying it before explicit acceptance', async () => {
    document.body.innerHTML = '<section id="feature">Feature</section>';
    const editor = new LykarEditor({document}).start();
    editor.select(document.querySelector('section'));
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLButtonElement>('[data-action="dummy-proposal"]')!.click();

    await vi.waitFor(() => expect(panel.querySelector<HTMLElement>('[data-view="proposal"]')!.hidden).toBe(false));
    expect(panel.querySelector('[data-field="proposal-operations"]')?.textContent).toContain('setStyle');
    expect((document.querySelector('section') as HTMLElement).style.outline).toBe('');
    panel.querySelector<HTMLButtonElement>('[data-action="accept-proposal"]')!.click();
    await vi.waitFor(() => expect((document.querySelector('section') as HTMLElement).style.outline).toContain('2px'));
    editor.destroy();
  });

  it('creates deterministic dummy proposals without external API calls', async () => {
    document.body.innerHTML = '<section id="feature">Feature</section>';
    const element = document.querySelector('section')!;
    const proposal = await new DummyProposalProvider().propose(element);

    expect(proposal).toMatchObject({ source: 'dummy', operations: [{ kind: 'setStyle', property: 'outline' }] });
    expect(proposal.description).toMatch(/Внешний AI API не вызывается/);
  });

  it('saves only pending operations through the editor capability on Apply', async () => {
    document.body.innerHTML = '<h1 id="hero">Before</h1>';
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = init?.body ? JSON.parse(String(init.body)) as {
        idempotencyKey: string;
        operations: OperationV1[];
      } : undefined;
      return {
        ok: true,
        status: 200,
        json: async () => init?.method === 'POST'
          ? ({ draft: {
              revision: 4,
              appended: 1,
              operationIds: request!.operations.map(operation => operation.id),
              idempotencyKey: request!.idempotencyKey,
              payloadHash: 'a'.repeat(64),
              replayed: false,
            } })
          : ({ draft: { revision: 3 }, operations: [] }),
      } as Response;
    });
    const onCommit = vi.fn();
    const editor = new LykarEditor({
      document,
      capability: {
        token: 'editor-capability-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        projectId: 'project-1',
        pageId: 'page-1',
        pageUrl: 'http://localhost:3000/',
      },
      persistence: {
        apiBaseUrl: 'http://localhost:3000',
        draftId: '22222222-2222-4222-8222-222222222222',
        expectedRevision: 3,
        fetch: fetcher as typeof fetch,
      },
      onCommit,
    }).start();
    editor.select(document.querySelector('h1'));
    const shadow = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const text = shadow.querySelector<HTMLTextAreaElement>('[data-field="text"]')!;
    text.value = 'After';
    text.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('h1')?.textContent).toBe('After'));
    shadow.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();

    await vi.waitFor(() => expect(onCommit).toHaveBeenCalledWith(
      { saved: 1, revision: 4, replayed: false },
      expect.any(Object),
    ));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const request = fetcher.mock.calls[1][1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: 'Bearer editor-capability-token' });
    expect(JSON.parse(String(request.body))).toMatchObject({
      idempotencyKey: expect.stringMatching(/^save-/),
      expectedRevision: 3,
      operations: [{ kind: 'setText', value: 'After' }],
      sourceSnapshot: { algorithm: 'lykar-dom-v1', pageHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(editor.session.getState().pendingOperationCount).toBe(0);
    editor.destroy();
  });

  it('retries a lost response with the same batch and keeps edits made while saving pending', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const requests: Array<Record<string, unknown>> = [];
    let rejectLostResponse!: (error: Error) => void;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        return new Response(JSON.stringify({draft: {revision: 0}, operations: []}));
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      requests.push(body);
      if (requests.length === 1) {
        return new Promise<Response>((_resolve, reject) => { rejectLostResponse = reject; });
      }
      const operations = body.operations as OperationV1[];
      return new Response(JSON.stringify({draft: {
        revision: 1,
        appended: operations.length,
        operationIds: operations.map(operation => operation.id),
        idempotencyKey: body.idempotencyKey,
        payloadHash: 'b'.repeat(64),
        replayed: true,
      }}));
    });
    const editor = new LykarEditor({
      document,
      persistence: {
        draftId: '22222222-2222-4222-8222-222222222222',
        expectedRevision: 0,
        accessToken: 'token',
        fetch: fetcher as typeof fetch,
      },
    }).start();
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    const apply = panel.querySelector<HTMLButtonElement>('[data-action="apply"]')!;
    const first: OperationV1 = {
      schemaVersion: 1, id: 'before-flight', kind: 'setText', target: {marker: 'hero'}, value: 'Sending',
    };
    const during: OperationV1 = {
      schemaVersion: 1, id: 'during-flight', kind: 'setText', target: {marker: 'hero'}, value: 'New pending',
    };
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await editor.session.apply({operations: [first]});
    apply.click();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await editor.session.apply({operations: [during]});
    rejectLostResponse(new TypeError('response lost after commit'));
    await vi.waitFor(() => expect(panel.querySelector('[data-field="status"]')?.textContent).toMatch(/безопасного повтора/));

    apply.click();
    await vi.waitFor(() => expect(requests).toHaveLength(2));

    expect(requests[1]).toEqual(requests[0]);
    expect(editor.session.pendingOperations()).toEqual([during]);
    const stored = JSON.parse(window.sessionStorage.getItem('lykar:draft:22222222-2222-4222-8222-222222222222')!);
    expect(stored.operations).toEqual([during]);
    expect(stored.inFlight).toBeUndefined();
    editor.destroy();
  });

  it('shows revision conflict review and creates a new key only after explicit resolution', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const saveKeys: string[] = [];
    let revision = 0;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        return new Response(JSON.stringify({draft: {revision}, operations: []}));
      }
      const body = JSON.parse(String(init.body)) as {idempotencyKey: string; operations: OperationV1[]};
      saveKeys.push(body.idempotencyKey);
      if (saveKeys.length === 1) {
        revision = 1;
        return new Response(JSON.stringify({error: {
          code: 'REVISION_CONFLICT',
          message: 'Draft revision does not match',
          details: {expectedRevision: 0, actualRevision: 1},
        }}), {status: 409});
      }
      return new Response(JSON.stringify({draft: {
        revision: 2,
        appended: body.operations.length,
        operationIds: body.operations.map(operation => operation.id),
        idempotencyKey: body.idempotencyKey,
        payloadHash: 'c'.repeat(64),
        replayed: false,
      }}));
    });
    const editor = new LykarEditor({
      document,
      persistence: {draftId: 'draft-conflict', expectedRevision: 0, accessToken: 'token', fetch: fetcher as typeof fetch},
    }).start();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await editor.session.apply({operations: [{
      schemaVersion: 1, id: 'local-conflict', kind: 'setText', target: {marker: 'hero'}, value: 'Local',
    }]});
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await vi.waitFor(() => expect(panel.querySelector<HTMLElement>('[data-view="save-conflict"]')!.hidden).toBe(false));
    expect(editor.session.pendingOperations()).toHaveLength(1);

    panel.querySelector<HTMLButtonElement>('[data-action="resolve-conflict"]')!.click();
    await vi.waitFor(() => expect(panel.querySelector<HTMLElement>('[data-view="save-conflict"]')!.hidden).toBe(true));
    panel.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await vi.waitFor(() => expect(editor.session.pendingOperations()).toHaveLength(0));

    expect(saveKeys).toHaveLength(2);
    expect(saveKeys[1]).not.toBe(saveKeys[0]);
    editor.destroy();
  });

  it('does not send a save when recovery storage is unavailable', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const brokenStorage: Storage = {
      length: 0,
      clear() {},
      getItem() { return null; },
      key() { return null; },
      removeItem() {},
      setItem() { throw new Error('quota denied'); },
    };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({draft: {revision: 0}, operations: []})));
    const editor = new LykarEditor({
      document,
      storage: brokenStorage,
      persistence: {draftId: 'draft-storage', expectedRevision: 0, accessToken: 'token', fetch: fetcher as typeof fetch},
    }).start();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await editor.session.apply({operations: [{
      schemaVersion: 1, id: 'storage-pending', kind: 'setText', target: {marker: 'hero'}, value: 'Pending',
    }]});
    const panel = document.querySelector<HTMLElement>('[data-lykar-editor-root="panel"]')!.shadowRoot!;
    panel.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await vi.waitFor(() => expect(panel.querySelector('[data-field="status"]')?.textContent).toMatch(/sessionStorage/));

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(editor.session.pendingOperations()).toHaveLength(1);
    editor.destroy();
  });

  it('rejects an expired or page-mismatched editing capability', () => {
    expect(() => new LykarEditor({
      document,
      capability: {
        token: 'one-time-token',
        expiresAt: '2020-01-01T00:00:00.000Z',
        projectId: 'project-1',
        pageUrl: 'http://localhost:3000/',
      },
    })).toThrow(/expired/);

    expect(() => new LykarEditor({
      document,
      capability: {
        token: 'one-time-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
        projectId: 'project-1',
        pageUrl: 'https://other.test/',
      },
    })).toThrow(/does not match/);
  });
});
