# RFC: Visual Change Requests и проверяемые UI specifications

Дата: 2026-09-16; очередь обновлена 2026-09-20. Статус: X1–X3 включены в план
прототипирования; функциональность не реализована. Полная функция и guides
не объявлены обязательной частью V1.

Основание: предоставленный владельцем план «UI Intent / CHANGE / SPEC / GUIDE»,
текущий [ROADMAP](../../ROADMAP.md), [техническое видение](./technical-vision.md)
и сверка protocol/runtime/editor с исходным кодом.

Этот RFC оценивает идеи и определяет проверяемый прототип, включённый в план
по запросу от 2026-09-20. Он не заменяет обязательства V1 из [SPEC](../../SPEC.md)
и не объявляет изменение ICP или запуск полноценного guide/QA продукта.

## 1. Рекомендация

Прототипировать **Visual Change Request → handoff → source implementation →
acceptance report**. Это наиболее естественное расширение текущего редактора:
визуальное изменение одновременно становится демонстрацией желаемого результата
и входом для постановки задачи.

Сохранить существующий путь runtime delivery и экспериментов. Добавить второе
применение той же авторской работы — перенос результата в исходный код.
Guide-модуль рассматривать после подтверждения полезности Visual Spec.

UI Intent подходит как долгосрочная концепция продукта. Для реализации нужны
отдельные типизированные модели изменения, требования, проверки и гида, которые
используют общие сведения о target и context.

Сильное возможное отличие: человеку удобно показать изменение на существующем
сайте, передать проверяемое задание и получить подтверждение реализации. Сам по
себе resolver, AI или expected-state assertion не является доказанным moat.

## 2. Оценка основных предложений

| Предложение | Оценка | Изменение плана |
| --- | --- | --- |
| Visual Change Request | Высокая близость к текущему продукту | Первое новое расширение после стабильного editor/core |
| Машиночитаемая Visual Spec | Перспективно, но операции недостаточны | Отдельный contract ожидаемого состояния и context |
| Автоматическая приёмка | Ценно, требует контроля ложного PASS | Ограниченный deterministic validator поверх Playwright |
| Handoff coding agent | Можно проверить без собственной AI-интеграции | JSON + Markdown + preview + validation command |
| Stable Element Identity | Пока гипотеза, не существующая гарантия | TargetRef, environment bindings и явная неоднозначность |
| Self-healing | Полезно, риск неверного сопоставления | Сначала repair suggestions с человеческим подтверждением |
| Product guides | Используют часть ядра, но имеют отдельный workflow | Позже, без полноценной onboarding-платформы в V1 |
| Единый универсальный UIIntent object | Риск смешения прав и моделей | Общие primitives, отдельные domain objects |
| SPEC раньше A/B | Не соответствует состоянию нашего репозитория | Сохранить существующий A/B, отложить расширенную статистику |
| Оценки 9–10/10 и «свободная категория» | Не подтверждены исследованием спроса | Пилот с измеряемыми результатами вместо числовой уверенности |

## 3. Что подтверждается источниками, а что остаётся гипотезой

Рынок guides действительно зрелый: [Pendo](https://support.pendo.io/hc/en-us/articles/40690798780827-Understand-the-Guides-product-and-plan-differences)
и [Appcues](https://docs.appcues.com/tooltips-hotspots) уже описывают развитые
guide/tooltip сценарии. Appcues отдельно разбирает динамические selectors,
несколько совпадений и использование стабильных data attributes:
[element targeting](https://appcues.helpjuice.com/en_US/dev-troubleshooting/css-selectors).

Self-healing уже применяется в тестировании. У mabl есть element history,
environment-specific matching и проверка исправленных сопоставлений. Более того,
документация прямо описывает риск false pass/false fail при auto-healing assertions:
[как работает auto-heal](https://help.mabl.com/hc/en-us/articles/19078583792404-How-auto-heal-works),
[assertions и auto-heal](https://help.mabl.com/hc/en-us/articles/19078158616340-Assertions-and-auto-heal).

Проверка intended state тоже не новая категория сама по себе. Playwright умеет
создавать assertions через выбор элемента в браузере и проверять text, attributes,
computed styles, visibility и другие свойства:
[codegen](https://playwright.dev/docs/codegen),
[assertions](https://playwright.dev/docs/test-assertions).
[Momentic](https://momentic.ai/docs) предлагает natural-language тесты и assertions.

Различие с visual regression полезно для объяснения: screenshot baseline показывает
изменения относительно прошлой версии. Но нельзя заключить, что остальные QA
инструменты не проверяют бизнес-намерение. [Storybook](https://storybook.js.org/docs/writing-tests/visual-testing)
описывает конкретно visual-testing workflow, а не границы всего рынка testing.

[BugHerd](https://bugherd.com/website-annotation-tool) подтверждает существование
спроса на contextual website feedback. Гипотеза Lykar — что редактируемая
демонстрация плюс проверяемый contract уменьшат работу по передаче этого feedback
разработчику. Готовность платить за такую связку ещё не измерена.

## 4. Продуктовая модель: одна правка, два пути исполнения

```text
Визуально подготовленное изменение
       ├── Draft → Release → Runtime delivery / Experiment
       └── Change Request → Approved Spec → Developer / Coding agent
                                             ↓
                                      Source code change
                                             ↓
                                      Preview deployment
                                             ↓
                                      Validation report
```

Во втором пути Lykar не обязан менять source code сам. Первый handoff работает
с любым разработчиком или внешним агентом. Для этого не нужен наш AI API key.

Если ожидается изменение бизнеса, оно формулируется отдельно. Изменение надписи
`$49` на `$59` подтверждает только отображаемую цену. Оно не меняет billing,
checkout, расчёт налогов и договорённости с платёжной системой. UI-отчёт не должен
объявлять такое продуктовое изменение полностью выполненным.

## 5. Operation и Requirement — разные модели

Operation описывает действие preview/runtime. Requirement описывает свойство
готового результата независимо от способа реализации.

| Действие в editor | Возможное требование | Что обязательно уточнить |
| --- | --- | --- |
| `setText` | Текст CTA равен заданному | Точный text или accessible name, whitespace, locale |
| `setStyle(padding, 16px)` | Вычисленный padding равен 16px | Сторона, viewport, tolerance; inline style не обязателен |
| `setAttribute(href, ...)` | Ссылка ведёт к заданному пути | Relative/absolute URL и соответствие staging origin |
| `removeNode` | Элемент отсутствует | Root и состояние загружены; сломанный selector не доказывает отсутствие |
| `display: none` | Элемент невидим в заданном context | Это не то же самое, что отсутствие в DOM |
| `moveNode` | CTA расположен перед блоком | DOM order, reading order или визуальная координата — разные условия |
| `insertNode`/copy | Нужный блок существует в нужном количестве | Идентичность, содержимое, event behavior и отсутствие дублей |

История `red → blue → green` не даёт три одновременных требования к цвету.
Compiler строит candidate requirements по конечному desired state; автор
просматривает и подтверждает их. Промежуточные действия остаются provenance.

Не каждое действие автоматически компилируется в достаточную проверку. Неясный
пункт получает `manual`, а UI показывает ограничение до отправки задания.

Инварианты «mobile не сломан», «кнопка работает», «без горизонтального overflow»
невозможно надёжно вывести из одной операции изменения текста. Их надо добавить
явными требованиями с конкретными contexts и критериями.

## 6. Предлагаемая доменная модель

```text
ChangeRequest
  ├── revisions (immutable after submission)
  │     ├── DesiredChangeSet (references/copy of versioned operations)
  │     ├── Requirements[]
  │     ├── ScenarioContexts[]
  │     └── TargetRefs[] + initial bindings
  ├── Review decisions (bound to revision hash)
  ├── Handoff bundles (bound to revision hash)
  └── ValidationRuns (append-only)
        ├── build/commit + environment + context
        ├── contract/binding/validator versions
        └── Results[] + bounded evidence
```

Основные различия:

- `ChangeRequest` — задача/намерение, не опубликованный Release.
- `Requirement` — типизированное утверждение о результате.
- `ScenarioContext` — pathname, viewport, locale, theme, state/fixture и ready condition.
- `TargetRef` — логическая ссылка на элемент; bindings привязаны к среде и версии.
- `ValidationRun` — наблюдение в конкретной сборке и среде, не изменение spec.
- `Guide` в будущем имеет собственные steps/triggers/progress и использует TargetRef.

Не добавлять `explain`, `comment`, `verify` в исполняемый DOM command protocol.
Read-only validation не получает editing capability. Старые manifests остаются
совместимыми, а schema specs versioned отдельно.

Revision workflow: draft → in_review → approved/rejected → superseded.
Изменение submitted revision создаёт следующую revision. Validation status
хранится отдельно: успешно пройти проверки не означает автоматически согласовать
задание, закрыть issue, merge PR или разрешить production deployment.

Editor может готовить spec; Owner/Admin подтверждает frozen revision и выдаёт
ссылку. Первые пилоты используют существующие роли без нового RBAC продукта.

## 7. Target identity — главная техническая неопределённость

В текущем коде `TargetDescriptor` содержит marker, CSS/XPath и fingerprint.
`resolveTarget` проходит candidates и возвращает первый, соответствующий
fingerprint; неоднозначность нескольких подходящих элементов не отклоняется
отдельным результатом. Это недостаточно для автоматической приёмки.

План улучшений:

1. Возвращать `unique`, `missing`, `ambiguous`, `invalid`, включая evidence.
2. Сначала использовать существующие стабильные marker/test ID и ограниченный root.
3. Добавить semantic locators и contextual anchors там, где они различают targets.
4. Поддержать environment bindings: production и PR preview могут иметь разный DOM.
5. Не выбирать первый совпавший элемент при ambiguity.
6. Отдельно хранить доизменительное наблюдение и locator ожидаемого результата.

Если target определяется текстом `Get started`, а ожидаемый текст — `Start free
trial`, старый текст нельзя оставить обязательным fingerprint при проверке новой
реализации. Аналогично original CSS path может устареть после правильного move.

Число `confidence: 97%` нельзя показывать как вероятность без калибровки на
размеченном наборе правильных и ошибочных сопоставлений. На первом этапе UI
показывает «точный», «неоднозначный», «кандидат для проверки» и причину.

Общими могут быть resolver primitives, но policies различаются:

- runtime mutation — только разрешённый однозначный target;
- validator — ambiguity даёт blocked/review, никогда PASS;
- guide — можно скрыть шаг и предложить repair;
- repair — кандидат подтверждается человеком, новое binding version сохраняется отдельно.

Auto-heal не имеет права переписать ожидаемый текст или baseline для получения
зелёного отчёта. Даже исправление locator нельзя подтвердить только тем, что
новый кандидат случайно удовлетворяет проверяемому expected value.

## 8. Validator и доказательства результата

Рекомендуется Node/Playwright runner. Первый запуск — локально или в CI владельца:
он достигает localhost/private preview, а auth state остаётся в его окружении.
Cloud workers добавляются только после проверки этого workflow на пилотах.

Логические модули: spec schema/compiler/exporter; read-only resolver/assertion
engine; Node runner/reporter. Не обязательно сразу создавать три новых пакета.
Visitor bundle не включает Playwright, browser automation или spec compiler.

### Отдельный чистый контекст

Source acceptance проверяет сайт с реализованными правками и выключенной Lykar
delivery. Нельзя применить сохранённую цепочку preview и проверить, что она же
дала ожидаемый результат: тогда неизменённый source тоже получит PASS.

Runner должен отключать Lykar до исполнения страницы: script interception для
отдельного asset либо явный validation integration mode для bundled npm SDK.
Удаление script после загрузки не отменяет уже выполненные mutations. Для
неизвестного окружения, где выключение не подтверждено, результат — blocked.
Runtime replay проверяется отдельным suite с отдельным report mode.

Это проверка заданных UI условий на объявленной сборке, а не криптографическое
доказательство архитектуры исходного кода. Build provenance берётся из доверенной
CI-интеграции; неподтверждённый commit label помечается как supplied metadata.

### Context и стабильность

- Явные width/height/DPR, locale, timezone и theme.
- Авторизация, feature flags, данные и readiness — references к trusted fixtures.
- Playwright waits на определённое состояние, а не произвольный фиксированный sleep.
- «≤768px» не равно гарантии проверки каждого размера: report перечисляет
  реально проверенные viewports, boundary checks добавляются отдельно.
- Отсутствующий target для positive assertion — FAIL только когда page/root/state
  подтверждены; ошибка login/navigation/readiness — BLOCKED.
- Для absence assertion старый selector с исчезнувшим классом не является
  доказательством удаления нужного элемента.

### Результат каждой проверки

- `pass`: условие выполнено в заданном context.
- `fail`: условие нарушено в корректно подготовленном context.
- `blocked`: context/target/окружение не удалось определить надёжно.
- `manual`: требуется человек, matcher не покрывает условие.

Отчёт показывает denominator всех обязательных checks и каждого context.
«8 pass, 1 blocked» не превращается в «100% passed». Общий автоматический PASS
возможен только при прохождении всех обязательных автоматических пунктов;
наличие обязательного manual пункта требует отдельного решения reviewer.

Evidence включает requirement ID, expected/actual, target resolution, spec/binding
version, build, viewport и validator version. Screenshots/DOM excerpts опциональны,
ограничены выбранной областью и retention. Ни cookies, ни credentials в bundle
или report не экспортируются. Такое целевое сохранение evidence оформляется
отдельно от текущей политики «не сохранять raw page DOM автоматически».

## 9. Handoff и агентная интеграция

Первый переносимый bundle:

```text
change-request.json    # frozen requirements, contexts, targets, provenance
change-request.md      # пояснение, ограничения и manual requirements
preview link          # ограниченный доступ к desired visual state
validation recipe     # как проверить эту revision на preview URL
```

Визуальная демонстрация может содержать временные inline styles, а инструкция
для разработчика явно разрешает идиоматичную реализацию через components,
classes и design tokens. Менять согласованные expected values агент не должен.

Preview URL, credentials и provider keys не зашиваются в публичный artifact.
CI/local runner связывает contract с разрешённым environment. DOM text является
данными; инструкции из страницы не должны получать приоритет над заданием.

Сначала — download/copy и ручная передача в GitHub/Linear/Jira. OAuth, синхронизация
статусов, remote execution и автоматическое создание PR — отдельные интеграции.
Сам handoff не требует запуска AI внутри Lykar.

## 10. Guide-модуль: что оставить на будущее

Повторно используются TargetRef/resolver, overlay и drift diagnostics. Однако
guides требуют своего progress state, sequencing, triggers, focus/keyboard
поведения, positioning при scroll, localization и audience policy.

Первый разумный срез — линейные подсказки next/back/close на известной странице,
preflight проверка targets и reviewable repair после drift. Missing target не
должен оставлять пользователя под блокирующим overlay.

Не выполнять пользовательское действие автоматически и не кликать «Удалить»
ради проверки guide. Multi-page navigation, segmentation и guide analytics идут
после простого сценария. Автоматическая коррекция target возможна только с
измеренной точностью, audit и отдельно согласованной policy.

## 11. Изменение последовательности работ

Сохранить основной S0–S6. Рабочий приоритет X1/X2 — после первого adapter S4.
Технически X1 требует стабильного core S2 и version/share workflow S3; static-only
X2 использует strict resolver, frozen contract и browser harness, а SPA validation
требует S4. Поэтому исследование static сценария возможно раньше при наличии
готовых prerequisites. Расширенная A/B-аналитика и AI-provider не нужны.

### X1 — Visual Change Request и handoff

Стабильная static fixture, один pathname, desktop/mobile contexts. Создать draft
задания из editor operations; предложить конечные requirements и дать автору
подтвердить их. Immutable revision, share и JSON/Markdown export.

Первый автоматизируемый набор: text, href/attribute, selected computed styles,
visibility. Move/add/delete отражаются в задании, но остаются manual, пока нет
надёжного semantic matcher. Для action semantics нужен отдельный browser test.

Выход: разработчик/агент получает достаточное задание без доступа к editing
capability. Неподдержанные проверки видны до отправки.

### X2 — Local acceptance runner

Playwright, verified native-source mode, pinned contract, read-only assertions,
machine-readable JSON и читаемый HTML/terminal report. CLI commands определяются
при реализации; сейчас никаких готовых команд `lykar validate` ещё нет.

Контрольный набор обязательно содержит:

1. Source не изменён, preview overlay выглядит правильно → source acceptance не PASS.
2. Исправление через CSS class вместо inline → PASS при требуемом computed value.
3. Два похожих CTA → ambiguous/BLOCKED, не первый подходящий.
4. Отдельная ошибка только на mobile → FAIL этого context.
5. Изменился текст/DOM path ровно так, как требует spec → корректный target match.
6. Login screen вместо Page → BLOCKED, отсутствие кнопки не считается удалением.
7. Неправильное значение, совпадающее у соседней кнопки → не PASS через auto-heal.
8. Draft задания поменялся во время run → результат остаётся у старой revision.

Выход: правильный source проходит, намеренно неправильный не получает PASS;
неподдерживаемый matcher не скрывается из denominator.

### X3 — Пилот и проверка полезности

Пять пар «автор изменения + разработчик/агент», суммарно 20 реальных небольших
заданий. Замерить время постановки, уточнений и приёмки относительно привычного
процесса. Проверить willingness to repeat/pay.

Предварительные gates, а не рыночные факты: минимум три пары повторяют workflow;
достаточно 80% заданий передать без устного объяснения; время ручной перепривязки
не съедает экономию; в размеченном контрольном наборе нет известных false PASS.
Нулевые ошибки на малом наборе не доказывают production reliability.

После gate решать, вводить ли Visual Spec в обязательный V1. До этого не расширять
его до тест-платформы, guide SaaS или orchestration системы для coding agents.

## 12. Product positioning и аудитория

Формулировка «Define, ship and verify UI changes visually» годится для видения.
Для раннего продукта обещание должно соответствовать доступному workflow:

> Покажите правку прямо на сайте. Отправьте рабочий пример и понятное задание.
> Проверьте, что реализация соответствует согласованным условиям.

У Spec-пути новый пользователь: PM, дизайнер, QA или агентство вместе с
разработчиком. У текущего Lykar — владелец небольшого сайта. Это разные способы
продажи и onboarding, поэтому направление требует отдельного пилота.

Плата за sites/exposures подходит delivery; стоимость validation определяется
browser runs/minutes, contexts и artifact storage. Пока считать usage раздельно,
а не назначать второму сценарию тариф без проверки себестоимости и спроса.

## 13. Предлагаемые решения

1. Сохранить ядро и обязательства существующего V1.
2. Выполнить X1/X2 после стабильных targets/session/executor и первого adapter;
   static-only прототип допускается раньше по зависимостям раздела 11.
3. Использовать operations как provenance и preview; requirements — как отдельный contract.
4. Вынести строгую идентификацию targets и ambiguous outcomes в ближайшую работу core.
5. Проверять source в чистом режиме, фиксируя contexts и evidence.
6. Сделать human/agent handoff через portable artifact до любых AI-provider integrations.
7. Заменить обещание self-healing на reviewable repair до появления измерений.
8. Оставить guides и continuous monitoring после подтверждения основного workflow.
