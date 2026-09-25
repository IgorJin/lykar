import { useEffect, useRef, useState } from 'preact/hooks';

import { api, del, post } from './api';
import type { Draft, Experiment, Page, ProjectPermissions, Release, Share } from './api';
import { ExperimentsPanel } from './experiments-panel';
import { errorMessage, useAsyncAction } from './use-async-action';

type LoadState = 'loading' | 'ready' | 'error';

export function PageWorkspace({ page, permissions }: {
  page: Page;
  permissions: ProjectPermissions;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [pageSection, setPageSection] = useState<'versions' | 'experiments'>('versions');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [freshShare, setFreshShare] = useState<{ id: string; url: string } | null>(null);
  const [shareNotice, setShareNotice] = useState('');
  const loadRequest = useRef(0);

  async function load() {
    const requestedPageId = page.id;
    const request = ++loadRequest.current;
    setLoadState('loading');
    setLoadError('');
    try {
      const [draftResult, releaseResult, shareResult, experimentResult] = await Promise.all([
        api<{ drafts: Draft[] }>(`/api/admin/pages/${requestedPageId}/drafts`),
        api<{ releases: Release[] }>(`/api/admin/pages/${requestedPageId}/releases`),
        api<{ shares: Share[] }>(`/api/admin/pages/${requestedPageId}/shares`),
        api<{ experiments: Experiment[] }>(`/api/admin/pages/${requestedPageId}/experiments`),
      ]);
      if (request !== loadRequest.current || requestedPageId !== page.id) return;
      setDrafts(draftResult.drafts);
      setReleases(releaseResult.releases);
      setShares(shareResult.shares);
      setExperiments(experimentResult.experiments);
      setHasLoadedData(true);
      setLoadState('ready');
    } catch (reason) {
      if (request === loadRequest.current && requestedPageId === page.id) {
        setLoadError(errorMessage(reason));
        setLoadState('error');
      }
      throw reason;
    }
  }

  const { pendingAction, actionError: operationError, setActionError: setOperationError, runAction } = useAsyncAction(
    load,
    loadState === 'ready',
    'Данные страницы изменились. Проверьте актуальную revision и повторите действие.',
  );

  useEffect(() => {
    setDrafts([]);
    setReleases([]);
    setShares([]);
    setExperiments([]);
    setHasLoadedData(false);
    setPageSection('versions');
    setOperationError('');
    setFreshShare(null);
    setShareNotice('');
    void load().catch(() => undefined);
    return () => { loadRequest.current += 1; };
  }, [page.id]);

  const open = drafts.find(draft => draft.status === 'open');
  async function createDraft() { await post(`/api/admin/pages/${page.id}/drafts`, {}); }
  async function launch() {
    if (!open) return;
    const editorWindow = window.open('about:blank', '_blank');
    if (!editorWindow) throw new Error('Браузер заблокировал окно редактора. Разрешите всплывающие окна для админки.');
    editorWindow.opener = null;
    try {
      const result = await post<{ launchUrl: string }>(`/api/admin/pages/${page.id}/editor-launch`, { draftId: open.id });
      editorWindow.location.replace(result.launchUrl);
    } catch (error) {
      editorWindow.close();
      throw error;
    }
  }
  async function publish() {
    if (!open) return;
    await post(`/api/admin/drafts/${open.id}/publish`, { expectedRevision: open.revision });
  }
  async function share(releaseId: string) {
    const result = await post<{ share: { id: string }; url: string }>(`/api/admin/pages/${page.id}/shares`, { releaseId, expiresInSeconds: 604800 });
    setFreshShare({ id: result.share.id, url: result.url });
    let copied = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(result.url);
        copied = true;
      }
    } catch {
      // Keep the one-time URL visible below when clipboard access is denied.
    }
    setShareNotice(copied ? 'Ссылка скопирована. Её также можно скопировать ниже.' : 'Ссылка создана. Скопируйте её ниже.');
  }
  async function revoke(id: string) {
    await del(`/api/admin/shares/${id}`);
    setFreshShare(current => current?.id === id ? null : current);
  }
  if (!hasLoadedData && loadState === 'loading') return <div class="workspace-state loading-state" role="status">Загружаем версии, ссылки и эксперименты…</div>;
  if (!hasLoadedData && loadState === 'error') return <div class="workspace-state error-state" role="alert">
    <p>Не удалось загрузить данные страницы: {loadError}</p>
    <button type="button" disabled={Boolean(pendingAction)} onClick={() => void load().catch(() => undefined)}>Повторить</button>
  </div>;

  return <div>
    {loadState === 'loading' && <p class="loading-state" role="status">Обновляем данные страницы…</p>}
    {loadState === 'error' && <div class="error-state inline-load-error" role="alert"><p>Не удалось обновить страницу: {loadError}</p><button type="button" disabled={Boolean(pendingAction)} onClick={() => void load().catch(() => undefined)}>Повторить</button></div>}
    {operationError && <p class="inline-error" role="alert">{operationError}</p>}
    <div class="tabs page-tabs">
      <button class={pageSection === 'versions' ? 'active' : ''} onClick={() => setPageSection('versions')}>Версии</button>
      <button class={pageSection === 'experiments' ? 'active' : ''} onClick={() => setPageSection('experiments')}>Experiments</button>
    </div>
    {pageSection === 'versions' && <div class="detail-grid">
    <div><h3>Draft</h3>{open ? <div class="draft">
      <b>Open draft</b><div class="small muted">revision {open.revision}</div>
      {permissions.edit && <div class="row"><button class="primary" disabled={Boolean(pendingAction) || loadState !== 'ready'} onClick={() => void runAction('launch', launch, { refresh: false })}>{pendingAction === 'launch' ? 'Открываем…' : 'Открыть редактор'}</button>
        {permissions.publish && <button disabled={Boolean(pendingAction) || loadState !== 'ready'} onClick={() => void runAction('publish', publish)}>{pendingAction === 'publish' ? 'Публикуем…' : 'Зафиксировать версию'}</button>}
      </div>}
    </div> : permissions.edit ? <button disabled={Boolean(pendingAction) || loadState !== 'ready'} onClick={() => void runAction('create-draft', createDraft)}>{pendingAction === 'create-draft' ? 'Создаём…' : 'Создать draft'}</button> : <p class="muted">Открытого draft нет.</p>}</div>
    <div><h3>Share links</h3>{shares.filter(shareItem => !shareItem.revokedAt).length === 0 ? <p class="muted">Активных ссылок пока нет.</p> : shares.filter(shareItem => !shareItem.revokedAt).map(item => <div class="share" key={item.id}>
      <span>v{item.version}</span> <span class="small muted">до {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '∞'}</span>
      {permissions.publish && <button class="danger" disabled={Boolean(pendingAction) || loadState !== 'ready'} onClick={() => void runAction(`revoke-share-${item.id}`, () => revoke(item.id))}>{pendingAction === `revoke-share-${item.id}` ? 'Отзываем…' : 'Отозвать'}</button>}
    </div>)}</div>
    <div class="wide"><h3>Immutable releases</h3>{releases.length === 0 ? <p class="muted">Публикаций ещё нет.</p> : releases.map(item => <div class="release row" key={item.id}>
      <b>Version {item.version}</b><span class="muted">{item.operationCount} команд</span>
      <span class={`small ${item.sourceSnapshot ? 'success' : 'muted'}`}>{item.sourceSnapshot ? `fingerprint ${item.sourceSnapshot.pageHash.slice(0, 8)}` : 'без fingerprint'}</span>
      {permissions.publish && <button disabled={Boolean(pendingAction) || loadState !== 'ready'} onClick={() => void runAction(`share-${item.id}`, () => share(item.id))}>{pendingAction === `share-${item.id}` ? 'Создаём ссылку…' : 'Share'}</button>}
    </div>)}</div>
    </div>}
    {freshShare && <div class="fresh-share" aria-live="polite">
      <strong>Новая ссылка на версию</strong>
      {shareNotice && <p class="muted small">{shareNotice}</p>}
      <div class="row"><input aria-label="Share URL" readonly value={freshShare.url} onFocus={event => event.currentTarget.select()} />
        <button type="button" onClick={() => {
          if (!navigator.clipboard) { setShareNotice('Автокопирование недоступно. Выделите ссылку и скопируйте её вручную.'); return; }
          void navigator.clipboard.writeText(freshShare.url).then(
            () => setShareNotice('Ссылка скопирована.'),
            () => setShareNotice('Не удалось скопировать автоматически. Выделите ссылку и скопируйте её вручную.'),
          );
        }}>Копировать</button>
      </div>
    </div>}
    {pageSection === 'experiments' && <ExperimentsPanel
      page={page}
      releases={releases}
      experiments={experiments}
      permissions={permissions}
      reload={load}
      mutationsEnabled={loadState === 'ready'}
    />}
  </div>;
}

