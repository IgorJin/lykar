import {expect, test, required} from './fixtures';

test('PageSession cancels A→B late work, scopes roots, retries late nodes, and cleans up', async ({newContext}) => {
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(required('LYKAR_E2E_PLAYGROUND_BASE_URL'));

  const outcome = await page.evaluate(async () => {
    document.body.innerHTML = `
      <main id="page-a"><p data-lykar-id="copy">A native</p></main>
      <main id="page-b"><p data-lykar-id="copy">B native</p></main>
      <main id="late-root"></main>
    `;
    const rootA = document.querySelector('#page-a')!;
    const rootB = document.querySelector('#page-b')!;
    const lateRoot = document.querySelector('#late-root')!;
    const manifest = (pathname: string, value: string, releaseId: string, marker = 'copy') => ({
      schemaVersion: 1,
      projectId: 'project-lifecycle',
      pageId: `page-${pathname}`,
      pathname,
      releaseId,
      version: 1,
      manifestHash: 'c'.repeat(64),
      operations: [{
        schemaVersion: 1,
        id: `operation-${releaseId}`,
        kind: 'setText',
        target: {marker},
        value,
      }],
      createdAt: '2026-09-22T00:00:00.000Z',
    });
    const json = (value: unknown) => new Response(JSON.stringify(value), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });

    let resolveA!: (response: Response) => void;
    let pageBRequests = 0;
    const reports: string[] = [];
    const Lykar = (window as unknown as {Lykar: new (options: any) => any}).Lykar;
    const sdk = new Lykar({
      projectKey: 'pk_lifecycle',
      mode: 'visitor',
      version: 1,
      pathname: '/a',
      root: rootA,
      waitForDom: false,
      onReport: (report: {pageId: string}) => reports.push(report.pageId),
      fetch: (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), location.origin).searchParams.get('pathname');
        if (pathname === '/a') return new Promise<Response>(resolve => { resolveA = resolve; });
        pageBRequests += 1;
        return Promise.resolve(json({
          manifest: manifest('/b', pageBRequests === 1 ? 'B applied' : 'B restarted', `release-b-${pageBRequests}`),
        }));
      },
    });

    const pageA = sdk.start();
    while (!resolveA) await new Promise(resolve => setTimeout(resolve, 0));
    const pageB = await sdk.navigate({pathname: '/b', root: rootB});
    resolveA(json({manifest: manifest('/a', 'A late', 'release-a-late')}));
    const staleA = await pageA;

    await sdk.destroy();
    rootB.querySelector('p')!.textContent = 'B reset';
    const restarted = await sdk.start();
    await sdk.destroy();

    const lateSdk = new Lykar({
      projectKey: 'pk_late_node',
      mode: 'visitor',
      version: 1,
      pathname: '/late',
      root: lateRoot,
      waitForDom: false,
      targetRetryMs: 200,
      targetRetryIntervalMs: 10,
      fetch: () => Promise.resolve(json({
        manifest: manifest('/late', 'Late applied', 'release-late-node', 'late-copy'),
      })),
    });
    setTimeout(() => {
      lateRoot.innerHTML = '<p data-lykar-id="late-copy">Late native</p>';
    }, 20);
    const lateNode = await lateSdk.start();
    await lateSdk.destroy();

    return {
      pageA: rootA.textContent?.trim(),
      pageB: rootB.textContent?.trim(),
      late: lateRoot.textContent?.trim(),
      staleA,
      pageBMode: pageB.mode,
      restartedMode: restarted.mode,
      lateApplied: lateNode.runtime?.applied,
      reports,
      editorRoots: document.querySelectorAll('[data-lykar-editor-root]').length,
    };
  });

  expect(outcome).toMatchObject({
    pageA: 'A native',
    pageB: 'B restarted',
    late: 'Late applied',
    staleA: {mode: 'native', reason: 'PAGE_SESSION_STALE'},
    pageBMode: 'visitor',
    restartedMode: 'visitor',
    lateApplied: 1,
    reports: ['page-/b', 'page-/b'],
    editorRoots: 0,
  });
});
