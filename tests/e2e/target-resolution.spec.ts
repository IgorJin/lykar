import { expect, test, required } from './fixtures';

test('browser runtime blocks ambiguous, missing, and invalid targets', async ({ newContext }) => {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(required('LYKAR_E2E_PLAYGROUND_BASE_URL'));

  const outcome = await page.evaluate(async () => {
    document.body.innerHTML = `
      <button id="first-cta" class="duplicate-cta">First</button>
      <button id="second-cta" class="duplicate-cta">Second</button>
      <p id="untouched">Native</p>
    `;
    const first = document.querySelector('#first-cta')!;
    const second = document.querySelector('#second-cta')!;
    first.parentNode!.insertBefore(second, first);
    const manifest = {
      schemaVersion: 1,
      projectId: 'project-browser',
      pageId: 'page-browser',
      pathname: '/',
      releaseId: 'release-browser-targets',
      version: 1,
      manifestHash: 'a'.repeat(64),
      operations: [
        {
          schemaVersion: 1,
          id: 'ambiguous',
          kind: 'setText',
          target: { selectors: { css: '.duplicate-cta' } },
          value: 'Must not win',
        },
        {
          schemaVersion: 1,
          id: 'missing',
          kind: 'setText',
          target: { selectors: { css: '.missing' } },
          value: 'Missing',
        },
        {
          schemaVersion: 1,
          id: 'invalid',
          kind: 'setText',
          target: { selectors: { css: '[[broken' } },
          value: 'Invalid',
        },
      ],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const Lykar = (window as unknown as { Lykar: new (options: unknown) => { start(): Promise<any> } }).Lykar;
    const sdk = new Lykar({
      projectKey: 'pk_browser_targets',
      mode: 'visitor',
      version: 1,
      waitForDom: false,
      fetch: async () => new Response(JSON.stringify({ manifest }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    });
    const result = await sdk.start();
    return {
      buttons: Array.from(document.querySelectorAll('.duplicate-cta')).map(element => element.textContent),
      untouched: document.querySelector('#untouched')?.textContent,
      operations: result.runtime?.operations,
    };
  });

  expect(outcome.buttons).toEqual(['Second', 'First']);
  expect(outcome.untouched).toBe('Native');
  expect(outcome.operations).toMatchObject([
    {
      status: 'skipped',
      code: 'TARGET_AMBIGUOUS',
      targetResolution: 'ambiguous',
      target: { selectors: { css: '.duplicate-cta' } },
      resolutionEvidence: {
        reason: 'MULTIPLE_CANDIDATES',
        candidateCount: 2,
        candidates: [
          { attributes: { id: 'second-cta' } },
          { attributes: { id: 'first-cta' } },
        ],
      },
    },
    { status: 'skipped', code: 'TARGET_NOT_FOUND', targetResolution: 'missing' },
    { status: 'skipped', code: 'TARGET_INVALID', targetResolution: 'invalid' },
  ]);
});
