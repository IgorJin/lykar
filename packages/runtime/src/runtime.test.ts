import type { OperationV1, PublishedManifestV1 } from '@lykar/protocol';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { applyOperation } from './dom-executor.js';
import { captureSourceSnapshot } from './dom-fingerprint.js';
import { sha256Text } from './hash.js';
import { fetchManifest, ManifestRequestError } from './manifest-client.js';
import { Lykar, track } from './runtime.js';
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
  it('confines target resolution and source ownership to the supplied root', async () => {
    document.body.innerHTML = `
      <main id="outside"><p data-lykar-id="copy">Outside</p></main>
      <main id="session"><p data-lykar-id="copy">Inside</p></main>
    `;
    const root = document.querySelector('#session')!;
    const runtime = new Lykar({projectKey: 'pk_test', document, root});

    const report = await runtime.applyManifest(manifest([
      textOperation('root-only', 'copy', 'Changed'),
    ]));

    expect(document.querySelector('#outside p')?.textContent).toBe('Outside');
    expect(document.querySelector('#session p')?.textContent).toBe('Changed');
    expect(report.applied).toBe(1);
  });

  it('drops a late manifest response after lifecycle cancellation without mutation or report', async () => {
    document.body.innerHTML = '<p data-lykar-id="copy">Page B</p>';
    const controller = new AbortController();
    const onReport = vi.fn();
    let resolveResponse!: (value: Response) => void;
    const fetch = vi.fn<FetchLike>(() => new Promise(resolve => { resolveResponse = resolve; }));
    const runtime = new Lykar({
      projectKey: 'pk_test', document, version: 1, fetch, waitForDom: false,
      signal: controller.signal, isCurrent: () => !controller.signal.aborted, onReport,
    });
    const started = runtime.start();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();
    resolveResponse(response({manifest: manifest([textOperation('late', 'copy', 'Page A')])}));

    await expect(started).rejects.toMatchObject({name: 'AbortError'});
    expect(document.querySelector('p')?.textContent).toBe('Page B');
    expect(onReport).not.toHaveBeenCalled();
  });

  it('retries missing targets within a bound and applies a late node', async () => {
    document.body.innerHTML = '<main id="root"></main>';
    const root = document.querySelector('#root')!;
    const runtime = new Lykar({
      projectKey: 'pk_test', document, root, targetRetryMs: 100, targetRetryIntervalMs: 5,
    });
    globalThis.setTimeout(() => {
      root.innerHTML = '<p data-lykar-id="late">Before</p>';
    }, 10);

    const report = await runtime.applyManifest(manifest([textOperation('late-node', 'late', 'After')]));

    expect(root.textContent).toBe('After');
    expect(report).toMatchObject({applied: 1, skipped: 0});
  });

  it('ends target retry with a bounded diagnostic when the node never arrives', async () => {
    const startedAt = Date.now();
    const runtime = new Lykar({
      projectKey: 'pk_test', document, targetRetryMs: 20, targetRetryIntervalMs: 5,
    });

    const report = await runtime.applyManifest(manifest([textOperation('bounded', 'never', 'After')]));

    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(report.operations[0]).toMatchObject({status: 'skipped', code: 'TARGET_NOT_FOUND'});
  });

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

  it('does not mutate the first candidate when strict resolution is ambiguous', async () => {
    document.body.innerHTML = '<button class="cta">First</button><button class="cta">Second</button>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([{
      schemaVersion: 1,
      id: 'ambiguous',
      kind: 'setText',
      target: { selectors: { css: '.cta' }, fingerprint: { tag: 'button' } },
      value: 'Changed',
    }]));

    expect([...document.querySelectorAll('.cta')].map(element => element.textContent)).toEqual(['First', 'Second']);
    expect(report.operations[0]).toMatchObject({
      status: 'skipped',
      code: 'TARGET_AMBIGUOUS',
      targetResolution: 'ambiguous',
      resolutionEvidence: { reason: 'MULTIPLE_CANDIDATES', candidateCount: 2 },
    });
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

  it('separates mutable before-state from locator identity after setText', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Before</h1>';
    const beforeHash = await sha256Text('Before');
    const target = { marker: 'hero', fingerprint: { tag: 'h1' } };
    const first = await applyOperation(document, {
      schemaVersion: 1,
      id: 'stateful-text',
      kind: 'setText',
      target,
      precondition: { before: { textHash: beforeHash } },
      desiredState: { textHash: await sha256Text('After') },
      value: 'After',
    });
    const second = await applyOperation(document, {
      schemaVersion: 1,
      id: 'after-text-style',
      kind: 'setStyle',
      target,
      property: 'color',
      value: 'blue',
    });

    expect(first.status).toBe('applied');
    expect(second.status).toBe('applied');
    expect(document.querySelector('h1')?.textContent).toBe('After');
  });

  it('returns repair candidates and the original target for ambiguity', async () => {
    document.body.innerHTML = '<button id="first" class="cta">A</button><button id="second" class="cta">B</button>';
    const operation: OperationV1 = {
      schemaVersion: 1,
      id: 'repair-data',
      kind: 'setText',
      target: { selectors: { css: '.cta' } },
      value: 'Never',
    };
    const result = await applyOperation(document, operation);

    expect(result.target).toEqual(operation.target);
    expect(result.resolutionEvidence).toMatchObject({
      reason: 'MULTIPLE_CANDIDATES',
      candidateCount: 2,
      candidates: [
        { index: 0, tag: 'button', attributes: { id: 'first' } },
        { index: 1, tag: 'button', attributes: { id: 'second' } },
      ],
    });
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

  it('applies the exact binding snapshot frozen into a release', async () => {
    document.body.innerHTML = '<main data-lykar-id="root"><h1 class="current">Old</h1></main><h1 class="current">Outside</h1>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const published = manifest([{
      schemaVersion: 1,
      id: 'logical-target',
      kind: 'setText',
      target: { binding: { targetId: 'hero', bindingVersion: 1, environment: 'preview' } },
      value: 'Pinned',
    }], {
      targetEnvironment: 'preview',
      targetRegistry: {
        schemaVersion: 1,
        targets: [{
          id: 'hero',
          scope: {
            projectId: 'project-1',
            pageId: 'page-1',
            root: { id: 'root', kind: 'element', descriptor: { marker: 'root' } },
          },
          createdAt: '2026-09-21T00:00:00.000Z',
        }],
        bindings: [{
          schemaVersion: 1,
          targetId: 'hero',
          bindingVersion: 1,
          environment: 'preview',
          descriptor: { selectors: { css: '.current' }, fingerprint: { tag: 'h1' } },
          createdAt: '2026-09-21T00:00:00.000Z',
        }],
      },
    });

    const report = await runtime.applyManifest(published);

    expect(document.querySelector('[data-lykar-id="root"] h1')?.textContent).toBe('Pinned');
    expect(document.querySelector('body > h1')?.textContent).toBe('Outside');
    expect(report.operations[0]).toMatchObject({ status: 'applied', targetResolution: 'unique' });
  });
});

describe('manifest loading and runtime lifecycle', () => {
  it('replays the frozen legacy descriptor fixture without a registry', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="legacy-hero">Native</h1>';
    const fixture = JSON.parse(readFileSync(
      'test/fixtures/legacy-manifest-v1.json',
      'utf8',
    )) as PublishedManifestV1;
    const report = await new Lykar({ projectKey: 'pk_legacy', document }).applyManifest(fixture);

    expect(report.applied).toBe(1);
    expect(document.querySelector('h1')?.textContent).toBe('Legacy replayed');
  });

  it('rejects an incompatible manifest before the first mutation', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Native</h1>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const incompatible = manifest([textOperation('never', 'hero', 'Changed')]) as unknown as Record<string, unknown>;
    incompatible.schemaVersion = 2;

    await expect(runtime.applyManifest(incompatible as unknown as PublishedManifestV1)).rejects.toThrow(/schemaVersion/);
    expect(document.querySelector('h1')?.textContent).toBe('Native');
  });

  it('leaves the native page untouched and skips the API without a variant or preview version', async () => {
    const dom = new JSDOM('<h1>Native</h1>', { url: 'https://site.test/page' });
    const fetcher = vi.fn<FetchLike>();
    const result = await new Lykar({
      projectKey: 'pk_public', document: dom.window.document, fetch: fetcher, waitForDom: false,
    }).start();

    expect(result).toMatchObject({ mode: 'native', reason: 'NO_VARIANT_TOKEN' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(dom.window.document.querySelector('h1')?.textContent).toBe('Native');
  });

  it('treats unavailable variant tokens as the native page', async () => {
    const token = 'v'.repeat(48);
    const dom = new JSDOM('<h1>Native</h1>', { url: `https://site.test/page?lykar_variant=${token}` });
    const fetcher = vi.fn<FetchLike>(async () => response(undefined, 204));
    const result = await new Lykar({
      projectKey: 'pk_public', apiBaseUrl: 'https://api.test', document: dom.window.document,
      fetch: fetcher, waitForDom: false,
    }).start();

    expect(fetcher).toHaveBeenCalledWith(
      `https://api.test/api/runtime/projects/pk_public/manifest?pathname=%2Fpage&variantToken=${token}`,
      { headers: { Accept: 'application/json' } },
    );
    expect(result).toMatchObject({ mode: 'native', reason: 'VARIANT_UNAVAILABLE' });
  });

  it('identifies a valid native control variant without applying a release', async () => {
    const token = 'a'.repeat(48);
    const dom = new JSDOM('<h1>Control</h1>', { url: `https://site.test/page?lykar_variant=${token}` });
    const fetcher = vi.fn<FetchLike>(async () => response({
      manifest: null,
      variant: { experimentId: 'experiment-1', key: 'A' },
    }));
    const result = await new Lykar({
      projectKey: 'pk_public', apiBaseUrl: 'https://api.test', document: dom.window.document,
      fetch: fetcher, waitForDom: false,
    }).start();

    expect(result).toMatchObject({
      mode: 'native', reason: 'NATIVE_VARIANT', experimentId: 'experiment-1', variantKey: 'A',
    });
    expect(dom.window.document.querySelector('h1')?.textContent).toBe('Control');
  });

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

  it('reports page drift without blocking compatible target-level operations', async () => {
    document.body.innerHTML = '<h1 data-lykar-id="hero">Native</h1>';
    const runtime = new Lykar({ projectKey: 'pk_test', document });
    const report = await runtime.applyManifest(manifest([textOperation('drift', 'hero', 'Changed')], {
      sourceSnapshot: {
        algorithm: 'lykar-dom-v1',
        pageHash: 'f'.repeat(64),
        capturedAt: '2026-08-06T00:00:00.000Z',
      },
    }));

    expect(report.compatibility.status).toBe('drifted');
    expect(report.applied).toBe(1);
    expect(document.querySelector('h1')?.textContent).toBe('Changed');
  });

  it('keeps text, CSS, and service DOM out of structural visual claims', async () => {
    const localDocument = new JSDOM('<h1 class="hero">Native</h1>', { url: 'https://site.test/' }).window.document;
    const before = await captureSourceSnapshot(localDocument);
    const heading = localDocument.querySelector('h1') as HTMLElement;
    heading.textContent = 'Changed text is not copied into the snapshot';
    heading.style.color = 'red';
    localDocument.body.insertAdjacentHTML('beforeend', `
      <aside data-lykar-editor-root="panel">Editor</aside>
      <p data-lykar-operation-id="service-node">Inserted by Lykar</p>
    `);
    const after = await captureSourceSnapshot(localDocument);
    localDocument.querySelector('[data-lykar-editor-root]')?.remove();
    localDocument.querySelector('[data-lykar-operation-id]')?.remove();
    const report = await new Lykar({ projectKey: 'pk_test', document: localDocument }).applyManifest(manifest([], {
      sourceSnapshot: before,
    }));

    expect(after.pageHash).toBe(before.pageHash);
    expect(report.compatibility).toMatchObject({
      status: 'compatible',
      basis: 'structural',
      visualStatus: 'unknown',
      baseline: 'clean',
    });
  });

  it('reuses the clean pre-replay baseline instead of fingerprinting Lykar-mutated DOM', async () => {
    const localDocument = new JSDOM('<main data-lykar-id="root"></main>', { url: 'https://site.test/' }).window.document;
    const baseline = await captureSourceSnapshot(localDocument);
    const runtime = new Lykar({ projectKey: 'pk_test', document: localDocument });
    const insertion: OperationV1 = {
      schemaVersion: 1,
      id: 'baseline-insert',
      kind: 'insertNode',
      target: { marker: 'root' },
      position: 'append',
      node: { type: 'element', tag: 'p', children: [{ type: 'text', value: 'Lykar' }] },
    };
    const first = await runtime.applyManifest(manifest([insertion], { sourceSnapshot: baseline }));
    const second = await runtime.applyManifest(manifest([], {
      releaseId: 'release-after-mutation',
      sourceSnapshot: baseline,
    }));

    expect(localDocument.querySelector('[data-lykar-operation-id="baseline-insert"]')).not.toBeNull();
    expect(first.compatibility.status).toBe('compatible');
    expect(second.compatibility).toMatchObject({ status: 'compatible', baseline: 'clean' });
    expect(second.sourceSnapshot?.pageHash).toBe(baseline.pageHash);
  });

  it('reports unknown when the document has no trustworthy clean baseline', async () => {
    const localDocument = new JSDOM(
      '<main><p data-lykar-operation-id="older-runtime">Already changed</p></main>',
      { url: 'https://site.test/' },
    ).window.document;
    const expected = await captureSourceSnapshot(new JSDOM('<main></main>').window.document);
    const report = await new Lykar({ projectKey: 'pk_test', document: localDocument }).applyManifest(manifest([], {
      releaseId: 'release-without-clean-baseline',
      sourceSnapshot: expected,
    }));

    expect(report.compatibility).toMatchObject({
      status: 'unknown',
      basis: 'structural',
      visualStatus: 'unknown',
      baseline: 'unavailable',
    });
    expect(report.sourceSnapshot).toBeUndefined();
  });

  it('distributes an experiment, persists the browser ID, and gates events on consent', async () => {
    const token = 'e'.repeat(48);
    const dom = new JSDOM('<h1>Control</h1>', { url: `https://site.test/page?lykar_experiment=${token}` });
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetcher = vi.fn<FetchLike>(async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      calls.push({ url, body });
      if (url.endsWith('/experiments/resolve')) {
        return response({
          selection: {
            assignmentId: 'assignment-1', experimentId: 'experiment-1', variantKey: 'A',
            capability: 'signed-capability', capabilityExpiresAt: '2026-09-05T00:00:00.000Z',
            manifest: null,
          },
        });
      }
      return response({ accepted: true, duplicate: false }, 202);
    });
    const runtime = new Lykar({
      projectKey: 'pk_public', apiBaseUrl: 'https://api.test', document: dom.window.document,
      fetch: fetcher, waitForDom: false,
    });

    const result = await runtime.start();
    expect(result).toMatchObject({ mode: 'native', reason: 'NATIVE_VARIANT', variantKey: 'A' });
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({ pathname: '/page', experimentToken: token });
    expect(calls[0].body.anonymousId).toMatch(/^[0-9a-f-]{36}$/);
    expect(dom.window.document.cookie).toContain('lykar_anonymous_id=');
    await expect(runtime.track('signup', { plan: 'pro' })).resolves.toEqual({
      accepted: false, code: 'CONSENT_REQUIRED',
    });

    await runtime.consent('granted');
    await expect(runtime.track('signup', { plan: 'pro' })).resolves.toEqual({ accepted: true, duplicate: false });
    expect(calls.slice(1).map(call => call.body.eventType)).toEqual(['exposure', 'conversion']);
    expect(calls[1].body.name).toBe('$exposure');
    expect(calls[2].body.name).toBe('signup');
  });

  it('returns no active experiment from the global tracker when the latest runtime has no assignment', async () => {
    const dom = new JSDOM('<h1>Native</h1>', { url: 'https://site.test/page' });
    new Lykar({ projectKey: 'pk_public', document: dom.window.document, waitForDom: false });
    await expect(track('signup', { plan: 'pro' })).resolves.toEqual({
      accepted: false, code: 'NO_ACTIVE_EXPERIMENT',
    });
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
