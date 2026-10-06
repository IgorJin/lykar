# SERVICE-V1-07: локальная реализация без API-ключей

`run-check.py` записывает фактическую команду, exit code, длительность и очищенный
лог. Для повторения запускать из repo root, например:

```
python3 docs/verification/reports/SERVICE-V1/artifacts/2026-10-05-email/run-check.py api-postgres npm run test:e2e:http
python3 docs/verification/reports/SERVICE-V1/artifacts/2026-10-05-email/run-check.py browser npx playwright test tests/e2e/auth-and-editor.spec.ts --reporter=line,json
python3 docs/verification/reports/SERVICE-V1/artifacts/2026-10-05-email/run-check.py typecheck npm run typecheck
```

Запускать последовательно: workspace typecheck также строит зависимости и не
должен пересекаться со сборкой browser stack. PostgreSQL/HTTP/browser работают
на временном локальном стенде; реальные письма и внешние API не вызываются.
Capture-файлы с токенами не сохраняются в evidence.

История исправлений: unit проверка сначала выявила порядок production guard и две
ошибки в тестовых ожиданиях; исправлены. Первый PostgreSQL прогон выявил ограничение
PostgreSQL regex quantifier (256); заменено на length-check + character regex.
Повторный полный прогон прошёл. Первый browser запуск пересёкся с typecheck build
и упал до старта браузеров из-за очистки dist; лог сохранён как browser-initial-build.log.
Финальная browser проверка запускается отдельно, без retries/flaky masking.

Субагенты подготовили adapters и store. Независимый review отдельным агентом не
завершился из-за лимита его запуска; review и интеграционные проверки выполнены
основным агентом. Реальная доставка, настройки sender domain/tracking, тарифные
квоты и staging остаются непроверенными по текущему поручению владельца.

Второй browser прогон: 15/21 passed, 6 signup повторных входов получили корректный
429 после быстрого reload в пределах 1s тестовой паузы. Тест теперь явно проверяет
короткий Retry-After и ждёт разрешённую повторную кнопку; лимитер не отключён.
Также countdown вычисляется сразу при render, чтобы кнопка не мигала активной
до запуска эффекта таймера. Лог: browser-cooldown-regression.log.

Финальный browser run: 21/21 PASS, без retries/skipped/flaky; API/PostgreSQL 63/63 PASS и HTTP smoke PASS. Скриншот countdown визуально проверен, ширина 390 px.
