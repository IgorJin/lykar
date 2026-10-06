# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: persistence-recovery.spec.ts >> undo of a saved change appends a revision and survives save/reload
- Location: tests/e2e/persistence-recovery.spec.ts:109:5

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('[data-lykar-id="pricing-title"]')
Expected: "Простой тариф для первого релиза"
Received: "Second module"
Timeout:  7000ms

Call log:
  - Expect "toHaveText" locator('[data-lykar-id="pricing-title"]') with timeout 7000ms
  - waiting for locator('[data-lykar-id="pricing-title"]')
    18 × locator resolved to <h1 data-lykar-id="pricing-title">Second module</h1>
       - unexpected value "Second module"

```

```yaml
- heading "Second module" [level=1]
```

# Test source

```ts
  22  | 
  23  | async function secondLaunch(context: BrowserContext, draftId: string): Promise<string> {
  24  |   const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  25  |   const projects = await context.request.get(`${apiBaseUrl}/api/admin/projects`);
  26  |   const project = (await projects.json()).projects.find((item: {name: string}) => item.name === 'Northstar E2E');
  27  |   const pages = await context.request.get(`${apiBaseUrl}/api/admin/projects/${project.id}/pages`);
  28  |   const page = (await pages.json()).pages.find((item: {pathname: string}) => item.pathname === '/pricing');
  29  |   const launch = await context.request.post(`${apiBaseUrl}/api/admin/pages/${page.id}/editor-launch`, {data: {draftId}});
  30  |   return (await launch.json()).launchUrl;
  31  | }
  32  | 
  33  | async function editTitle(page: Page, value: string): Promise<void> {
  34  |   const panel = page.locator('[data-lykar-editor-root="panel"]');
  35  |   const hero = page.locator('[data-lykar-id="pricing-title"]');
  36  |   await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  37  |   await hero.click();
  38  |   await panel.locator('[data-field="text"]').fill(value);
  39  |   await expect(hero).toHaveText(value);
  40  | }
  41  | 
  42  | test('two tabs expose revision conflict and preserve pending edits through reload', async ({newContext}) => {
  43  |   const context = await newContext();
  44  |   const firstLaunch = await createDraftLaunch(context);
  45  |   const otherLaunchUrl = await secondLaunch(context, firstLaunch.draftId);
  46  |   const first = await context.newPage();
  47  |   const second = await context.newPage();
  48  |   await Promise.all([first.goto(firstLaunch.launchUrl), second.goto(otherLaunchUrl)]);
  49  | 
  50  |   await editTitle(first, 'Saved by tab one');
  51  |   await editTitle(second, 'Pending in tab two');
  52  |   const firstPanel = first.locator('[data-lykar-editor-root="panel"]');
  53  |   const secondPanel = second.locator('[data-lykar-editor-root="panel"]');
  54  |   await firstPanel.locator('[data-action="apply"]').click();
  55  |   await expect(firstPanel.locator('[data-field="status"]')).toContainText('revision: 1');
  56  | 
  57  |   await secondPanel.locator('[data-action="apply"]').click();
  58  |   await expect(secondPanel.locator('[data-view="save-conflict"]')).toBeVisible();
  59  |   await expect(secondPanel.locator('[data-field="pending-count"]')).toHaveText('1');
  60  |   await expect(second.locator('[data-lykar-id="pricing-title"]')).toHaveText('Pending in tab two');
  61  | 
  62  |   await second.reload();
  63  |   await expect(second.locator('[data-lykar-id="pricing-title"]')).toHaveText('Pending in tab two');
  64  |   await expect(secondPanel.locator('[data-view="save-conflict"]')).toBeVisible();
  65  |   await expect(secondPanel.locator('[data-field="pending-count"]')).toHaveText('1');
  66  | 
  67  |   await secondPanel.locator('[data-action="resolve-conflict"]').click();
  68  |   await expect(secondPanel.locator('[data-view="save-conflict"]')).toBeHidden();
  69  |   await secondPanel.locator('[data-action="apply"]').click();
  70  |   await expect(secondPanel.locator('[data-field="status"]')).toContainText('revision: 2');
  71  | 
  72  |   const persisted = await context.request.get(
  73  |     `${required('LYKAR_E2E_API_BASE_URL')}/api/admin/drafts/${firstLaunch.draftId}`,
  74  |   );
  75  |   const details = await persisted.json();
  76  |   expect(details.draft.revision).toBe(2);
  77  |   expect(details.operations).toHaveLength(2);
  78  | });
  79  | 
  80  | test('lost response after commit reconciles on reload without duplicate operations', async ({newContext}) => {
  81  |   const context = await newContext();
  82  |   const launch = await createDraftLaunch(context);
  83  |   const editor = await context.newPage();
  84  |   let dropped = false;
  85  |   await editor.route(`**/api/editor/drafts/${launch.draftId}/operations`, async route => {
  86  |     if (dropped) return route.continue();
  87  |     dropped = true;
  88  |     await route.fetch();
  89  |     await route.abort('aborted');
  90  |   });
  91  |   await editor.goto(launch.launchUrl);
  92  |   await editTitle(editor, 'Committed with a lost response');
  93  |   const panel = editor.locator('[data-lykar-editor-root="panel"]');
  94  |   await panel.locator('[data-action="apply"]').click();
  95  |   await expect(panel.locator('[data-field="status"]')).toContainText('безопасного повтора');
  96  | 
  97  |   await editor.reload();
  98  |   await expect(editor.locator('[data-lykar-id="pricing-title"]')).toHaveText('Committed with a lost response');
  99  |   await expect(panel.locator('[data-action="apply"]')).toBeDisabled();
  100 | 
  101 |   const persisted = await context.request.get(
  102 |     `${required('LYKAR_E2E_API_BASE_URL')}/api/admin/drafts/${launch.draftId}`,
  103 |   );
  104 |   const details = await persisted.json();
  105 |   expect(details.draft.revision).toBe(1);
  106 |   expect(details.operations).toHaveLength(1);
  107 | });
  108 | 
  109 | test('undo of a saved change appends a revision and survives save/reload', async ({newContext}) => {
  110 |   const context = await newContext();
  111 |   const launch = await createDraftLaunch(context);
  112 |   const editor = await context.newPage();
  113 |   await editor.goto(launch.launchUrl);
  114 |   const panel = editor.locator('[data-lykar-editor-root="panel"]');
  115 |   const hero = editor.locator('[data-lykar-id="pricing-title"]');
  116 |   const original = 'Простой тариф для первого релиза';
  117 | 
  118 |   await editTitle(editor, 'Saved before undo');
  119 |   await panel.locator('[data-action="apply"]').click();
  120 |   await expect(panel.locator('[data-field="status"]')).toContainText('revision: 1');
  121 |   await panel.locator('[data-action="undo"]').click();
> 122 |   await expect(hero).toHaveText(original);
      |                      ^ Error: expect(locator).toHaveText(expected) failed
  123 |   await expect(panel.locator('[data-field="pending-count"]')).toHaveText('1');
  124 |   await panel.locator('[data-action="apply"]').click();
  125 |   await expect(panel.locator('[data-field="status"]')).toContainText('revision: 2');
  126 | 
  127 |   await editor.reload();
  128 |   await expect(hero).toHaveText(original);
  129 |   const persisted = await context.request.get(
  130 |     `${required('LYKAR_E2E_API_BASE_URL')}/api/admin/drafts/${launch.draftId}`,
  131 |   );
  132 |   const details = await persisted.json();
  133 |   expect(details.operations).toHaveLength(2);
  134 |   expect(details.operations[1]).toMatchObject({
  135 |     kind: 'setText',
  136 |     value: original,
  137 |     revision: {previousOperationId: details.operations[0].id, reason: 'undo'},
  138 |   });
  139 | });
  140 | 
  141 | test('manual target repair previews the dependent chain and survives save/reload', async ({newContext}) => {
  142 |   const context = await newContext();
  143 |   const launch = await createDraftLaunch(context);
  144 |   const editor = await context.newPage();
  145 |   await editor.goto(launch.launchUrl);
  146 |   const panel = editor.locator('[data-lykar-editor-root="panel"]');
  147 |   await expect(panel.getByRole('heading', {name: 'Lykar Editor'})).toBeVisible();
  148 | 
  149 |   await editor.evaluate(async () => {
  150 |     const session = (window as unknown as {__LYKAR_EDITOR__: {session: {apply: (batch: unknown) => Promise<unknown>}}}).__LYKAR_EDITOR__.session;
  151 |     await session.apply({operations: [
  152 |       {
  153 |         schemaVersion: 1, id: 'browser-missing-insert', kind: 'insertNode', target: {marker: 'removed-slot'},
  154 |         position: 'append', node: {type: 'element', tag: 'p', children: [{type: 'text', value: 'Browser repaired'}]},
  155 |       },
  156 |       {
  157 |         schemaVersion: 1, id: 'browser-dependent-style', kind: 'setStyle',
  158 |         target: {nodeRef: {operationId: 'browser-missing-insert'}}, dependsOn: ['browser-missing-insert'],
  159 |         property: 'color', value: 'rgb(128, 0, 128)',
  160 |       },
  161 |     ]});
  162 |   });
  163 |   await panel.getByRole('tab', {name: 'История изменений'}).click();
  164 |   const failed = panel.locator('[data-operation-id="browser-missing-insert"]');
  165 |   await expect(failed).toContainText('TARGET_NOT_FOUND');
  166 |   await failed.getByRole('button', {name: /Исправить target/}).click();
  167 |   await editor.locator('#plans').click();
  168 |   const repaired = editor.locator('#plans p').filter({hasText: 'Browser repaired'});
  169 |   await expect(repaired).toBeVisible();
  170 |   await expect(repaired).toHaveCSS('color', 'rgb(128, 0, 128)');
  171 |   await expect(panel.locator('[data-field="pending-count"]')).toHaveText('4');
  172 |   await panel.locator('[data-action="apply"]').click();
  173 |   await expect(panel.locator('[data-field="status"]')).toContainText('revision: 1');
  174 | 
  175 |   await editor.reload();
  176 |   await expect(editor.locator('#plans p').filter({hasText: 'Browser repaired'})).toHaveCSS('color', 'rgb(128, 0, 128)');
  177 | });
  178 | 
```