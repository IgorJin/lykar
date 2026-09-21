import type { TargetRegistrySnapshotV1 } from '@lykar/protocol';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { resolveTarget } from './target-resolver.js';

function dom(body: string): Document {
  return new JSDOM(body).window.document;
}

describe('strict target resolution', () => {
  it('reports unique with per-locator evidence', async () => {
    const document = dom('<button data-lykar-id="cta" class="buy">Buy</button>');
    const result = await resolveTarget(document, {
      marker: 'cta',
      selectors: { css: '.buy' },
      fingerprint: { tag: 'button' },
    });

    expect(result.status).toBe('unique');
    expect(result.element?.textContent).toBe('Buy');
    expect(result.evidence).toMatchObject({ reason: 'UNIQUE_CANDIDATE', candidateCount: 1, rootId: 'document' });
    expect(result.evidence.attempts).toHaveLength(2);
  });

  it('reports ambiguous instead of selecting the first similar CTA', async () => {
    const document = dom('<button class="buy">First</button><button class="buy">Second</button>');
    const result = await resolveTarget(document, { selectors: { css: '.buy' }, fingerprint: { tag: 'button' } });

    expect(result).toMatchObject({ status: 'ambiguous', element: null });
    expect(result.evidence).toMatchObject({ reason: 'MULTIPLE_CANDIDATES', candidateCount: 2 });
  });

  it('distinguishes malformed locators from missing candidates', async () => {
    const document = dom('<main></main>');
    const invalid = await resolveTarget(document, { selectors: { css: '[[broken' } });
    const missing = await resolveTarget(document, { selectors: { css: '.absent' } });

    expect(invalid).toMatchObject({ status: 'invalid', evidence: { reason: 'LOCATOR_INVALID' } });
    expect(missing).toMatchObject({ status: 'missing', evidence: { reason: 'NO_CANDIDATES' } });
  });

  it('does not search outside the supplied root', async () => {
    const document = dom(`
      <section id="allowed"><button class="cta">Inside</button></section>
      <section><button class="cta">Outside</button></section>
    `);
    const root = document.querySelector('#allowed')!;
    const result = await resolveTarget(document, { selectors: { css: '.cta' } }, { root });

    expect(result.status).toBe('unique');
    expect(result.element?.textContent).toBe('Inside');
  });

  it('resolves an exact binding inside its logical root and environment', async () => {
    const document = dom(`
      <section data-lykar-id="pricing"><button class="cta">Pricing</button></section>
      <section><button class="cta">Other</button></section>
    `);
    const registry: TargetRegistrySnapshotV1 = {
      schemaVersion: 1,
      targets: [{
        id: 'checkout',
        scope: {
          projectId: 'project-1',
          pageId: 'page-1',
          root: { id: 'pricing', kind: 'element', descriptor: { marker: 'pricing' } },
        },
        createdAt: '2026-09-21T00:00:00.000Z',
      }],
      bindings: [{
        schemaVersion: 1,
        targetId: 'checkout',
        bindingVersion: 1,
        environment: 'production',
        descriptor: { selectors: { css: '.cta' } },
        createdAt: '2026-09-21T00:00:00.000Z',
      }],
    };
    const target = { binding: { targetId: 'checkout', bindingVersion: 1, environment: 'production' as const } };
    const result = await resolveTarget(document, target, {
      registry,
      projectId: 'project-1',
      pageId: 'page-1',
      environment: 'production',
    });

    expect(result.status).toBe('unique');
    expect(result.element?.textContent).toBe('Pricing');
    expect(result.evidence.rootId).toBe('pricing');
    expect((await resolveTarget(document, target, { registry, environment: 'preview' })).status).toBe('invalid');
  });
});
