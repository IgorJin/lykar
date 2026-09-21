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

  it('creates deterministic dummy proposals without external API calls', async () => {
    document.body.innerHTML = '<section id="feature">Feature</section>';
    const element = document.querySelector('section')!;
    const proposal = await new DummyProposalProvider().propose(element);

    expect(proposal).toMatchObject({ source: 'dummy', operations: [{ kind: 'setStyle', property: 'outline' }] });
    expect(proposal.description).toMatch(/Внешний AI API не вызывается/);
  });

  it('saves only pending operations through the editor capability on Apply', async () => {
    document.body.innerHTML = '<h1 id="hero">Before</h1>';
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => init?.method === 'POST'
        ? ({ draft: { revision: 4, appended: 1 } })
        : ({ draft: { revision: 3 }, operations: [] }),
    } as Response));
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
      { saved: 1, revision: 4 },
      expect.any(Object),
    ));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const request = fetcher.mock.calls[1][1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: 'Bearer editor-capability-token' });
    expect(JSON.parse(String(request.body))).toMatchObject({
      expectedRevision: 3,
      operations: [{ kind: 'setText', value: 'After' }],
      sourceSnapshot: { algorithm: 'lykar-dom-v1', pageHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(editor.session.getState().pendingOperationCount).toBe(0);
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
