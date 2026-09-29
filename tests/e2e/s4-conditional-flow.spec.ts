import {writeFile} from 'node:fs/promises';
import {test, expect, required} from './fixtures.js';

for (const framework of ['react', 'vue']) for (const mode of ['csr', 'ssr']) {
  test(`${framework} ${mode}: capture state, save/reload, Release/share and host transitions`, async ({newContext}, testInfo) => {
    test.setTimeout(60_000);
    const api = required('LYKAR_E2E_API_BASE_URL');
    const owner = await newContext();
    const visitor = await newContext();
    expect((await owner.request.post(`${api}/api/auth/dev-login`, {data: {}})).ok()).toBe(true);
    const projects = (await (await owner.request.get(`${api}/api/admin/projects`)).json()).projects;
    const project = projects.find((item: {name: string}) => item.name === 'Northstar E2E');
    const pathname = `/__e2e__/s4-${framework}-${mode}-a-${testInfo.project.name}-${Date.now()}`;
    const pageResponse = await owner.request.post(`${api}/api/admin/projects/${project.id}/pages`, {
      data: {name: `S4 ${framework} ${mode}`, pathname},
    });
    expect(pageResponse.status()).toBe(201);
    const pageRecord = (await pageResponse.json()).page;
    const draft = (await (await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/drafts`, {data: {}})).json()).draft;
    const launch = await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/editor-launch`, {data: {draftId: draft.id}});
    expect(launch.ok()).toBe(true);
    const editor = await owner.newPage();
    const consoleErrors: string[] = [];
    editor.on('console', message => {if (message.type() === 'error') consoleErrors.push(message.text());});
    await editor.goto((await launch.json()).launchUrl);
    const panel = editor.locator('[data-lykar-editor-root="panel"]');
    await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
    await expect(editor.locator('#state-button')).toHaveText('Ожидаем');
    await expect.poll(() => editor.evaluate(() => {
      const roots = (window as unknown as Record<symbol, Map<Element, {phase: string}>>)[Symbol.for('@lykar/framework-roots/v1')];
      return roots?.get(document.getElementById('framework-root')!)?.phase;
    })).toBe('ready');
    await editor.locator('#state-input').fill('valid');
    await expect(editor.locator('#state-button')).toHaveText('Продолжить');
    await editor.locator('#state-button').click();
    await panel.locator('[data-field="text"]').fill('Далее');
    await expect(editor.locator('#state-button')).toHaveText('Далее');
    await panel.getByRole('searchbox', {name: 'Поиск свойства'}).fill('background-color');
    await panel.locator('[data-field="background-color"] input[aria-label="Background Color"]').fill('rgb(0, 0, 128)');
    await panel.locator('[data-field="background-color"] input[aria-label="Background Color"]').blur();
    await expect(editor.locator('#state-button')).toHaveCSS('background-color', 'rgb(0, 0, 128)');
    await expect(panel.locator('[data-field="background-color"] input[data-role="swatch"]')).toHaveValue('#000080');
    if (testInfo.project.name === 'chromium' && framework === 'react' && mode === 'csr') {
      await editor.screenshot({path: testInfo.outputPath('s4-editor-desktop.png')});
      await editor.setViewportSize({width: 390, height: 844});
      await expect(panel.locator('[data-action="apply"]')).toBeVisible();
      await editor.screenshot({path: testInfo.outputPath('s4-editor-mobile.png')});
    }
    await panel.locator('[data-action="apply"]').click();
    await expect(panel.locator('[data-field="status"]')).toContainText('revision: 1');
    const saved = await (await owner.request.get(`${api}/api/admin/drafts/${draft.id}`)).json();
    expect(saved.operations).toHaveLength(2);
    expect(saved.operations.every((op: {schemaVersion: number; condition: {text: string}}) => op.schemaVersion === 2 && op.condition.text === 'Продолжить')).toBe(true);
    expect(saved.operations[0].condition.id).toBe(saved.operations[1].condition.id);
    await editor.reload();
    await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
    await expect(editor.locator('#state-button')).toHaveText('Ожидаем');
    await editor.locator('#state-input').fill('valid again');
    await expect(editor.locator('#state-button')).toHaveText('Далее');
    await expect(editor.locator('#state-button')).toHaveCSS('background-color', 'rgb(0, 0, 128)');

    const published = await owner.request.post(`${api}/api/admin/drafts/${draft.id}/publish`, {data: {expectedRevision: 1}});
    expect(published.ok()).toBe(true);
    const release = (await published.json()).release;
    const share = await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/shares`, {data: {releaseId: release.id}});
    expect(share.ok()).toBe(true);
    const shared = await visitor.newPage();
    shared.on('console', message => {if (message.type() === 'error') consoleErrors.push(message.text());});
    await shared.goto((await share.json()).url);
    const button = shared.locator('#state-button');
    const input = shared.locator('#state-input');
    await expect(button).toHaveText('Ожидаем');
    await expect(shared.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
    await expect.poll(() => shared.evaluate(() => (window as unknown as {__LYKAR_SDK_RESULT__?: {mode: string}}).__LYKAR_SDK_RESULT__?.mode)).toBe('share');
    await shared.evaluate(() => {
      const samples: Array<{text: string | null; color: string}> = [];
      const state = window as unknown as {__s4Frames: typeof samples; __s4Frame: number; __s4Text: Node | null};
      state.__s4Frames = samples;
      state.__s4Text = document.getElementById('state-button')!.firstChild;
      const sample = () => {
        const element = document.getElementById('state-button')!;
        samples.push({text: element.textContent, color: getComputedStyle(element).backgroundColor});
        state.__s4Frame = requestAnimationFrame(sample);
      };
      state.__s4Frame = requestAnimationFrame(sample);
    });
    const states: unknown[] = [];
    for (let index = 0; index < 4; index++) {
      await input.fill(`value ${index}`);
      await expect(button).toHaveText('Далее');
      await expect(button).toHaveCSS('background-color', 'rgb(0, 0, 128)');
      const activeText = await button.evaluateHandle(element => element.firstChild);
      await button.click();
      await expect(shared.locator('#state-clicks')).toHaveText(String(index + 1));
      await shared.locator('#rerender').click();
      await expect(button).toHaveText('Далее');
      expect(await button.evaluate((element, node) => element.firstChild === node, activeText)).toBe(true);
      await activeText.dispose();
      states.push(await button.evaluate(element => ({text: element.textContent, color: getComputedStyle(element).backgroundColor, disabled: (element as HTMLButtonElement).disabled})));
      await input.fill('');
      await expect(button).toHaveText('Ожидаем');
      await expect(button).toBeDisabled();
      await expect(button).toHaveCSS('background-color', 'rgb(128, 128, 128)');
    }
    const frames = await shared.evaluate(() => {
      const state = window as unknown as {__s4Frames: Array<{text: string | null; color: string}>; __s4Frame: number; __s4Text: Node | null};
      cancelAnimationFrame(state.__s4Frame);
      return {samples: state.__s4Frames, sameTextNode: state.__s4Text === document.getElementById('state-button')!.firstChild};
    });
    // Vue replaces host text nodes on state transitions; unchanged renders preserve the active node.
    expect(frames.samples.length).toBeGreaterThan(0);
    expect(frames.samples.every(frame => frame.text === 'Ожидаем' && frame.color === 'rgb(128, 128, 128)'
      || frame.text === 'Далее' && frame.color === 'rgb(0, 0, 128)')).toBe(true);
    await testInfo.attach('prepaint-frames', {body: JSON.stringify(frames), contentType: 'application/json'});
    await input.fill('remount');
    await shared.locator('#premium-toggle').click();
    await expect(button).toHaveCSS('background-color', 'rgb(0, 0, 128)');
    await input.fill('');
    await expect(button).toHaveCSS('background-color', 'rgb(0, 128, 0)');
    await input.fill('remount');
    await shared.locator('#remount-button').click();
    await expect(button).toHaveText('Далее');
    await expect(button).toHaveCSS('background-color', 'rgb(0, 0, 128)');
    for (let cycle = 0; cycle < 10; cycle++) {
      await shared.locator('#remount-button').click();
      await expect(button).toHaveText('Далее');
    }
    expect(await shared.evaluate(() => Array.from(document.querySelectorAll('style')).filter(sheet =>
      Array.from(sheet.sheet?.cssRules ?? []).some(rule => rule.cssText.includes('data-lykar-overlay-'))).length)).toBe(1);
    if (testInfo.project.name === 'chromium' && framework === 'react' && mode === 'csr') {
      await shared.screenshot({path: testInfo.outputPath('s4-desktop.png')});
      await shared.setViewportSize({width: 390, height: 844});
      await expect(button).toBeInViewport();
      await shared.screenshot({path: testInfo.outputPath('s4-mobile.png')});
    }
    await shared.evaluate(() => {
      const duplicate = document.createElement('button');
      duplicate.id = 'state-button'; duplicate.type = 'button'; duplicate.textContent = 'Продолжить';
      duplicate.style.backgroundColor = 'pink'; duplicate.dataset.s4Duplicate = 'true';
      document.body.append(duplicate);
    });
    await expect(button).toHaveCount(2);
    await expect(button.first()).toHaveText('Продолжить');
    await expect(button.last()).toHaveCSS('background-color', 'rgb(255, 192, 203)');
    await expect.poll(() => shared.evaluate(() => (window as unknown as {__LYKAR_SDK__: {conditionalState: {groups: Array<{status: string}>}}}).__LYKAR_SDK__.conditionalState.groups[0]?.status)).toBe('missing');
    await shared.locator('[data-s4-duplicate]').evaluate(element => element.remove());
    await expect(button).toHaveText('Далее');
    const resources = await shared.evaluate(() => (window as unknown as {__LYKAR_SDK__: {conditionalState: {stats: {groups: number; active: number; suspended: boolean}}}}).__LYKAR_SDK__.conditionalState);
    expect(resources.stats).toMatchObject({groups: 1, active: 1, suspended: false});
    await writeFile(testInfo.outputPath('s4-evidence.json'), JSON.stringify({framework, mode, engine: testInfo.project.name, states, frames, resources}, null, 2));
    await shared.locator('#go-b').click();
    await expect(shared.locator('#page-title')).toHaveText('Beta page');
    await expect(button).toHaveText('Продолжить');
    await expect(button).toHaveCSS('background-color', 'rgb(0, 128, 0)');
    await shared.locator('#back').click();
    await expect(shared.locator('#page-title')).toHaveText('Alpha page');
    await expect(button).toHaveText('Далее');
    await expect(button).toHaveCSS('background-color', 'rgb(0, 0, 128)');
    await shared.locator('#nested-action').click();
    await expect(shared.locator('#nested-count')).toHaveText('1');
    await shared.evaluate(() => {for (let index = 0; index < 1200; index++) document.body.setAttribute('data-s4-burst', String(index));});
    await expect(button).toHaveText('Продолжить');
    await expect(button).toHaveCSS('background-color', 'rgb(0, 128, 0)');
    await expect.poll(() => shared.evaluate(() => (window as unknown as {__LYKAR_SDK__: {conditionalState: {stats: {suspended: boolean}}}}).__LYKAR_SDK__.conditionalState.stats?.suspended)).toBe(true);
    await shared.evaluate(async () => {
      await (window as unknown as {__LYKAR_SDK__: {destroy: () => Promise<void>}}).__LYKAR_SDK__.destroy();
    });
    await expect(button).toHaveText('Продолжить');
    await expect(button).toHaveCSS('background-color', 'rgb(0, 128, 0)');
    expect(await shared.evaluate(() => Array.from(document.querySelectorAll('*')).some(element =>
      element.getAttributeNames().some(name => name.startsWith('data-lykar-overlay-'))))).toBe(false);
    await testInfo.attach('conditional-states', {body: JSON.stringify(states), contentType: 'application/json'});
    const experimentResponse = await owner.request.post(`${api}/api/admin/pages/${pageRecord.id}/experiments`, {data: {
      name: 'S4 rerender consent', variants: [{key: 'A', releaseId: release.id}, {key: 'B', releaseId: release.id}],
    }});
    expect(experimentResponse.status()).toBe(201);
    const experiment = (await experimentResponse.json()).experiment;
    expect((await owner.request.post(`${api}/api/admin/experiments/${experiment.id}/activate`, {data: {}})).ok()).toBe(true);
    const linkResponse = await owner.request.post(`${api}/api/admin/experiments/${experiment.id}/links`, {data: {}});
    expect(linkResponse.status()).toBe(201);
    const measured = await (await newContext()).newPage();
    await measured.goto((await linkResponse.json()).url);
    await measured.locator('#state-input').fill('analytics');
    await expect(measured.locator('#state-button')).toHaveText('Далее');
    const track = () => measured.evaluate(() => (window as unknown as {__LYKAR_SDK__: {track(name: string): Promise<unknown>}}).__LYKAR_SDK__.track('signup'));
    expect(await track()).toMatchObject({accepted: false, code: 'CONSENT_REQUIRED'});
    const report = async () => (await (await owner.request.get(`${api}/api/admin/experiments/${experiment.id}/analytics`)).json()).report;
    const totals = async () => (await report()).variants.reduce((sum: number, variant: {views: number}) => sum + variant.views, 0);
    expect(await totals()).toBe(0);
    await measured.evaluate(() => (window as unknown as {__LYKAR_SDK__: {consent(value: string): void}}).__LYKAR_SDK__.consent('granted'));
    await expect.poll(totals).toBe(1);
    for (let cycle = 0; cycle < 5; cycle++) {
      await measured.locator('#rerender').click();
      await measured.locator('#remount-button').click();
      await expect(measured.locator('#state-button')).toHaveText('Далее');
    }
    expect(await totals()).toBe(1);
    expect(await track()).toMatchObject({accepted: true});
    await expect.poll(async () => (await report()).variants.reduce((sum: number, variant: {conversions: number}) => sum + variant.conversions, 0)).toBe(1);
    await testInfo.attach('spa-analytics', {body: JSON.stringify(await report()), contentType: 'application/json'});
    expect(consoleErrors).toEqual([]);
  });
}
