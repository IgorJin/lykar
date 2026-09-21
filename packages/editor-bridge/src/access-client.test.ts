import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

import { exchangeEditorLaunch } from './access-client.js';

describe('editor launch access persistence', () => {
  const savedCapability = () => ({
    token: 'session-token-abcdefghijklmnopqrstuvwxyz',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    projectId: 'project', pageId: 'page', draftId: 'draft', expectedRevision: 0,
    pageUrl: 'https://site.test/page', apiBaseUrl: 'https://api.test',
  });

  it.each([
    ['another API', { apiBaseUrl: 'https://other-api.test' }],
    ['invalid expiry', { expiresAt: 'invalid' }],
    ['negative revision', { expectedRevision: -1 }],
    ['another page', { pageUrl: 'https://site.test/other' }],
  ])('drops capabilities with %s', async (_reason, change) => {
    const dom = new JSDOM('<body></body>', { url: 'https://site.test/page' });
    dom.window.sessionStorage.setItem('lykar:editor-capability:/page', JSON.stringify({ ...savedCapability(), ...change }));
    await expect(exchangeEditorLaunch({ apiBaseUrl: 'https://api.test', document: dom.window.document })).resolves.toBeNull();
    expect(dom.window.sessionStorage.length).toBe(0);
  });

  it('does not restore editor access over an explicit share navigation', async () => {
    const dom = new JSDOM('<body></body>', { url: 'https://site.test/page#lykar_share=share-code' });
    dom.window.sessionStorage.setItem('lykar:editor-capability:/page', JSON.stringify(savedCapability()));
    await expect(exchangeEditorLaunch({ apiBaseUrl: 'https://api.test', document: dom.window.document })).resolves.toBeNull();
  });

  it('fails closed when storage reads and removal both throw', async () => {
    const dom = new JSDOM('<body></body>', { url: 'https://site.test/page' });
    const storage = { getItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } } as unknown as Storage;
    await expect(exchangeEditorLaunch({ apiBaseUrl: 'https://api.test', document: dom.window.document, storage })).resolves.toBeNull();
  });

  it('exchanges the one-use code and restores the scoped capability after reload', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', {
      url: 'https://site.test/page#lykar_edit=abcdefghijklmnopqrstuvwxyz123456',
    });
    const capability = {
      token: 'session-token-abcdefghijklmnopqrstuvwxyz',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      projectId: 'project',
      pageId: 'page',
      pageUrl: 'https://site.test/page',
      draftId: 'draft',
      expectedRevision: 2,
      baseVersion: null,
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ capability }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const exchanged = await exchangeEditorLaunch({
      apiBaseUrl: 'https://api.test',
      document: dom.window.document,
      fetch,
    });
    expect(exchanged).toMatchObject({ token: capability.token, apiBaseUrl: 'https://api.test' });
    expect(dom.window.location.hash).toBe('');

    const restored = await exchangeEditorLaunch({
      apiBaseUrl: 'https://api.test',
      document: dom.window.document,
      fetch: vi.fn(async () => { throw new Error('restore must not call exchange'); }),
    });
    expect(restored).toEqual(exchanged);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('drops expired persisted capabilities', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://site.test/page' });
    dom.window.sessionStorage.setItem('lykar:editor-capability:/page', JSON.stringify({
      token: 'session-token-abcdefghijklmnopqrstuvwxyz',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
      pageUrl: 'https://site.test/page',
      draftId: 'draft',
      expectedRevision: 0,
    }));
    await expect(exchangeEditorLaunch({
      apiBaseUrl: 'https://api.test',
      document: dom.window.document,
    })).resolves.toBeNull();
    expect(dom.window.sessionStorage.length).toBe(0);
  });
});
