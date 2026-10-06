# Lykar Admin

Preact single-page admin served by the Fastify API at `/admin/` on the same
origin. The current MVP includes email login, projects, independent pages,
draft creation, editor launch, immutable release creation, weighted A/B
experiment lifecycle/links/reports, winner recording, and share create/revoke.

```sh
npm run build --workspace @lykar/admin
npm run dev:api
```

Use `npm run dev:admin` in a second terminal while changing the UI; the API
serves the rebuilt files from `apps/admin/dist`.

The version workspace separates Drafts, immutable Releases and live deployment.
Owners/Admins can deploy, disable or roll back with a reason and view activation
history. Revision conflicts retain the selected Release/reason; an unconfirmed
network response can retry the original idempotency key. The panel rereads live
state after commands instead of displaying a historical retry response as current.

“Проверить на сайте” opens a private preview and requests a bounded report from
that exact popup. Missing reports remain “Не проверено”; known errors/missing
targets block the checked version. “Исправить в новом черновике” opens a Draft
based on the selected Release and preserves any unrelated open Draft. Repair is
manual; save, publish a new Release, check it and explicitly deploy it.

### Подключение сайта — этап 08

Вкладка «Подключение» проверяет выбранную в разделе «Страницы» Page и выбранный
origin. Owner/Admin получает DNS TXT challenge, подтверждает и отзывает владение;
Editor может запускать диагностику. Localhost подтверждается отдельной кнопкой
только на разрешённом dev/test API. DNS-код после reload запрашивается заново.

Диагностика открывает страницу в popup, проверяет source/origin/nonce/page URL,
сохраняет результат. Окно сайта можно закрыть самостоятельно. Есть отмена и timeout; отсутствие ответа
не считается доказательством отсутствия SDK или отказа сайта. UI показывает дату
проверки и отдельно отмечает результат старше 15 минут. API/assets/readiness/CSP
не заменяют DNS-подтверждение. Пошаговый мастер описан ниже.

### Мастер подключения — этап 09

Новый сайт сразу открывает «Мастер подключения»: подтверждение адреса, персональная
установка, проверка выбранной страницы, первый черновик и preview. Выбранный шаг
сохраняется локально отдельно для аккаунта/проекта; Page и раздел сохраняются в URL.
Подтверждения и сохранённые правки остаются в базе. DNS challenge после reload
нужно запросить заново; переход по шагам не считается успешной проверкой.

Owner/Admin управляет origins и импортом sitemap; ручное добавление страницы
остаётся во вкладке «Страницы». Импорт требует явного выбора в preview и повторно
проверяет текущий allowlist на сервере. См. [конфигурацию установки](../../docs/installation-config.md).
В production без versioned выпуска инструкция недоступна; локально используются
собранные и проверенные по manifest файлы SDK.
