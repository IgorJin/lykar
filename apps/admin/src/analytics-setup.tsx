import { useEffect, useRef, useState } from 'preact/hooks';

import { api, post } from './api';
import type { AnalyticsTest, Experiment, ProjectPermissions } from './api';
import { useAsyncAction } from './use-async-action';

export function validGoal(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && name.length <= 120 && !name.startsWith('$');
}

export function AnalyticsSetup({ experiment, permissions, disabled, onSave }: {
  experiment: Experiment;
  permissions: ProjectPermissions;
  disabled: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const [goal, setGoal] = useState(experiment.conversionEventName ?? '');
  const [dirty, setDirty] = useState(false);
  const [test, setTest] = useState<AnalyticsTest | null>(null);
  const [url, setUrl] = useState('');
  const [now, setNow] = useState(Date.now());
  const scope = useRef(0);
  const { pendingAction, actionError, runAction } = useAsyncAction(async () => {}, !disabled && permissions.edit,
    'Настройка теста изменилась. Обновите страницу и повторите действие.');
  useEffect(() => {
    scope.current += 1;
    if (!dirty) setGoal(experiment.conversionEventName ?? '');
    setTest(null);
    setUrl('');
    return () => { scope.current += 1; };
  }, [experiment.id, experiment.conversionEventName, permissions.edit]);
  useEffect(() => {
    if (!test) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [test?.id]);

  const expired = test !== null && new Date(test.expiresAt).getTime() <= now;
  const locked = experiment.firstActivatedAt !== null;
  const busy = disabled || Boolean(pendingAction);
  const eventName = experiment.conversionEventName;
  async function save() {
    if (!validGoal(goal) || busy || locked || !permissions.edit) return;
    if (await onSave(goal.trim())) setDirty(false);
  }
  async function createTest() {
    const currentScope = scope.current;
    const result = await post<{ test: Pick<AnalyticsTest, 'id' | 'eventName' | 'expiresAt'> & { url: string } }>(
      `/api/admin/experiments/${experiment.id}/analytics-tests`, {});
    if (currentScope !== scope.current) return;
    setTest({ ...result.test, consent: null, eventReceived: false, lastReceivedAt: null });
    setUrl(result.test.url);
    setNow(Date.now());
  }
  async function refreshTest() {
    if (!test) return;
    const currentScope = scope.current;
    const result = await api<{ test: AnalyticsTest }>(`/api/admin/experiments/${experiment.id}/analytics-tests/${test.id}`);
    if (currentScope !== scope.current) return;
    setTest(result.test);
    setNow(Date.now());
  }

  return <section class="analytics-setup" aria-label={`Настройка аналитики: ${experiment.name}`}>
    <h4>Событие конверсии</h4>
    <p>{eventName ? <code>{eventName}</code> : 'Все события (исторический режим)'}</p>
    {locked && <p class="small muted">Цель зафиксирована первым запуском. Для другой цели создайте новый эксперимент.</p>}
    {!locked && permissions.edit && <form class="form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>Название события <input required maxLength={120} value={goal} disabled={busy}
        onInput={event => { setGoal(event.currentTarget.value); setDirty(true); }} placeholder="purchase_completed" /></label>
      <span class="small muted">1–120 символов, без $ в начале. Сохраните цель до первого запуска.</span>
      <button disabled={busy || !validGoal(goal) || goal.trim() === (eventName ?? '')}>Сохранить цель</button>
    </form>}
    {eventName && <details>
      <summary>Инструкция SDK / script: событие и согласие</summary>
      <p>Разработчик вызывает событие после реального действия пользователя. Автоматической настройки кликов и форм нет.</p>
      <p>Используйте уже созданный экземпляр <code>lykar</code> из инструкции подключения: для npm это <code>new Lykar(…)</code>, для script — <code>new window.Lykar(…)</code>.</p>
      <pre><code>{`const sdk = lykar; // уже подключённый экземпляр, не создавайте второй

// Подключите к callback вашей CMP / системы согласия:
async function onHostConsentChange(state) {
  if (state === 'granted') await sdk.consent('granted');
  else if (state === 'denied') await sdk.consent('denied');
  else await sdk.consent('pending');
}

// В обработчике успешно завершённого целевого действия:
async function onConversionCompleted() {
  await sdk.track(${JSON.stringify(eventName)});
}`}</code></pre>
      <p>Начальное состояние — <code>pending</code>. Передайте текущее решение и каждое изменение из системы согласия сайта. При отказе или отзыве передайте <code>denied</code>; при сбросе выбора — <code>pending</code>. Не выдавайте <code>granted</code> при открытии страницы. Без согласия exposure и conversion не отправляются.</p>
      <p>Для повторных обработчиков и сетевых retry одного действия передавайте один и тот же <code>clientEventId</code> третьим аргументом: <code>{`sdk.track(${JSON.stringify(eventName)}, undefined, { clientEventId })`}</code>. Создайте ID один раз через <code>crypto.randomUUID()</code> и сохраните для повторных попыток. Новое реальное действие — новый ID.</p>
      <p class="small muted">Для автоматической установки script с <code>data-lykar-project</code> используйте <code>const sdk = window.Lykar;</code> в примере: глобальные <code>track</code> и <code>consent</code> работают с автоматически инициализированным SDK.</p>
    </details>}
    {permissions.edit && <div class="analytics-test">
      <h4>Проверка интеграции</h4>
      <p class="small muted">Откройте тестовую ссылку, примите или отклоните consent на сайте и выполните целевое действие. Тест изолирован от production totals.</p>
      {!eventName && <p class="muted">Для теста сначала сохраните именованное событие.</p>}
      <button disabled={busy || !eventName} onClick={() => void runAction('create-test', createTest, { refresh: false })}>
        {pendingAction === 'create-test' ? 'Создаём тест…' : 'Создать тестовую ссылку'}
      </button>
      {actionError && <p class="inline-error" role="alert">{actionError}</p>}
      {test && <div class="analytics-test-result">
        <p>Проверяем <code>{test.eventName}</code>. Ссылка действует до {new Date(test.expiresAt).toLocaleString()}.</p>
        <p class="small muted">Полная ссылка показана только в этой сессии. После закрытия панели создайте новый тест.</p>
        {expired ? <p role="status">Тестовая ссылка истекла. Создайте новый тест.</p> : url && <a href={url} target="_blank" rel="noreferrer">Открыть тестовую ссылку</a>}
        <button disabled={busy} onClick={() => void runAction('refresh-test', refreshTest, { refresh: false })}>
          {pendingAction === 'refresh-test' ? 'Проверяем…' : 'Обновить диагностику'}
        </button>
        <p role="status" aria-live="polite" class={test.consent === 'granted' && test.eventReceived ? 'success' : 'muted'}>
          {test.consent === null ? 'Нет трафика: SDK ещё не подключился к тесту.'
            : test.consent !== 'granted' ? `Нет consent: ${test.consent === 'pending' ? 'ожидается решение' : 'пользователь отказал'}. Сбор выключен.`
              : test.eventReceived ? 'Успех: выбранное событие получено.'
                : 'Consent получен, но выбранное событие ещё не поступило.'}
        </p>
        {test.lastReceivedAt && <p class="small muted">Последний сигнал: {new Date(test.lastReceivedAt).toLocaleString()}.</p>}
      </div>}
    </div>}
  </section>;
}
