import { useEffect, useRef, useState } from 'preact/hooks';

import { ApiError, api, del, patch, post } from './api';
import type { Experiment, ExperimentAnalyticsReport, ExperimentVariant, ExperimentVariantKey, Page, ProjectPermissions, Release } from './api';
import { errorMessage, useAsyncAction } from './use-async-action';

export function ExperimentsPanel({ page, releases, experiments, permissions, reload, mutationsEnabled }: {
  page: Page;
  releases: Release[];
  experiments: Experiment[];
  permissions: ProjectPermissions;
  reload: () => Promise<void>;
  mutationsEnabled: boolean;
}) {
  const [name, setName] = useState('Control vs Variant B');
  const [aRelease, setARelease] = useState('native');
  const [bRelease, setBRelease] = useState('');
  const [aWeight, setAWeight] = useState(50);
  const [freshLinks, setFreshLinks] = useState<Record<string, { id: string; url: string }>>({});
  const [freshExperimentLinks, setFreshExperimentLinks] = useState<Record<string, { id: string; url: string }>>({});
  const [reports, setReports] = useState<Record<string, ExperimentAnalyticsReport>>({});
  const [reportLoading, setReportLoading] = useState<Record<string, boolean>>({});
  const [reportErrors, setReportErrors] = useState<Record<string, string>>({});
  const reportsInFlight = useRef(new Set<string>());
  const { pendingAction, actionError, setActionError, runAction } = useAsyncAction(
    reload,
    mutationsEnabled,
    'Эксперимент изменился в другой вкладке или уже занят другой активный запуск. Проверьте новый статус и повторите действие.',
  );

  useEffect(() => {
    if (!bRelease && releases[0]) setBRelease(releases[0].id);
  }, [releases]);

  async function create() {
    await post(`/api/admin/pages/${page.id}/experiments`, {
      name,
      variants: [
        { key: 'A', releaseId: aRelease === 'native' ? null : aRelease, description: 'Control', weightBps: aWeight * 100 },
        { key: 'B', releaseId: bRelease || null, description: 'Treatment', weightBps: (100 - aWeight) * 100 },
      ],
    });
    setName('Control vs Variant B');
  }

  async function transition(id: string, action: 'activate' | 'pause' | 'complete', winnerVariantKey?: ExperimentVariantKey | null) {
    await post(`/api/admin/experiments/${id}/${action}`, action === 'complete' ? { winnerVariantKey } : {});
    if (action === 'complete') {
      setFreshExperimentLinks(current => Object.fromEntries(Object.entries(current).filter(([experimentId]) => experimentId !== id)));
      setFreshLinks(current => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`))));
    }
  }

  async function updateVariant(experimentId: string, variant: ExperimentVariant, releaseId: string) {
    await patch(`/api/admin/experiments/${experimentId}/variants/${variant.key}`, {
      releaseId: releaseId === 'native' ? null : releaseId,
      description: variant.description,
      weightBps: variant.weightBps,
    });
  }

  async function updateWeight(experiment: Experiment, percentA: number) {
    const variant = experiment.variants[0];
    await patch(`/api/admin/experiments/${experiment.id}/variants/A`, {
      releaseId: variant.releaseId,
      description: variant.description,
      weightBps: percentA * 100,
    });
  }

  async function createLink(experimentId: string, key: ExperimentVariantKey) {
    const result = await post<{ link: { id: string }; url: string }>(`/api/admin/experiments/${experimentId}/variants/${key}/links`, {});
    setFreshLinks(current => ({ ...current, [`${experimentId}:${key}`]: { id: result.link.id, url: result.url } }));
    void navigator.clipboard?.writeText(result.url).catch(() => undefined);
  }

  function copyFreshLink(url: string) {
    if (!navigator.clipboard) {
      setActionError('Автокопирование недоступно. Откройте ссылку или выделите её и скопируйте вручную.');
      return;
    }
    void navigator.clipboard.writeText(url).then(
      () => setActionError(''),
      () => setActionError('Не удалось скопировать ссылку автоматически. Откройте её или скопируйте вручную.'),
    );
  }

  async function revokeLink(linkId: string) {
    await del(`/api/admin/variant-links/${linkId}`);
    setFreshLinks(current => Object.fromEntries(
      Object.entries(current).filter(([, link]) => link.id !== linkId),
    ));
  }


  async function createExperimentLink(experimentId: string) {
    const result = await post<{ link: { id: string }; url: string }>(`/api/admin/experiments/${experimentId}/links`, {});
    setFreshExperimentLinks(current => ({ ...current, [experimentId]: { id: result.link.id, url: result.url } }));
    void navigator.clipboard?.writeText(result.url).catch(() => undefined);
  }

  async function revokeExperimentLink(linkId: string) {
    await del(`/api/admin/experiment-links/${linkId}`);
    setFreshExperimentLinks(current => Object.fromEntries(
      Object.entries(current).filter(([, link]) => link.id !== linkId),
    ));
  }

  async function loadReport(experimentId: string) {
    if (reportsInFlight.current.has(experimentId)) return;
    reportsInFlight.current.add(experimentId);
    setReportLoading(current => ({ ...current, [experimentId]: true }));
    setReportErrors(current => ({ ...current, [experimentId]: '' }));
    try {
      const result = await api<{ report: ExperimentAnalyticsReport }>(`/api/admin/experiments/${experimentId}/analytics`);
      setReports(current => ({ ...current, [experimentId]: result.report }));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setReportErrors(current => ({ ...current, [experimentId]: `Эксперимент изменился. Данные обновлены; запросите отчёт снова. (${reason.message})` }));
        await reload().catch(refreshError => setReportErrors(current => ({
          ...current,
          [experimentId]: `${current[experimentId]} Не удалось обновить данные: ${errorMessage(refreshError)}`,
        })));
      } else setReportErrors(current => ({ ...current, [experimentId]: errorMessage(reason) }));
    } finally {
      reportsInFlight.current.delete(experimentId);
      setReportLoading(current => ({ ...current, [experimentId]: false }));
    }
  }

  return <div class="experiments-panel">
    {actionError && <p class="inline-error" role="alert">{actionError}</p>}
    {permissions.edit && releases.length > 0 && <form class="form experiment-create" onSubmit={event => { event.preventDefault(); void runAction('create', create); }}>
      <h3>Новый эксперимент</h3>
      <input required value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Название эксперимента" />
      <div class="row">
        <label>Variant A <ReleaseSelect releases={releases} value={aRelease} onChange={setARelease} /></label>
        <label>Variant B <ReleaseSelect releases={releases} value={bRelease} onChange={setBRelease} /></label>
        <label>Трафик A, % <input type="number" min="1" max="99" value={aWeight} onInput={event => setAWeight(Number(event.currentTarget.value))} /></label>
        <span class="small muted">B: {100 - aWeight}%</span>
        <button class="primary" disabled={!mutationsEnabled || Boolean(pendingAction) || !bRelease || !Number.isInteger(aWeight) || aWeight < 1 || aWeight > 99}>{pendingAction === 'create' ? 'Создаём…' : 'Создать'}</button>
      </div>
    </form>}
    {releases.length === 0 && <p class="muted">Сначала зафиксируйте хотя бы одну immutable release.</p>}
    {experiments.length === 0 && <p class="muted">Экспериментов пока нет.</p>}
    <div class="experiment-list">{experiments.map(experiment => {
      const freshExperimentLink = freshExperimentLinks[experiment.id];
      const report = reports[experiment.id];
      const reportError = reportErrors[experiment.id];
      const reportIsLoading = Boolean(reportLoading[experiment.id]);
      return <article class="experiment" key={experiment.id}>
      <div class="row experiment-heading">
        <div><h3>{experiment.name}</h3><span class={`badge experiment-${experiment.status}`}>{experiment.status}</span>
          {experiment.winnerVariantKey && <span class="badge winner">Победитель: {experiment.winnerVariantKey}</span>}
        </div>
        {permissions.publish && <div class="row">
          {(experiment.status === 'draft' || experiment.status === 'paused') && <button class="primary" disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`transition-${experiment.id}-activate`, () => transition(experiment.id, 'activate'))}>{pendingAction === `transition-${experiment.id}-activate` ? 'Запускаем…' : 'Запустить'}</button>}
          {experiment.status === 'active' && <button disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`transition-${experiment.id}-pause`, () => transition(experiment.id, 'pause'))}>{pendingAction === `transition-${experiment.id}-pause` ? 'Приостанавливаем…' : 'Пауза'}</button>}
          {(experiment.status === 'active' || experiment.status === 'paused') && <>
            <button disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`transition-${experiment.id}-complete-a`, () => transition(experiment.id, 'complete', 'A'))}>{pendingAction === `transition-${experiment.id}-complete-a` ? 'Завершаем…' : 'Завершить · A'}</button>
            <button disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`transition-${experiment.id}-complete-b`, () => transition(experiment.id, 'complete', 'B'))}>{pendingAction === `transition-${experiment.id}-complete-b` ? 'Завершаем…' : 'Завершить · B'}</button>
            <button class="danger" disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`transition-${experiment.id}-complete-none`, () => transition(experiment.id, 'complete', null))}>{pendingAction === `transition-${experiment.id}-complete-none` ? 'Завершаем…' : 'Без победителя'}</button>
          </>}
        </div>}
      </div>
      <div class="experiment-delivery">
        <b>Распределение: {experiment.variants[0].weightBps / 100}% / {experiment.variants[1].weightBps / 100}%</b>
        {experiment.status === 'draft' && permissions.edit && <VariantWeightEditor
          value={experiment.variants[0].weightBps / 100}
          onSave={value => runAction(`weight-${experiment.id}`, () => updateWeight(experiment, value))}
          disabled={!mutationsEnabled || Boolean(pendingAction)}
        />}
        {experiment.status === 'active' && permissions.publish && <button disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`experiment-link-${experiment.id}`, () => createExperimentLink(experiment.id))}>{pendingAction === `experiment-link-${experiment.id}` ? 'Создаём ссылку…' : 'Создать A/B-ссылку'}</button>}
        {freshExperimentLink && <div class="row small fresh-variant-link">
          <a href={freshExperimentLink.url} target="_blank" rel="noreferrer">Открыть A/B-ссылку</a>
          <button onClick={() => copyFreshLink(freshExperimentLink.url)}>Копировать</button>
        </div>}
        {experiment.links.filter(link => !link.revokedAt).map(link => <div class="row small" key={link.id}>
          <span>A/B token …{link.tokenHint}</span>
          {permissions.publish && <button class="danger" disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`revoke-experiment-link-${link.id}`, () => revokeExperimentLink(link.id))}>{pendingAction === `revoke-experiment-link-${link.id}` ? 'Отзываем…' : 'Отозвать'}</button>}
        </div>)}
      </div>
      <div class="variant-grid">{experiment.variants.map(variant => {
        const freshLink = freshLinks[`${experiment.id}:${variant.key}`];
        return <section class="variant" key={variant.id}>
          <h4>Variant {variant.key}</h4>
          {experiment.status === 'draft' && permissions.edit
            ? <ReleaseSelect releases={releases} value={variant.releaseId ?? 'native'} onChange={value => void runAction(`variant-${experiment.id}-${variant.key}`, () => updateVariant(experiment.id, variant, value))} disabled={!mutationsEnabled || Boolean(pendingAction)} />
            : <p>{variant.releaseVersion === null ? 'Исходная страница' : `Version ${variant.releaseVersion}`}</p>}
          {variant.description && <p class="small muted">{variant.description}</p>}
          {experiment.status === 'active' && permissions.publish && <button disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`variant-link-${experiment.id}-${variant.key}`, () => createLink(experiment.id, variant.key))}>{pendingAction === `variant-link-${experiment.id}-${variant.key}` ? 'Создаём ссылку…' : 'Создать ссылку'}</button>}
          {freshLink && <div class="row small fresh-variant-link">
            <a href={freshLink.url} target="_blank" rel="noreferrer">Открыть свежую ссылку</a>
            <button onClick={() => copyFreshLink(freshLink.url)}>Копировать</button>
          </div>}
          {variant.links.filter(link => !link.revokedAt).map(link => <div class="row small" key={link.id}>
            <span>token …{link.tokenHint}</span>
            {permissions.publish && <button class="danger" disabled={!mutationsEnabled || Boolean(pendingAction)} onClick={() => void runAction(`revoke-variant-link-${link.id}`, () => revokeLink(link.id))}>{pendingAction === `revoke-variant-link-${link.id}` ? 'Отзываем…' : 'Отозвать'}</button>}
          </div>)}
        </section>;
      })}</div>
      {permissions.publish && <div class="analytics-report">
        <button disabled={!mutationsEnabled || reportIsLoading || Boolean(pendingAction)} onClick={() => void loadReport(experiment.id)}>{reportIsLoading ? 'Загружаем аналитику…' : report ? 'Обновить аналитику' : 'Показать аналитику'}</button>
        {reportError && <p class="inline-error" role="alert">{reportError}</p>}
        {report && <AnalyticsReport report={report} />}
      </div>}
    </article>;
    })}</div>
  </div>;
}

function VariantWeightEditor({ value, onSave, disabled }: {
  value: number;
  onSave: (value: number) => Promise<boolean>;
  disabled: boolean;
}) {
  const [percent, setPercent] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => { if (!dirty) setPercent(value); }, [value]);
  async function save() {
    if (pending) return;
    setPending(true);
    const saved = await onSave(percent);
    if (saved) {
      setDirty(false);
      setPercent(value);
    }
    setPending(false);
  }
  return <div class="row weight-editor">
    <label>A <input type="number" min="1" max="99" value={percent} onInput={event => { setPercent(Number(event.currentTarget.value)); setDirty(true); }} />%</label>
    <span class="muted">B {100 - percent}%</span>
    <button disabled={disabled || pending || !Number.isInteger(percent) || percent < 1 || percent > 99 || percent === value} onClick={() => void save()}>{pending ? 'Сохраняем…' : 'Сохранить'}</button>
  </div>;
}

function AnalyticsReport({ report }: { report: ExperimentAnalyticsReport }) {
  return <div class="analytics-table">
    <div class="analytics-row analytics-head"><span>Вариант</span><span>Посетители</span><span>Показы</span><span>Уник. конверсии</span><span>CVR</span><span>Uplift к A</span></div>
    {report.variants.map(variant => <div class="analytics-row" key={variant.key}>
      <b>{variant.key}</b><span>{variant.visitors}</span><span>{variant.views}</span>
      <span>{variant.uniqueConversions} <span class="muted">({variant.conversions} всего)</span></span>
      <span>{formatRate(variant.conversionRate)}</span><span>{formatRate(variant.upliftVsA, true)}</span>
    </div>)}
    <p class="small muted">Обновлено {new Date(report.generatedAt).toLocaleString()}. Показатели описательные; статистическая значимость пока не рассчитывается.</p>
  </div>;
}

function formatRate(value: number | null, signed = false): string {
  if (value === null) return '—';
  const percent = `${(value * 100).toFixed(2)}%`;
  return signed && value > 0 ? `+${percent}` : percent;
}

function ReleaseSelect({ releases, value, onChange, disabled = false }: { releases: Release[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <select value={value} disabled={disabled} onChange={event => onChange(event.currentTarget.value)}>
    <option value="native">Исходная страница</option>
    {releases.map(release => <option value={release.id} key={release.id}>Version {release.version}</option>)}
  </select>;
}
