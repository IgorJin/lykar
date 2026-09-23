import {expect, test, required} from './fixtures';

test('replay keeps node identity, dependencies, and session compensation safe', async ({newContext}) => {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(required('LYKAR_E2E_PLAYGROUND_BASE_URL'));

  const outcome = await page.evaluate(async () => {
    document.body.innerHTML = `
      <section id="replay-scope">
        <main data-lykar-id="root"></main>
        <aside data-lykar-id="destination"></aside>
        <p data-lykar-id="independent">Native</p>
      </section>
    `;
    const root = document.querySelector('#replay-scope')!;
    const manifest = {
      schemaVersion: 1,
      projectId: 'project-replay-safety',
      pageId: 'page-replay-safety',
      pathname: '/replay-safety',
      releaseId: 'release-replay-safety',
      version: 1,
      manifestHash: 'd'.repeat(64),
      operations: [
        {
          schemaVersion: 1,
          id: 'insert-card',
          kind: 'insertNode',
          target: {marker: 'root'},
          position: 'append',
          node: {
            type: 'element',
            tag: 'article',
            children: [{type: 'text', value: 'Created text'}],
          },
        },
        {
          schemaVersion: 1,
          id: 'edit-created-text',
          kind: 'setText',
          target: {nodeRef: {operationId: 'insert-card', path: [0]}},
          dependsOn: ['insert-card'],
          value: 'Edited text',
        },
        {
          schemaVersion: 1,
          id: 'move-created-text',
          kind: 'moveNode',
          target: {nodeRef: {operationId: 'insert-card', path: [0]}},
          destination: {marker: 'destination'},
          dependsOn: ['insert-card', 'edit-created-text'],
          position: 'append',
        },
        {
          schemaVersion: 1,
          id: 'missing-insert',
          kind: 'insertNode',
          target: {marker: 'missing'},
          position: 'append',
          node: {type: 'element', tag: 'span'},
        },
        {
          schemaVersion: 1,
          id: 'blocked-dependent',
          kind: 'setText',
          target: {nodeRef: {operationId: 'missing-insert'}},
          dependsOn: ['missing-insert'],
          value: 'Never',
        },
        {
          schemaVersion: 1,
          id: 'independent-edit',
          kind: 'setText',
          target: {marker: 'independent'},
          value: 'Independent applied',
        },
      ],
      createdAt: '2026-09-22T00:00:00.000Z',
    };
    const json = () => new Response(JSON.stringify({manifest}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
    const Lykar = (window as unknown as {Lykar: new (options: any) => any}).Lykar;
    const sdk = new Lykar({
      projectKey: 'pk_replay_safety',
      mode: 'visitor',
      version: 1,
      pathname: '/replay-safety',
      root,
      waitForDom: false,
      targetRetryMs: 0,
      fetch: () => Promise.resolve(json()),
    });

    const first = await sdk.start();
    const firstState = {
      articles: document.querySelectorAll('article').length,
      destination: document.querySelector('aside')?.textContent,
      independent: document.querySelector('[data-lykar-id="independent"]')?.textContent,
      codes: first.runtime?.operations.map((operation: {code?: string}) => operation.code ?? 'APPLIED'),
    };

    const second = await sdk.start();
    const secondState = {
      articles: document.querySelectorAll('article').length,
      destination: document.querySelector('aside')?.textContent,
      applied: second.runtime?.applied,
    };

    document.querySelector('[data-lykar-id="independent"]')!.textContent = 'Host update';
    await sdk.destroy();

    return {
      firstState,
      secondState,
      afterDestroy: {
        articles: document.querySelectorAll('article').length,
        destination: document.querySelector('aside')?.textContent,
        independent: document.querySelector('[data-lykar-id="independent"]')?.textContent,
        rootConnected: root.isConnected,
      },
    };
  });

  expect(outcome).toEqual({
    firstState: {
      articles: 1,
      destination: 'Edited text',
      independent: 'Independent applied',
      codes: ['APPLIED', 'APPLIED', 'APPLIED', 'TARGET_NOT_FOUND', 'DEPENDENCY_UNAVAILABLE', 'APPLIED'],
    },
    secondState: {
      articles: 1,
      destination: 'Edited text',
      applied: 4,
    },
    afterDestroy: {
      articles: 0,
      destination: '',
      independent: 'Host update',
      rootConnected: true,
    },
  });
});
