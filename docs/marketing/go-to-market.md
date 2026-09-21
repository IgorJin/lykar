# Lykar: исследование рынка и go-to-market

Статус: рабочая продуктово-маркетинговая гипотеза  
Дата: 7 сентября 2026  
Аудитория: основатель, продуктовая команда, инженеры и агенты

## 1. Краткий вывод

Lykar не следует выводить на рынок как «ещё один сервис A/B-тестирования» и не стоит буквально называть «DevTools для непрофессионалов».

Более сильная стартовая категория:

> **Визуальный слой изменений для существующих сайтов.** Измените страницу прямо на сайте, сохраните результат как отдельную версию, отправьте её по ссылке и затем безопасно опубликуйте или протестируйте — без выпуска нового кода.

Аналогия с DevTools хорошо объясняет механику внутри команды, но в публичной коммуникации создаёт два нежелательных ощущения: инструмент выглядит техническим, а правки — временными и ненадёжными. Пользователю важнее результат: «я могу самостоятельно изменить страницу, показать её другому человеку и не сломать исходный сайт».

Лучший первоначальный сегмент — не отдельный владелец одного сайта, а фрилансер или небольшое агентство, которое обслуживает несколько сайтов. У него одна и та же проблема повторяется регулярно, есть возможность один раз установить script, выше готовность платить, а ссылки на согласование создают естественный канал распространения Lykar среди клиентов.

A/B-тесты должны быть важной возможностью, но не главным обещанием MVP. Даже материалы Optimizely рекомендуют выбирать страницу примерно с 1 000 посетителей в неделю, чтобы получить результат теста за разумное время. У многих небольших сайтов такого трафика нет. Им всё равно полезны визуальное редактирование, согласование, версии, публикация и откат. Источник: [Optimizely — Run your first A/B test](https://certification.optimizely.com/docs/tutorials/experimentation/run-your-first-ab-test/).

Главное продуктовое преимущество Lykar должно строиться не вокруг самого visual editor — он уже стал стандартной функцией конкурентов, — а вокруг связки:

1. детерминированные и безопасные команды изменения DOM;
2. неизменяемые версии страницы;
3. исполняемый preview по ссылке;
4. отчёт о DOM drift и восстановление сломанных targets;
5. публикация и мгновенный откат;
6. предложения AI-агента с обязательным подтверждением человеком.

## 2. Какую работу покупает пользователь

Пользователь покупает не «редактор HTML». Он нанимает Lykar для одной или нескольких работ:

- быстро исправить текст, CTA, ссылку, изображение или оформление без очереди разработчиков;
- показать клиенту или руководителю не макет, а работающую версию реальной страницы;
- сохранить несколько независимых вариантов одной страницы;
- безопасно согласовать и опубликовать изменение с возможностью отката;
- проверить вариант на отдельном трафике и измерить результат;
- в будущем — дать AI-агенту интерфейс для предложения изменений, не выдавая ему доступ к исходному коду и публикации.

Поэтому базовый сценарий продукта должен звучать так:

> Установить script один раз → открыть сайт из Lykar → изменить страницу → сохранить draft → отправить preview → получить approval → опубликовать или запустить эксперимент → увидеть отчёт → при необходимости откатить.

Формулировка «без кода» должна быть честной: интеграция требует единовременной установки script или плагина. После подключения обычные изменения не требуют работы с исходным кодом.

## 3. Рынок и соседние категории

### 3.1. Enterprise experimentation

Optimizely, VWO, AB Tasty, Kameleoon и Webflow Optimize уже предлагают визуальное создание вариантов, таргетинг, цели, аналитику и AI-функции:

- [Optimizely Visual Editor](https://support.optimizely.com/hc/en-us/articles/39075952140941-New-Visual-Editor) использует overlay, поддерживает редактирование текста, изображений, CSS и HTML; новые релизы добавляют создание click events в редакторе, device emulation и SPA-механику. [Release notes](https://support.optimizely.com/hc/en-us/articles/23949705057421-2026-Optimizely-Web-Experimentation-release-notes).
- [AB Tasty](https://www.abtasty.com/web-experimentation/) продаёт no-code/low-code experiments, personalization и widgets; цена рассчитывается индивидуально по трафику, доменам и модулям. [Pricing](https://www.abtasty.com/pricing/).
- [VWO](https://vwo.com/testing/) объединяет visual editor, тесты и SmartCode; на тарифной странице отдельно продвигает rollout победивших вариантов без помощи разработчиков. [Pricing](https://vwo.com/pricing/).
- [Webflow Optimize](https://webflow.com/feature/optimize) работает и на внешних сайтах через JavaScript snippet, предлагает A/B-тесты, персонализацию и AI; публичный ориентир тарифа Optimize — от $299 в месяц. [Pricing](https://webflow.com/pricing).
- [Kameleoon](https://www.kameleoon.com/?language=en) активно позиционирует prompt-based создание экспериментов через browser extension.

Вывод: пытаться победить эти продукты шириной аналитики в начале невыгодно. Они ориентированы на experimentation/CRO-команды и трафик, а Lykar может занять более простой входной сценарий: исполняемые изменения и согласование на любом существующем сайте.

### 3.2. Visual feedback и client review

BugHerd, MarkUp.io и Pastel доказывают, что агентства платят за возможность открыть реальный сайт, оставить контекстный feedback и отправить клиенту ссылку:

- [BugHerd](https://bugherd.com/) соединяет point-and-click feedback с техническим контекстом, ссылками для гостей и project board; стартовый тариф — около $50 в месяц, а партнёрская программа предлагает 20% recurring commission. [Pricing](https://bugherd.com/pricing).
- [MarkUp.io](https://www.markup.io/pricing/) продаёт share links и contextual feedback от $79 в месяц.
- [Pastel](https://usepastel.com/plans) предлагает client approvals, responsive review и canvas для сайтов от $35 в месяц.

Эти сервисы сохраняют комментарии и задачи, но не превращают предложение в воспроизводимую цепочку DOM-команд. Это рыночное окно Lykar:

> **Не оставляйте комментарий «сделайте кнопку зелёной». Сделайте кнопку зелёной, отправьте результат и получите подтверждение.**

### 3.3. CMS и page builders

Владельцы WordPress, Webflow, Wix, Shopify, Tilda и других конструкторов уже имеют собственные редакторы. Поэтому «редактировать сайт визуально» само по себе недостаточно для дифференциации.

Преимущество Lykar в этой категории:

- единый интерфейс для сайтов на разных технологиях;
- отдельные версии без копирования страниц внутри CMS;
- preview-ссылка на фактическом сайте;
- approvals, эксперименты и откат поверх существующей платформы;
- не требуется выдавать клиенту или маркетологу доступ в CMS.

WordPress особенно важен как канал: по W3Techs он используется примерно на 40,7% всех сайтов и занимает около 58,9% рынка известных CMS. Источник: [W3Techs — WordPress usage](https://w3techs.com/technologies/comparison/cm-squarespace%2Ccm-wordpress).

## 4. Приоритетные сегменты

### Сегмент 1: фрилансеры и небольшие web-агентства

**Кто:** дизайнеры, no-code разработчики и агентства, обслуживающие 5–30 сайтов малого бизнеса.

**Боль:** правки приходят сообщениями и скриншотами, требуют доступа к разным CMS, зависят от разработчика, а согласование результата растягивается.

**Обещание:** «Внесите правку прямо на сайте и отправьте клиенту работающую версию одной ссылкой».

**Почему первый:** повторяемое использование на нескольких сайтах, понятная экономия времени, выше willingness to pay, возможность органического распространения через client preview.

### Сегмент 2: владелец или маркетолог небольшого сайта

**Кто:** основатель, маркетолог или контент-менеджер сайта на WordPress/Tilda/legacy stack без постоянного разработчика.

**Боль:** маленькая правка требует поиска исполнителя, доступа к незнакомой CMS или нового deployment.

**Обещание:** «Меняйте продающие страницы самостоятельно, сохраняя исходный сайт и возможность отката».

**Ограничение:** у части аудитории недостаточно трафика для статистически полезных A/B-тестов. Им нужно продавать быстрые исправления, версии, approvals и публикацию, а не обещание автоматического роста конверсии.

### Сегмент 3: небольшие CRO/marketing teams

**Кто:** команды с устойчивым трафиком, которым enterprise experimentation слишком дорог или сложен.

**Боль:** долгий запуск простых тестов и зависимость от engineering backlog.

**Обещание:** «От идеи до работающего варианта и измерения результата за один сеанс».

**Когда идти:** после появления надёжного runtime, целей, аналитики, anti-flicker и контроля sample size.

### Не брать в первый ICP

- крупные enterprise experimentation teams;
- критичный e-commerce checkout;
- сложные SPA, постоянно перестраивающие DOM;
- проекты, ожидающие полноценную замену CMS/page builder;
- сайты, которым нужны произвольные JavaScript-инъекции.

## 5. Позиционирование и сообщения

### 5.1. Рекомендуемая формула

**Категория:** visual website changes / визуальный слой изменений сайта.

**Главный заголовок:**

> Изменяйте сайт прямо на странице — без выпуска нового кода.

**Подзаголовок:**

> Сохраните изменение как отдельную версию, отправьте ссылку на согласование и затем опубликуйте или протестируйте его с возможностью мгновенного отката.

**CTA:**

> Изменить тестовую страницу

Это сильнее, чем «Попробовать бесплатно»: пользователь сразу должен испытать основной magic moment.

### 5.2. Сообщения для разных сегментов

Для агентства:

> Правки сайта, которые клиент может увидеть и утвердить по одной ссылке.

Для маркетолога:

> Запускайте изменения landing page, не дожидаясь очереди разработчиков.

Для владельца:

> Исправьте текст, кнопку или изображение сами. Исходный сайт останется доступен, а изменение можно откатить.

Для CRO-команды:

> Создайте вариант на реальной странице, закрепите версию и запустите измеримый эксперимент.

### 5.3. Три опоры бренда

1. **Самостоятельность:** простые изменения без engineering cycle.
2. **Наглядность:** адресат получает не screenshot или макет, а работающую версию.
3. **Безопасность:** draft, approval, immutable release, диагностика, публикация и rollback.

Не следует обещать «измените абсолютно любой сайт». Реалистичнее: «подключите сайт, которым вы управляете» — с явными ограничениями для SPA, CSP, динамического DOM и критичных транзакционных страниц.

## 6. Какие функции добавить

### P0: продукт, за который уже можно брать деньги

#### 1. Production deploy и rollback

Сейчас preview и эксперимент показывают потенциал, но постоянное применение утверждённой версии к обычному URL превращает Lykar из демонстратора в рабочий инструмент.

Нужно:

- явно назначать production release для отдельного pathname;
- staged activation и мгновенный rollback;
- сохранять исходную страницу как безопасный fail-open вариант;
- показывать, какая версия активна, кто и когда её активировал;
- не связывать завершение эксперимента с автоматической публикацией победителя.

#### 2. Безошибочная установка

- мастер установки script;
- проверка project token и allowed domain;
- диагностика CSP, загрузки runtime и конфликтов;
- WordPress installer/plugin как первый интеграционный пакет;
- health indicator «Lykar подключён»;
- тестовый preview до первой публикации.

#### 3. Надёжный visual editor

- text, link, image, color, background, spacing, size;
- set/remove attribute;
- hide/show, move, duplicate, add, delete;
- undo/redo;
- desktop/tablet/mobile preview;
- боковая панель вместо contenteditable;
- дерево Change с id, target, статусом применения и подсветкой элемента;
- горячие клавиши и поиск изменения.

#### 4. Drift report и repair flow

CSS/XPath-подобные selectors ломаются на динамических сайтах; это признаёт и документация Kameleoon. Источник: [Kameleoon — troubleshooting the graphic editor](https://help.kameleoon.com/experimentation/web-experimentation/graphic-based-experiments/troubleshooting-the-graphic-editor/).

Нужно:

- fingerprint исходной страницы и отчёт об отличиях;
- три состояния команды: applied, skipped, mutation error;
- `TARGET_NOT_FOUND` пропускать и объяснять, не ретаргетить молча;
- разрешить вручную выбрать новый target с preview;
- подсветить сломанные Change красным в дереве;
- блокировать публикацию при mutation errors и отдельно предупреждать о пропущенных targets;
- прогонять release в desktop/mobile viewport до активации.

#### 5. Before/after, share и approval

- переключатель Original / Version;
- visual diff;
- share token с expiry и revoke;
- гостевой режим без editor capability;
- Approve / Request changes;
- контекстный комментарий к Change;
- журнал решения.

#### 6. Performance, security и fail-open

Third-party JavaScript может влиять на производительность, приватность и безопасность, поэтому эти свойства должны быть не внутренней деталью, а частью продукта. Источник: [web.dev — loading third-party JavaScript](https://web.dev/articles/optimizing-content-efficiency-loading-third-party-javascript).

- небольшой async runtime и CDN cache;
- ранняя загрузка manifest и anti-flicker только там, где он нужен;
- жёсткий performance budget и измерение p75/p95 overhead;
- signed manifests и запрет произвольного JavaScript в command protocol;
- domain allowlist, short-lived editing capability, audit log;
- runtime timeout: при ошибке немедленно показать исходную страницу;
- self-hosted runtime для продвинутых клиентов в будущем.

### P1: product-market fit и агентский канал

#### 1. Agency workspace

- несколько сайтов;
- роли Owner/Admin/Editor/Viewer;
- guest approvals без платного места;
- client folders и reusable access;
- white-label share page на старшем тарифе;
- activity/audit log;
- перенос проекта другому владельцу.

Workspace — это контейнер агентства или команды над проектами. Один пользователь может владеть Workspace, пригласить сотрудников и клиентов и централизованно оплачивать лимиты. В MVP его можно не показывать как сложную организационную сущность, но model/data boundaries лучше заложить заранее, чтобы позже не мигрировать `user → site` в `workspace → members → sites`.

#### 2. Цели прямо из редактора

- «считать клики по этому элементу» одним действием;
- form submit, URL reached, custom event;
- primary и guardrail metrics;
- health check события до запуска;
- estimate длительности теста и предупреждение о недостаточном трафике;
- event diagnostics, чтобы отсутствие данных не выглядело как нулевая конверсия.

#### 3. Rules и лёгкая персонализация

- UTM source/campaign;
- referrer;
- device class;
- locale;
- дата/время;
- одна закреплённая версия на пользователя;
- preview rule до активации.

#### 4. Готовые блоки и recipes

- announcement bar;
- CTA/button;
- social proof;
- promo badge;
- hero variant;
- pricing emphasis;
- trust block;
- lead form copy.

Template должен сохраняться как набор безопасных команд, а не как непрозрачный JavaScript.

#### 5. Интеграции

- WordPress — первой;
- затем Tilda/Webflow/Shopify installers;
- GA4, PostHog и webhook export;
- Slack/Telegram/email уведомления о запросе approval и drift;
- Zapier/Make;
- browser extension для страниц, где приложение удаляет query parameters или требует авторизацию.

#### 6. Handoff в исходный сайт

Часть клиентов не захочет навсегда зависеть от runtime. Нужен экспорт утверждённой версии:

- читаемый список изменений;
- CSS/HTML patch там, где он корректен;
- инструкция или task для разработчика/CMS;
- отметка «перенесено в source», после которой Lykar release можно отключить.

Это снимает страх lock-in и помогает SEO-критичным изменениям стать постоянной частью исходного сайта.

### P2: дифференциация и расширение рынка

#### 1. AI Change Agent

Конкуренты уже создают варианты из prompts: [Optimizely Variation Development Agent](https://www.optimizely.com/agents/variation-development), [AB Tasty AI features](https://docs.abtasty.com/help-center/get-help-from-ai-driven-features-evi) и [Webflow Optimize custom prompts](https://webflow.com/updates/custom-prompts-optimize).

Поэтому сам prompt field не станет преимуществом. Lykar должен отличаться управляемостью:

> Цель → предложения агента → список безопасных Change → visual diff → человек принимает или отклоняет каждое изменение → новая immutable version.

Агент не получает право самостоятельно публиковать и не может добавлять JavaScript. Полезные следующие функции: brand voice, ограничения design tokens, объяснение гипотезы, автоматическая проверка contrast/overflow/links и генерация нескольких вариантов.

#### 2. SPA resilience

- повторное применение после route/render changes;
- устойчивые anchors и selector scoring;
- framework-aware lifecycle adapters;
- наблюдение за DOM без бесконечных mutation loops;
- route patterns после надёжной поддержки точных pathname.

#### 3. Experimentation engine

- sample-size planner;
- sequential/bayesian analysis после методологической проработки;
- guardrail metrics;
- сегментные отчёты без p-hacking по умолчанию;
- автоматическая проверка sample ratio mismatch;
- несколько целей и attribution window;
- для low-traffic страниц — прямые campaign links и qualitative approval вместо псевдостатистики.

#### 4. SEO-safe delivery

Google умеет рендерить JavaScript, но официально указывает на ограничения и по-прежнему рекомендует server-side или static rendering для надёжности. Источники: [Google Search — JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google Search — dynamic rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering).

Долгосрочный путь:

- edge rewriting или server-side adapter;
- CMS commit/publish adapters;
- canonical/noindex controls для preview и experiment tokens;
- crawler-safe metadata changes;
- проверка SEO-изменений перед публикацией.

### Что не делать сейчас

- не превращать Lykar в полноценный page builder или CMS;
- не разрешать произвольный JavaScript в основном protocol;
- не строить session replay и полный web-analytics suite;
- не начинать с multivariate testing и enterprise feature flags;
- не обещать автоматический рост конверсии без достаточных данных;
- не пытаться сразу одинаково поддержать все SPA и CMS;
- не делать автономную AI-публикацию.

## 7. Каналы продвижения

### 7.1. Product-led playground

Главная страница должна быть интерактивной. Посетитель выбирает элемент тестового сайта, меняет его и получает ссылку на версию до регистрации либо с регистрацией в последний момент.

Magic moment:

> «Я изменил настоящую страницу, открыл ссылку в инкогнито и увидел свою версию».

Не начинать onboarding с dashboard, создания project и чтения инструкции. Сначала показать ценность, затем объяснить установку на собственный сайт.

### 7.2. Concierge beta с агентствами

Первый набор:

- 20 интервью с фрилансерами и агентствами;
- 10 активных pilot partners;
- установка Lykar вместе с основателем;
- один реальный client approval и одна production change на каждого;
- интервью после первого и третьего использования.

Предложение beta:

> Мы бесплатно подключим один клиентский сайт и вместе проведём первую правку. В обмен — запись сессии, обратная связь и разрешение использовать обезличенный кейс.

### 7.3. WordPress distribution

Сделать небольшой официальный плагин, который:

- устанавливает script;
- принимает project token;
- проверяет соединение;
- не пытается заменить сам редактор Lykar;
- ведёт в visual editing session.

Плагин — канал доверия и установки, а не отдельная версия продукта.

### 7.4. Search/content

Контент строить вокруг конкретной работы, а не термина «DOM command platform»:

- как изменить текст на сайте без разработчика;
- как показать заказчику правки сайта по ссылке;
- как согласовать новую версию landing page;
- как A/B-тестировать pricing page без deployment;
- как безопасно дать маркетологу возможность менять сайт;
- WordPress visual changes without page access;
- Tilda/Webflow client approval workflow;
- DevTools changes disappear — how to save them safely.

Каждая статья должна вести в интерактивный playground или template, а не только в форму demo.

### 7.5. Template gallery

Публичные recipes создают long-tail SEO и сокращают time-to-value:

- «Добавить announcement bar»;
- «Изменить CTA для рекламного трафика»;
- «Создать вариант hero section»;
- «Скрыть блок на mobile»;
- «Подчеркнуть рекомендуемый тариф».

### 7.6. Referral и agency partner program

После подтверждения retention:

- 20% recurring commission на 12 месяцев или постоянная скидка партнёру;
- бесплатные guest clients;
- agency badge и listing;
- templates, которые партнёр может переиспользовать;
- revenue dashboard.

Модель подтверждается соседней категорией: BugHerd уже использует 20% recurring partner commission. Источник: [BugHerd partner program](https://bugherd.com/).

### 7.7. Launch communities

Product Hunt, Indie Hackers, Reddit, no-code и WordPress/Webflow communities подключать после того, как:

- пользователь достигает первой shareable version менее чем за 15 минут;
- установка диагностируется автоматически;
- есть минимум 3 убедительных кейса;
- runtime стабилен и fail-open;
- pricing и ограничения можно объяснить одной таблицей.

Paid search имеет смысл позже — после измерения activation и retention. Ранний платный трафик на необкатанный onboarding даст дорогие установки и мало знаний.

## 8. Встроенная петля роста

Основная product loop:

```text
Создать изменение
        ↓
Отправить branded preview клиенту/коллеге
        ↓
Получатель сравнивает Original / Version и подтверждает
        ↓
Получатель узнаёт, что версия сделана в Lykar
        ↓
Создаёт собственный проект или приглашает следующий сайт
```

На бесплатном и Solo тарифе share page может содержать ненавязчивое «Made with Lykar». На Agency white-label его можно убрать.

## 9. Тарифная гипотеза

Соседние feedback tools стоят примерно $35–119 в месяц, а experimentation products быстро уходят в сотни долларов или custom pricing: [Pastel](https://usepastel.com/plans), [MarkUp.io](https://www.markup.io/pricing/), [Webflow](https://webflow.com/pricing), [AB Tasty](https://www.abtasty.com/pricing/). Lykar стоит начать между этими категориями.

| Тариф | Цена-гипотеза | Для кого | Основное ограничение |
| --- | ---: | --- | --- |
| Free | $0 | знакомство | 1 сайт, drafts/share, watermark, без production deploy |
| Solo | $19/мес | владелец или фрилансер | 1 сайт, deploy/rollback, базовые approvals |
| Pro | $49/мес | маркетолог/CRO | 3 сайта, experiments, goals, analytics |
| Agency | $99/мес | небольшое агентство | 15 сайтов, guest approvals, roles, white-label |
| Growth | $249/мес | растущая команда | высокий трафик, rules, integrations, priority support |

Рекомендуемый pricing metric:

> **Активные сайты + фактические experiment/production exposures, а не весь трафик домена.**

Если на странице не применяется Lykar, её просмотр не должен расходовать лимит. Так цена соответствует создаваемой ценности и не наказывает клиента за установку script на весь сайт.

Дополнительные правила:

- редактирование и preview сделать максимально доступными;
- момент оплаты связать с production deploy или активным experiment;
- показывать прогноз использования до запуска;
- hard cap или spend protection по умолчанию;
- не тарифицировать участников-клиентов, которые только approve/reject;
- yearly plan вводить после подтверждения месячного retention.

Это гипотеза для проверки интервью и тестом pricing page, а не окончательная цена.

## 10. Метрики

### North Star Metric

> **Количество утверждённых или опубликованных изменений на активный сайт в месяц.**

Метрика отражает реальную работу пользователя лучше, чем число созданных commands, посещений dashboard или собранных events.

### Activation

Пользователь активирован, когда за один onboarding session:

1. подключил и верифицировал сайт;
2. создал первое визуальное изменение;
3. сохранил version;
4. открыл или отправил share link.

Целевая длительность — менее 15 минут, не считая доступа к установке script.

### Воронка

```text
Landing visit
→ playground change
→ signup
→ script verified
→ first saved version
→ share opened
→ approved
→ deployed / experiment started
→ second change within 30 days
```

### Продуктовые health metrics

- доля успешных установок;
- time to first change;
- share и approval rate;
- deploy/experiment rate;
- доля сайтов со вторым изменением за 30 дней;
- release replay success rate;
- `TARGET_NOT_FOUND` и mutation error rate;
- p75/p95 runtime overhead;
- flicker incidents;
- rollback rate и причины;
- experiment event loss/duplication.

### Первые пороги-гипотезы

- 50% qualified signups подключают сайт;
- 60% подключивших создают первую версию;
- 40% первых версий отправляются или публикуются;
- 30% активированных сайтов создают вторую правку за 30 дней;
- успешное воспроизведение release — выше 99,5%.

Пороги нужны для принятия решений и должны быть пересмотрены после первых 10–20 реальных клиентов.

## 11. План на 90 дней

### Недели 1–2: problem/positioning validation

- 20 интервью: 10 агентств/фрилансеров, 5 владельцев, 5 маркетологов;
- проверить три сообщения: «без разработчика», «работающая версия по ссылке», «безопасная публикация и откат»;
- провести текущим продуктом 5 concierge editing sessions;
- зафиксировать все точки недоверия к script и publication.

Критерий: минимум 8 респондентов уже решают эту проблему вручную и готовы дать реальный сайт для пилота.

### Недели 3–6: sellable core

- production deploy/rollback;
- install diagnostics;
- Original / Version и approval;
- drift report/repair;
- 5 безопасных templates;
- runtime performance telemetry;
- интерактивный playground.

Критерий: первую версию можно создать и отправить менее чем за 15 минут; rollback проверен end-to-end.

### Недели 7–10: пилоты и distribution

- 10 pilot sites;
- thin WordPress plugin;
- agency workspace minimum;
- guest approvals;
- 3 публичных case studies;
- первые SEO landing pages;
- referral tracking.

Критерий: как минимум 3 клиента повторяют сценарий без участия основателя.

### Недели 11–12: launch and pricing test

- открыть self-serve signup;
- запустить Free/Solo/Agency pricing experiment;
- Product Hunt и профильные communities;
- referral beta;
- еженедельный анализ activation, replay reliability и повторного использования.

Критерий: не число регистраций, а первые платные deploy/experiment и повторное изменение страницы.

## 12. План исследований с клиентами

В интервью нельзя начинать с демонстрации Lykar. Сначала нужно восстановить последний реальный случай.

Основные вопросы:

1. Когда вы в последний раз хотели изменить уже работающую страницу?
2. Что именно меняли и кто участвовал?
3. Сколько времени прошло от идеи до публикации?
4. Где появилось ожидание, передача контекста или переделка?
5. Как вы показывали вариант клиенту/руководителю?
6. Кто имел право утвердить и опубликовать?
7. Что могло сломаться и как вы это проверяли?
8. Как часто такая ситуация повторяется за месяц?
9. За какие инструменты в этом процессе уже платите?
10. Дали бы вы стороннему script право менять DOM? Какие гарантии нужны?

После демонстрации:

- попросить самостоятельно создать изменение без подсказки;
- попросить объяснить, что произойдёт после Publish;
- попросить найти способ вернуться к Original;
- спросить, кому пользователь отправил бы ссылку прямо сейчас;
- предложить установить на реальный сайт в течение интервью;
- вместо «нравится?» спросить о готовности начать оплачиваемый pilot.

## 13. Риски и ответы

| Риск | Почему критичен | Продуктовый ответ | Маркетинговый ответ |
| --- | --- | --- | --- |
| Недоверие к стороннему script | Lykar меняет живой сайт | signed commands, no arbitrary JS, audit, rollback, domain allowlist | публичная security model и понятный fail-open |
| DOM drift | сайт/CMS меняется независимо | fingerprint, skipped changes, repair flow, preflight | «Lykar предупредит, а не применит правку к случайному элементу» |
| Flicker и performance | виден исходный вариант, падают метрики | ранний manifest, cache, performance budget | публиковать реальные p75/p95 показатели |
| SEO | часть изменений появляется только после JS | source handoff, edge/SSR path, preview noindex | не обещать SEO-safe до проверки конкретного режима |
| Низкий трафик | A/B не приходит к выводу | readiness calculator, micro-goals, direct links | продавать версии и approvals раньше статистики |
| CMS уже умеет редактировать | visual edit выглядит commodity | cross-platform versions, approvals, experiments, rollback | сравнивать с workflow, а не с полем редактирования |
| SPA перерисовывает DOM | команды исчезают | отдельный SPA lifecycle roadmap | явно маркировать совместимость сайта |
| AI делает плохую правку | ущерб бренду/конверсии | proposals only, diff, human approval | «AI предлагает — человек публикует» |

## 14. Решение о продуктовой категории

Рекомендуемая последовательность расширения:

```text
Visual change + share
        ↓
Approval + production deploy + rollback
        ↓
Experiment + goals + analytics
        ↓
Rules/personalization
        ↓
Human-reviewed AI change agent
```

Первая продаваемая ценность существует без большой аналитической платформы. Каждый следующий слой использует уже созданную модель команд и immutable versions.

## 15. Итоговая ставка

Короткая формула стратегии:

> **Начать с агентств, продавать не редактор, а сокращение пути от правки до согласованного результата, сделать публикацию безопасной, а эксперименты и AI — следующими способами использовать ту же инфраструктуру версий.**

Если Lykar надёжно решит «изменить → сохранить → показать → утвердить → применить → откатить», ему не нужно сразу быть лучше Optimizely во всём. Он займёт понятное место между CMS, visual feedback и enterprise experimentation — и сможет постепенно расширяться во все три направления.
