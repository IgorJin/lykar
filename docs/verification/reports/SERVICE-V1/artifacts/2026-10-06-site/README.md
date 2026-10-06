# SERVICE-V1-08 · 2026-10-06

Локальная реализация DNS TXT ownership + connection health. Реальные ключи email,
изменения DNS, сторонние сервисы и HTTPS staging не использовались.

Команды, exit codes и timestamps записаны run-check.py в JSON/log рядом. Запускать
последовательно из repo root: npm run test:e2e:http; npm test --workspace @lykar/sdk;
npx playwright test tests/e2e/site-connection.spec.ts tests/e2e/auth-and-editor.spec.ts --reporter=line,json;
npm run typecheck. Wrapper удаляет token/code query values и share credentials.
Capture-файлы, секретные URL и реальные DNS challenge values в evidence не копируются.

API/PostgreSQL: 73/73 PASS + HTTP smoke. Сюда входят DNS fake/deadline/host validation
и real PostgreSQL proof/nonce/expiry/revocation/races/permissions/deploy tests.
SDK: 109/109 PASS, включая 25 probe cases. Browser: 63/63 PASS, без skipped/retries/flaky:
42 connection cases (14 в каждом движке) и 21 auth/editor regression. Static, React/Vue
CSR + ordinary hydration, runtime/editor asset failures, wrong key, API connect CSP,
script/style CSP, unsupported mode и missing SDK inconclusive. Desktop/mobile screenshots
просмотрены; mobile width 390px без горизонтального переполнения.

История: первый browser прогон выявил ошибку относительного base URL runtime resolver;
исправлено через new URL(editorAssetUrl, document.location.href). Сохранён
browser-relative-assets.log. Второй прогон проверил framework responses успешно,
но в тестовом ожидании healthy state только static был помечен checked; расширено
на все OK responses. Сохранён browser-framework-expectation.log. Финальный прогон
полностью прошёл. Typecheck затем исправил форму необязательного assertion message
в тесте, не меняя сценарий/ожидание. Финальный source manifest отражает эту правку.

Субагенты реализовали DNS helper/tests и SDK probe/tests; подготовили integration
suite. Их дальнейшие запуски остановились по лимиту, итоговая интеграция/review,
browser fixtures/tests и проверки выполнены основным агентом. Независимого финального
review отдельным агентом не было.

Ограничения: нет live DNS/staging evidence. No-signal не различает missing SDK,
blocked bootstrap, старую версию, wrong API origin и закрытую/недоступную страницу.
Browser self-report не является ownership proof; freshness не обещает online.
Editor assets проверяются без запуска редактора и без применения изменений.

Final workspace typecheck PASS. It also added an optional state access for TypeScript null narrowing in the rendered local-verification button; this preserves the existing selected-origin guard and behavior. Final diff check PASS.
