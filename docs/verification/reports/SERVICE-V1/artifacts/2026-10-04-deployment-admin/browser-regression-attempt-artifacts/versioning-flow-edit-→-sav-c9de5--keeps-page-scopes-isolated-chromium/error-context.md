# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: versioning-flow.spec.ts >> edit → save → reload → reopen → release → share keeps page scopes isolated
- Location: tests/e2e/versioning-flow.spec.ts:6:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('1 команд')
Expected: visible
Error: strict mode violation: getByText('1 команд') resolved to 2 elements:
    1) <option value="614016b9-dd50-4a5a-b9c3-5ee75523750f">…</option> aka getByLabel('Версия для публикации')
    2) <span class="muted">1 команд</span> aka getByText('1 команд', { exact: true })

Call log:
  - Expect "toBeVisible" getByText('1 команд') with timeout 7000ms
  - waiting for getByText('1 команд')

```

# Page snapshot

```yaml
- main [ref=f2e3]:
  - generic [ref=f2e4]:
    - heading "Lykar" [level=1] [ref=f2e5]
    - generic [ref=f2e6]: localhost
    - generic [ref=f2e7]: owner@lykar.local
    - button "Выйти" [ref=f2e8] [cursor=pointer]
  - generic [ref=f2e9]:
    - complementary [ref=f2e10]:
      - generic [ref=f2e11]:
        - heading "Новый сайт" [level=2] [ref=f2e12]
        - textbox "Название" [ref=f2e13]
        - textbox "http://localhost:4173" [ref=f2e14]
        - button "Создать" [ref=f2e15] [cursor=pointer]
      - heading "Сайты" [level=2] [ref=f2e16]
      - button "Northstar E2E http://127.0.0.1:53531" [ref=f2e18] [cursor=pointer]:
        - generic [ref=f2e19]: Northstar E2E
        - generic [ref=f2e20]: http://127.0.0.1:53531
    - generic [ref=f2e21]:
      - generic [ref=f2e22]:
        - generic [ref=f2e23]:
          - heading "Northstar E2E" [level=2] [ref=f2e24]
          - generic [ref=f2e25]: pk_playground_local
        - generic [ref=f2e26]: Owner
      - generic [ref=f2e27]:
        - button "Страницы" [ref=f2e28] [cursor=pointer]
        - button "Участники" [ref=f2e29] [cursor=pointer]
      - generic [ref=f2e30]:
        - textbox "Новая страница" [ref=f2e31]
        - textbox "/pricing" [ref=f2e32]
        - button "Добавить" [ref=f2e33] [cursor=pointer]
      - heading "Страницы" [level=3] [ref=f2e34]
      - generic [ref=f2e35]:
        - button "Home /" [ref=f2e36] [cursor=pointer]
        - button "S3 Home /__e2e__/s3-c9da745d-3ee2-4b33-89de-e6472c4bf094" [ref=f2e37] [cursor=pointer]
        - button "Deployment admin pricing /__e2e__/s3-pricing-admin-012d02fc-50ca-4e8c-a3a1-a5e4e493379e" [ref=f2e38] [cursor=pointer]
        - button "Deployment admin pricing /__e2e__/s3-pricing-admin-2b9c797b-abfa-4d82-aeab-9f19576650f1" [ref=f2e39] [cursor=pointer]
        - button "Deployment admin pricing /__e2e__/s3-pricing-admin-8ba69544-4041-463f-804c-21428d7e6e61" [ref=f2e40] [cursor=pointer]
        - button "Deployment admin pricing /__e2e__/s3-pricing-admin-e2966593-ada0-459c-a573-93606af8605f" [ref=f2e41] [cursor=pointer]
        - button "S3 Pricing /__e2e__/s3-pricing-c9da745d-3ee2-4b33-89de-e6472c4bf094" [ref=f2e42] [cursor=pointer]
        - button "Deployment repair pricing /__e2e__/s3-pricing-repair-82641cdf-7bb6-4411-8782-d3ed67136bd5" [ref=f2e43] [cursor=pointer]
        - button "S4 react csr /__e2e__/s4-react-csr-a-chromium-1791139703441" [ref=f2e44] [cursor=pointer]
        - button "Deployment browser /__e2e__/s4-react-csr-a-deployment-chromium-1791139678990" [ref=f2e45] [cursor=pointer]
        - button "S4 react ssr /__e2e__/s4-react-ssr-a-chromium-1791139706052" [ref=f2e46] [cursor=pointer]
        - button "Deployment browser /__e2e__/s4-react-ssr-a-deployment-chromium-1791139679498" [ref=f2e47] [cursor=pointer]
        - button "S4 vue csr /__e2e__/s4-vue-csr-a-chromium-1791139708357" [ref=f2e48] [cursor=pointer]
        - button "Deployment browser /__e2e__/s4-vue-csr-a-deployment-chromium-1791139679941" [ref=f2e49] [cursor=pointer]
        - button "S4 vue ssr /__e2e__/s4-vue-ssr-a-chromium-1791139710601" [ref=f2e50] [cursor=pointer]
        - button "Deployment browser /__e2e__/s4-vue-ssr-a-deployment-chromium-1791139680474" [ref=f2e51] [cursor=pointer]
        - button "Pricing /pricing" [ref=f2e52] [cursor=pointer]
      - generic [ref=f2e53]:
        - generic [ref=f2e54]:
          - button "Версии" [ref=f2e55] [cursor=pointer]
          - button "Experiments" [ref=f2e56] [cursor=pointer]
        - region [ref=f2e57]:
          - generic [ref=f2e58]:
            - heading "На действующем сайте" [level=3] [ref=f2e59]
            - button "Обновить состояние" [ref=f2e60] [cursor=pointer]
          - strong [ref=f2e62]: "Правки отключены: исходная страница"
          - paragraph [ref=f2e63]: Зафиксированная версия хранит правки. На сайт они попадут только после включения и при установленном SDK в режиме публикаций. Уже открытые вкладки обновят правки при переходе, обновлении страницы или SDK.
          - generic [ref=f2e64]:
            - generic [ref=f2e65]:
              - text: Версия для проверки и включения
              - combobox "Версия для публикации" [ref=f2e66]:
                - option "Версия 1 · 1 команд" [selected]
            - generic [ref=f2e67]:
              - heading "Применимость правок" [level=4] [ref=f2e68]
              - paragraph [ref=f2e69]:
                - strong [ref=f2e70]: Не проверено.
                - text: Сохранён структурный снимок, но текущего отчёта нет.
              - paragraph [ref=f2e71]: Отчёт относится к одному окну предпросмотра. Он не обнаруживает изменения только в CSS и не гарантирует результат для всех посетителей. Пропущенные targets не переназначаются автоматически.
              - button "Проверить на сайте" [ref=f2e72] [cursor=pointer]
              - button "Исправить в новом черновике" [ref=f2e73] [cursor=pointer]
            - generic [ref=f2e74]:
              - text: Причина действия
              - textbox "Причина публикации" [ref=f2e75]:
                - /placeholder: "Например: уточнили заголовок тарифа"
            - generic [ref=f2e76]:
              - button "Включить версию" [disabled] [ref=f2e77]
              - button "Отключить правки" [disabled] [ref=f2e78]
              - button "Откатить на выбранную версию" [disabled] [ref=f2e79]
            - paragraph [ref=f2e80]: Откат доступен к версии, уже включавшейся раньше. Для старых версий загрузите предыдущие действия в истории.
            - paragraph [ref=f2e81]: Версия не проверена. Перед включением откройте предпросмотр; при включении без проверки результат может отличаться от ожидаемого.
          - group [ref=f2e82]:
            - generic "История публикаций" [ref=f2e83] [cursor=pointer]
        - generic [ref=f2e84]:
          - generic [ref=f2e85]:
            - heading "Черновик" [level=3] [ref=f2e86]
            - button "Создать черновик" [ref=f2e87] [cursor=pointer]
          - generic [ref=f2e88]:
            - heading "Ссылки на версии" [level=3] [ref=f2e89]
            - paragraph [ref=f2e90]: Активных ссылок пока нет.
          - generic [ref=f2e91]:
            - heading "Зафиксированные версии" [level=3] [ref=f2e92]
            - generic [ref=f2e93]:
              - generic [ref=f2e94]: Версия 1
              - generic [ref=f2e95]: 1 команд
              - generic [ref=f2e96]: структурный снимок сохранён
              - button "Ссылка на версию" [ref=f2e97] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, test, required } from './fixtures';
  2  | 
  3  | const EDITED_TEXT = 'Интерфейс сохранён через Lykar S0';
  4  | const ORIGINAL_TEXT = 'Редактируйте интерфейс, а не исходный код';
  5  | 
  6  | test('edit → save → reload → reopen → release → share keeps page scopes isolated', async ({ newContext }) => {
  7  |   const apiBaseUrl = required('LYKAR_E2E_API_BASE_URL');
  8  |   const playgroundBaseUrl = required('LYKAR_E2E_PLAYGROUND_BASE_URL');
  9  |   const owner = await newContext();
  10 |   const visitor = await newContext();
  11 |   const nativeVisitor = await newContext();
  12 |   const admin = await owner.newPage();
  13 |   await admin.goto(`${apiBaseUrl}/admin/`);
  14 |   await admin.getByRole('button', { name: 'Войти как локальный владелец' }).click();
  15 |   await admin.locator('.list-item').filter({ hasText: 'Northstar E2E' }).click();
  16 |   await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  17 | 
  18 |   const firstPopup = owner.waitForEvent('page');
  19 |   await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  20 |   const editor = await firstPopup;
  21 |   const panel = editor.locator('[data-lykar-editor-root="panel"]');
  22 |   await expect(panel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  23 |   await expect(panel.locator('[data-field="status"]')).toContainText('Изменения показываются локально');
  24 |   const hero = editor.locator('[data-lykar-id="hero-title"]');
  25 |   await hero.click();
  26 |   const textField = panel.locator('[data-field="text"]');
  27 |   await textField.fill(EDITED_TEXT);
  28 |   await expect(hero).toHaveText(EDITED_TEXT);
  29 |   await panel.locator('[data-action="apply"]').click();
  30 |   await expect(panel.locator('[data-field="status"]')).toContainText('Сохранено команд: 1, revision: 1');
  31 |   await expect(editor.locator('#draft-output')).toContainText('"revision": 1');
  32 | 
  33 |   await editor.reload();
  34 |   await expect(panel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  35 |   await expect(hero).toHaveText(EDITED_TEXT);
  36 |   await expect(panel.locator('[data-field="status"]')).toContainText('Восстановлено команд: 1');
  37 | 
  38 |   // A second unsaved edit must survive replay of the first saved operation.
  39 |   await hero.click();
  40 |   await textField.fill('Pending after saved draft');
  41 |   await expect(hero).toHaveText('Pending after saved draft');
  42 |   await editor.reload();
  43 |   await expect(hero).toHaveText('Pending after saved draft');
  44 |   await expect(panel.locator('[data-field="pending-count"]')).toHaveText('1');
  45 |   await panel.locator('[data-action="undo"]').click();
  46 |   await expect(hero).toHaveText(EDITED_TEXT);
  47 |   await expect(panel.locator('[data-action="apply"]')).toBeDisabled();
  48 | 
  49 |   await admin.reload();
  50 |   await admin.locator('.list-item').filter({ hasText: 'Northstar E2E' }).click();
  51 |   await expect(admin.getByRole('heading', { name: 'Northstar E2E' })).toBeVisible();
  52 |   const secondPopup = owner.waitForEvent('page');
  53 |   await admin.getByRole('button', { name: 'Открыть редактор' }).click();
  54 |   const reopened = await secondPopup;
  55 |   const reopenedPanel = reopened.locator('[data-lykar-editor-root="panel"]');
  56 |   await expect(reopenedPanel.getByRole('heading', { name: 'Lykar Editor' })).toBeVisible();
  57 |   await expect(reopened.locator('[data-lykar-id="hero-title"]')).toHaveText(EDITED_TEXT);
  58 |   await expect(reopenedPanel.locator('[data-field="status"]')).toContainText('Восстановлено команд: 1');
  59 |   await reopened.close();
  60 | 
  61 |   await admin.getByRole('button', { name: 'Зафиксировать версию' }).click();
  62 |   await expect(admin.getByText('Версия 1', { exact: true })).toBeVisible();
> 63 |   await expect(admin.getByText('1 команд')).toBeVisible();
     |                                             ^ Error: expect(locator).toBeVisible() failed
  64 | 
  65 |   let shareUrl = '';
  66 |   await admin.getByRole('button', { name: 'Ссылка на версию' }).click();
  67 |   const shareUrlField = admin.getByRole('textbox', { name: 'Share URL' });
  68 |   await expect(shareUrlField).toBeVisible();
  69 |   shareUrl = await shareUrlField.inputValue();
  70 |   await expect.poll(() => shareUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/share\//);
  71 | 
  72 |   const shared = await visitor.newPage();
  73 |   await shared.goto(shareUrl);
  74 |   await expect(shared.locator('[data-lykar-id="hero-title"]')).toHaveText(EDITED_TEXT);
  75 |   await expect(shared.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  76 |   await expect(shared.locator('body')).toHaveAttribute('data-lykar-mode', 'share');
  77 | 
  78 |   // Share in the previous editor tab must override its cached editor capability.
  79 |   await editor.goto(shareUrl);
  80 |   await expect(hero).toHaveText(EDITED_TEXT);
  81 |   await expect(panel).toHaveCount(0);
  82 |   await expect(editor.locator('body')).toHaveAttribute('data-lykar-mode', 'share');
  83 | 
  84 |   const nativeHome = await nativeVisitor.newPage();
  85 |   await nativeHome.goto(`${playgroundBaseUrl}/`);
  86 |   await expect(nativeHome.locator('[data-lykar-id="hero-title"]')).toHaveText(ORIGINAL_TEXT);
  87 |   await expect(nativeHome.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  88 |   const pricing = await nativeVisitor.newPage();
  89 |   await pricing.goto(`${playgroundBaseUrl}/pricing`);
  90 |   await expect(pricing.locator('[data-lykar-id="pricing-title"]')).toHaveText('Простой тариф для первого релиза');
  91 |   await expect(pricing.locator('[data-lykar-editor-root="panel"]')).toHaveCount(0);
  92 | });
  93 | 
```