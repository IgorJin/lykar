import type { OperationV1, PublishedManifestV1 } from '@lykar/protocol';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { applyOperation } from './dom-executor.js';
import { sha256Text } from './hash.js';
import { fetchManifest, ManifestRequestError } from './manifest-client.js';
import { Lykar } from './runtime.js';
import type { FetchLike } from './types.js';

const textOperation = (
  id: string,
  marker: string,
  value: string,
): OperationV1 => ({
  schemaVersion: 1,
  id,
  kind: 'setText',
  target: { marker },
  value,
});

function manifest(
  operations: OperationV1[],
  overrides: Partial<PublishedManifestV1> = {},
): PublishedManifestV1 {
  return {
    schemaVersion: 1,
    projectId: 'project-1',
    pageId: 'page-1',
    pathname: '/page',
    releaseId: `release-${Math.random()}`,
    version: 1,
    manifestHash: 'a'.repeat(64),
    operations,
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('DOM executor', () => {
  it('applies marker and CSS-targeted text and style operations in order', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Old</h1>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([
      textOperation('text-1', 'hero', 'New heading'),
      {
        schemaVersion: 1,
        id: 'style-1',
        kind: 'setStyle',
        target: { selectors: { css: 'h1' } },
        property: 'backgroundColor',
        value: 'rgb(1, 2, 3)',
      },
    ]));

    const heading = document.querySelector('h1') as HTMLElement;
    expect(heading.textContent).toBe('New heading');
    expect(heading.style.backgroundColor).toBe('rgb(1, 2, 3)');
    expect(report).toMatchObject({ applied: 2, skipped: 0, errors: 0 });
    expect(report.operations.map(operation => operation.targetStrategy)).toEqual(['marker', 'css']);
  });

  it('records a missing target and continues with later operations', async () => {
    document.body.innerHTML = '<p data-lykar-id="present">Before</p>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([
      textOperation('missing', 'absent', 'Never'),
      textOperation('present', 'present', 'After'),
    ]));

    expect(document.querySelector('p')?.textContent).toBe('After');
    expect(report).toMatchObject({ applied: 1, skipped: 1, errors: 0 });
    expect(report.operations[0]).toMatchObject({ status: 'skipped', code: 'TARGET_NOT_FOUND' });
  });

  it('inserts safe trees and rejects executable attributes without partial insertion', async () => {
    document.body.innerHTML = '<main data-lykar-id="content"></main>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([
      {
        schemaVersion: 1,
        id: 'safe-insert',
        kind: 'insertNode',
        target: { marker: 'content' },
        position: 'append',
        node: {
          type: 'element',
          tag: 'p',
          attributes: { class: 'lead' },
          children: [{ type: 'text', value: 'Inserted' }],
        },
      },
      {
        schemaVersion: 1,
        id: 'unsafe-insert',
        kind: 'insertNode',
        target: { marker: 'content' },
        position: 'append',
        node: {
          type: 'element',
          tag: 'img',
          attributes: { src: 'javascript:alert(1)', onerror: 'alert(1)' },
        },
      },
    ]));

    expect(document.querySelector('p.lead')?.textContent).toBe('Inserted');
    expect(document.querySelector('[data-lykar-operation-id="safe-insert"]')).not.toBeNull();
    expect(document.querySelector('img')).toBeNull();
    expect(report).toMatchObject({ applied: 1, skipped: 0, errors: 1 });
    expect(report.operations[1].code).toBe('UNSAFE_NODE_URL');
  });

  it('sets and removes safe attributes while rejecting script-capable values', async () => {
    document.body.innerHTML = '<a data-lykar-id="link" title="Old">Link</a>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([
      {
        schemaVersion: 1,
        id: 'set-href',
        kind: 'setAttribute',
        target: { marker: 'link' },
        name: 'href',
        value: '/pricing',
      },
      {
        schemaVersion: 1,
        id: 'remove-title',
        kind: 'removeAttribute',
        target: { marker: 'link' },
        name: 'title',
      },
      {
        schemaVersion: 1,
        id: 'unsafe-handler',
        kind: 'setAttribute',
        target: { marker: 'link' },
        name: 'onclick',
        value: 'alert(1)',
      },
    ]));

    const link = document.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/pricing');
    expect(link?.hasAttribute('title')).toBe(false);
    expect(link?.hasAttribute('onclick')).toBe(false);
    expect(report).toMatchObject({ applied: 2, errors: 1 });
    expect(report.operations[2].code).toBe('UNSAFE_NODE_ATTRIBUTE');
  });

  it('moves and removes nodes while protecting the document roots', async () => {
    document.body.innerHTML = `
      <section data-lykar-id="left"><span data-lykar-id="item">Item</span></section>
      <section data-lykar-id="right"><i data-lykar-id="remove">Delete me</i></section>
    `;
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([
      {
        schemaVersion: 1,
        id: 'move',
        kind: 'moveNode',
        target: { marker: 'item' },
        destination: { marker: 'right' },
        position: 'append',
      },
      {
        schemaVersion: 1,
        id: 'remove',
        kind: 'removeNode',
        target: { marker: 'remove' },
      },
      {
        schemaVersion: 1,
        id: 'protect-body',
        kind: 'removeNode',
        target: { selectors: { css: 'body' } },
      },
    ]));

    expect(document.querySelector('[data-lykar-id="right"]')?.lastElementChild?.textContent).toBe('Item');
    expect(document.querySelector('[data-lykar-id="remove"]')).toBeNull();
    expect(document.body.isConnected).toBe(true);
    expect(report).toMatchObject({ applied: 2, errors: 1 });
    expect(report.operations[2].code).toBe('PROTECTED_DOCUMENT_NODE');
  });

  it('checks parent and text-hash preconditions before mutating', async () => {
    document.body.innerHTML = '<main data-lykar-id="parent"><p data-lykar-id="copy">Original</p></main>';
    const originalHash = await sha256Text('Original');
    const success = await applyOperation(document, {
      ...textOperation('precondition-ok', 'copy', 'Changed'),
      precondition: {
        parent: { marker: 'parent' },
        textHash: `sha256:${originalHash}`,
      },
    });
    const failure = await applyOperation(document, {
      ...textOperation('precondition-stale', 'copy', 'Wrong'),
      precondition: { textHash: originalHash },
    });

    expect(success.status).toBe('applied');
    expect(failure).toMatchObject({ status: 'skipped', code: 'TEXT_PRECONDITION_FAILED' });
    expect(document.querySelector('p')?.textContent).toBe('Changed');
  });

  it('uses selector fallbacks when an earlier locator is invalid or stale', async () => {
    document.body.innerHTML = '<p id="fallback">Found</p>';
    const operation: OperationV1 = {
      schemaVersion: 1,
      id: 'fallback',
      kind: 'setStyle',
      target: {
        marker: 'stale',
        selectors: { css: '[[invalid', xpath: '//*[@id="fallback"]' },
        fingerprint: { tag: 'p' },
      },
      property: 'color',
      value: 'red',
    };

    const result = await applyOperation(document, operation);

    expect(result).toMatchObject({ status: 'applied', targetStrategy: 'xpath' });
    expect((document.querySelector('p') as HTMLElement).style.color).toBe('red');
  });
});

describe('manifest loading and runtime lifecycle', () => {
  it('loads a validated versioned manifest and applies it to a static document', async () => {
    const dom = new JSDOM('<h1 data-lykar-id="hero">Old</h1>', {
      url: 'https://site.test/page?version=7',
    });
    const published = manifest([textOperation('text-start', 'hero', 'Published')], {
      releaseId: 'release-start',
      version: 7,
    });
    const fetcher = vi.fn<FetchLike>(async () => response({ manifest: published }));
    const runtime = new Lykar('pk_public', {
      apiBaseUrl: 'https://api.test/',
      document: dom.window.document,
      fetch: fetcher,
      waitForDom: false,
    });

    const report = await runtime.start();

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.test/api/runtime/projects/pk_public/manifest?pathname=%2Fpage&version=7',
      { headers: { Accept: 'application/json' } },
    );
    expect(dom.window.document.querySelector('h1')?.textContent).toBe('Published');
    expect(report).toMatchObject({ version: 7, applied: 1, errors: 0 });
  });

  it('does not replay the same release twice unless forced', async () => {
    document.body.innerHTML = '<main data-lykar-id="content"></main>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const published = manifest([{
      schemaVersion: 1,
      id: 'once',
      kind: 'insertNode',
      target: { marker: 'content' },
      position: 'append',
      node: { type: 'element', tag: 'span', children: [{ type: 'text', value: 'Once' }] },
    }], { releaseId: 'release-once' });

    const first = await runtime.applyManifest(published);
    const second = await runtime.applyManifest(published);

    expect(first.applied).toBe(1);
    expect(second).toMatchObject({ alreadyApplied: true, applied: 0, skipped: 1 });
    expect(document.querySelectorAll('span')).toHaveLength(1);
  });

  it('rejects malformed API manifests before touching the DOM', async () => {
    const fetcher: FetchLike = async () => response({
      manifest: {
        schemaVersion: 2,
        projectId: 'project-1',
        pageId: 'page-1',
        pathname: '/',
        releaseId: 'release-1',
        version: 1,
        manifestHash: 'invalid',
        operations: [],
        createdAt: 'invalid',
      },
    });

    await expect(fetchManifest({ projectKey: 'pk_test', pathname: '/', fetch: fetcher }))
      .rejects.toBeInstanceOf(ManifestRequestError);
  });
});
