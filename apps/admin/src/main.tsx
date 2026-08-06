import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { ApiError, api, del, patch, post } from './api';
import type {
  Draft,
  Experiment,
  ExperimentAnalyticsReport,
  ExperimentVariant,
  ExperimentVariantKey,
  Page,
  Project,
  ProjectAccess,
  ProjectInvitation,
  ProjectMember,
  ProjectPermissions,
  ProjectRole,
  Release,
  Share,
} from './api';

type Session = { user: { id: string; email: string }; expiresAt: string };
type InvitableRole = Exclude<ProjectRole, 'owner'>;

function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  useEffect(() => {
    void api<Session>('/api/auth/session').then(setSession).catch(error => {
      if (error instanceof ApiError && error.status === 401) setSession(null);
      else throw error;
    });
  }, []);
  if (session === undefined) return <div class="login card">Загрузка…</div>;
  if (!session) return <Login />;
  return <Dashboard session={session} />;
}

function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  async function submit(event: Event) {
    event.preventDefault();
    await post('/api/auth/magic-link', { email });
    setStatus('Ссылка создана. В localhost она напечатана в terminal API.');
  }
  return <main class="login card">
    <h1>Lykar Admin</h1>
    <p class="muted">Вход без пароля по magic link.</p>
    <form class="form" onSubmit={submit}>
      <input type="email" required value={email} onInput={event => setEmail(event.currentTarget.value)} placeholder="you@example.com" />
      <button class="primary">Получить ссылку</button>
    </form>
    {status && <p class="success">{status}</p>}
  </main>;
}

function Dashboard({ session }: { session: Session }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState('');
  const [access, setAccess] = useState<ProjectAccess | null>(null);
  const [section, setSection] = useState<'pages' | 'members'>('pages');
  const [error, setError] = useState('');
  const project = projects.find(item => item.id === projectId);
  const page = pages.find(item => item.id === pageId);

  async function loadProjects() {
    const result = await api<{ projects: Project[] }>('/api/admin/projects');
    setProjects(result.projects);
    setProjectId(current => {
      if (result.projects.some(projectItem => projectItem.id === current)) return current;
      const requested = new URLSearchParams(location.search).get('project');
      return result.projects.find(projectItem => projectItem.id === requested)?.id ?? result.projects[0]?.id ?? '';
    });
  }

  async function loadPages(id: string) {
    const result = await api<{ pages: Page[] }>(`/api/admin/projects/${id}/pages`);
    setPages(result.pages);
    setPageId(current => result.pages.some(pageItem => pageItem.id === current) ? current : result.pages[0]?.id ?? '');
  }

  async function loadAccess(id: string) {
    setAccess(await api<ProjectAccess>(`/api/admin/projects/${id}/members`));
  }

  useEffect(() => { void loadProjects().catch(show); }, []);
  useEffect(() => {
    if (!projectId) return;
    setAccess(null);
    void Promise.all([loadPages(projectId), loadAccess(projectId)]).catch(show);
  }, [projectId]);

  function show(reason: unknown) {
    setError(reason instanceof Error ? reason.message : String(reason));
  }

  async function logout() {
    await post('/api/auth/logout', {});
    location.reload();
  }

  return <main class="shell">
    <header>
      <h1>Lykar</h1><span class="badge">localhost</span>
      <span class="user">{session.user.email}</span>
      <button onClick={() => void logout()}>Выйти</button>
    </header>
    {error && <p class="error">{error}</p>}
    <div class="grid">
      <aside class="card">
        <ProjectCreate onCreated={() => void loadProjects()} />
        <h2>Сайты</h2>
        <div class="list">{projects.map(item => <button
          key={item.id}
          class={`list-item ${item.id === projectId ? 'active' : ''}`}
          onClick={() => setProjectId(item.id)}
        ><span>{item.name}</span><small>{item.origins[0]}</small></button>)}</div>
      </aside>
      <section class="card">{project ? <>
        <div class="row project-heading">
          <div><h2>{project.name}</h2><div class="muted small">{project.publicKey}</div></div>
          {access && <span class={`badge role-${access.actorRole}`}>{roleLabel(access.actorRole)}</span>}
        </div>
        <div class="tabs">
          <button class={section === 'pages' ? 'active' : ''} onClick={() => setSection('pages')}>Страницы</button>
          <button class={section === 'members' ? 'active' : ''} onClick={() => setSection('members')}>Участники</button>
        </div>
        {section === 'pages' && <>
          {access?.permissions.publish && <PageCreate projectId={project.id} onCreated={() => void loadPages(project.id)} />}
          <h3>Страницы</h3>
          <div class="row">{pages.map(item => <button key={item.id} class={item.id === pageId ? 'active' : ''} onClick={() => setPageId(item.id)}>
            {item.name} <span class="muted">{item.pathname}</span>
          </button>)}</div>
          {page && access && <PageWorkspace page={page} permissions={access.permissions} showError={show} />}
        </>}
        {section === 'members' && access && <MembersPanel
          access={access}
          currentUserId={session.user.id}
          projectId={project.id}
          reload={() => loadAccess(project.id)}
          showError={show}
        />}
      </> : <p class="muted">Создайте первый сайт.</p>}</section>
    </div>
  </main>;
}

function ProjectCreate({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('http://localhost:4173');
  async function submit(event: Event) {
    event.preventDefault();
    await post('/api/admin/projects', { name, origins: [origin] });
    setName('');
    onCreated();
  }
  return <form class="form" onSubmit={submit}>
    <h2>Новый сайт</h2>
    <input required value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Название" />
    <input required value={origin} onInput={event => setOrigin(event.currentTarget.value)} placeholder="http://localhost:4173" />
    <button class="primary">Создать</button>
  </form>;
}

function PageCreate({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [pathname, setPath] = useState('/pricing');
  async function submit(event: Event) {
    event.preventDefault();
    await post(`/api/admin/projects/${projectId}/pages`, { name, pathname });
    setName('');
    onCreated();
  }
  return <form class="row" onSubmit={submit}>
    <input required value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Новая страница" />
    <input required value={pathname} onInput={event => setPath(event.currentTarget.value)} placeholder="/pricing" />
    <button>Добавить</button>
  </form>;
}

function PageWorkspace({ page, permissions, showError }: {
  page: Page;
  permissions: ProjectPermissions;
  showError: (error: unknown) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [pageSection, setPageSection] = useState<'versions' | 'experiments'>('versions');
  async function load() {
    const [draftResult, releaseResult, shareResult, experimentResult] = await Promise.all([
      api<{ drafts: Draft[] }>(`/api/admin/pages/${page.id}/drafts`),
      api<{ releases: Release[] }>(`/api/admin/pages/${page.id}/releases`),
      api<{ shares: Share[] }>(`/api/admin/pages/${page.id}/shares`),
      api<{ experiments: Experiment[] }>(`/api/admin/pages/${page.id}/experiments`),
    ]);
    setDrafts(draftResult.drafts);
    setReleases(releaseResult.releases);
    setShares(shareResult.shares);
    setExperiments(experimentResult.experiments);
  }
  useEffect(() => { void load().catch(showError); }, [page.id]);
  const open = drafts.find(draft => draft.status === 'open');
  async function createDraft() { await post(`/api/admin/pages/${page.id}/drafts`, {}); await load(); }
  async function launch() {
    if (!open) return;
    const result = await post<{ launchUrl: string }>(`/api/admin/pages/${page.id}/editor-launch`, { draftId: open.id });
    window.open(result.launchUrl, '_blank', 'noopener');
  }
  async function publish() {
    if (!open) return;
    await post(`/api/admin/drafts/${open.id}/publish`, { expectedRevision: open.revision });
    await load();
  }
  async function share(releaseId: string) {
    const result = await post<{ url: string }>(`/api/admin/pages/${page.id}/shares`, { releaseId, expiresInSeconds: 604800 });
    await navigator.clipboard?.writeText(result.url);
    await load();
    alert(`Share URL скопирован:\n${result.url}`);
  }
  async function revoke(id: string) { await del(`/api/admin/shares/${id}`); await load(); }
  return <div>
    <div class="tabs page-tabs">
      <button class={pageSection === 'versions' ? 'active' : ''} onClick={() => setPageSection('versions')}>Версии</button>
      <button class={pageSection === 'experiments' ? 'active' : ''} onClick={() => setPageSection('experiments')}>Experiments</button>
    </div>
    {pageSection === 'versions' && <div class="detail-grid">
    <div><h3>Draft</h3>{open ? <div class="draft">
      <b>Open draft</b><div class="small muted">revision {open.revision}</div>
      {permissions.edit && <div class="row"><button class="primary" onClick={() => void launch().catch(showError)}>Открыть редактор</button>
        {permissions.publish && <button onClick={() => void publish().catch(showError)}>Зафиксировать версию</button>}
      </div>}
    </div> : permissions.edit ? <button onClick={() => void createDraft().catch(showError)}>Создать draft</button> : <p class="muted">Открытого draft нет.</p>}</div>
    <div><h3>Share links</h3>{shares.filter(shareItem => !shareItem.revokedAt).map(item => <div class="share" key={item.id}>
      <span>v{item.version}</span> <span class="small muted">до {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : '∞'}</span>
      {permissions.publish && <button class="danger" onClick={() => void revoke(item.id).catch(showError)}>Отозвать</button>}
    </div>)}</div>
    <div class="wide"><h3>Immutable releases</h3>{releases.length === 0 ? <p class="muted">Публикаций ещё нет.</p> : releases.map(item => <div class="release row" key={item.id}>
      <b>Version {item.version}</b><span class="muted">{item.operationCount} команд</span>
      <span class={`small ${item.sourceSnapshot ? 'success' : 'muted'}`}>{item.sourceSnapshot ? `fingerprint ${item.sourceSnapshot.pageHash.slice(0, 8)}` : 'без fingerprint'}</span>
      {permissions.publish && <button onClick={() => void share(item.id).catch(showError)}>Share</button>}
    </div>)}</div>
    </div>}
    {pageSection === 'experiments' && <ExperimentsPanel
      page={page}
      releases={releases}
      experiments={experiments}
      permissions={permissions}
      reload={load}
      showError={showError}
    />}
  </div>;
}

function ExperimentsPanel({ page, releases, experiments, permissions, reload, showError }: {
  page: Page;
  releases: Release[];
  experiments: Experiment[];
  permissions: ProjectPermissions;
  reload: () => Promise<void>;
  showError: (error: unknown) => void;
}) {
  const [name, setName] = useState('Control vs Variant B');
  const [aRelease, setARelease] = useState('native');
  const [bRelease, setBRelease] = useState('');
  const [aWeight, setAWeight] = useState(50);
  const [freshLinks, setFreshLinks] = useState<Record<string, { id: string; url: string }>>({});
  const [freshExperimentLinks, setFreshExperimentLinks] = useState<Record<string, { id: string; url: string }>>({});
  const [reports, setReports] = useState<Record<string, ExperimentAnalyticsReport>>({});

  useEffect(() => {
    if (!bRelease && releases[0]) setBRelease(releases[0].id);
  }, [releases]);

  async function create(event: Event) {
    event.preventDefault();
    await post(`/api/admin/pages/${page.id}/experiments`, {
      name,
      variants: [
        { key: 'A', releaseId: aRelease === 'native' ? null : aRelease, description: 'Control', weightBps: aWeight * 100 },
        { key: 'B', releaseId: bRelease || null, description: 'Treatment', weightBps: (100 - aWeight) * 100 },
      ],
    });
    setName('Control vs Variant B');
    await reload();
  }

  async function transition(id: string, action: 'activate' | 'pause' | 'complete', winnerVariantKey?: ExperimentVariantKey | null) {
    await post(`/api/admin/experiments/${id}/${action}`, action === 'complete' ? { winnerVariantKey } : {});
    await reload();
  }

  async function updateVariant(experimentId: string, variant: ExperimentVariant, releaseId: string) {
    await patch(`/api/admin/experiments/${experimentId}/variants/${variant.key}`, {
      releaseId: releaseId === 'native' ? null : releaseId,
      description: variant.description,
      weightBps: variant.weightBps,
    });
    await reload();
  }

  async function updateWeight(experiment: Experiment, percentA: number) {
    const variant = experiment.variants[0];
    await patch(`/api/admin/experiments/${experiment.id}/variants/A`, {
      releaseId: variant.releaseId,
      description: variant.description,
      weightBps: percentA * 100,
    });
    await reload();
  }

  async function createLink(experimentId: string, key: ExperimentVariantKey) {
    const result = await post<{ link: { id: string }; url: string }>(`/api/admin/experiments/${experimentId}/variants/${key}/links`, {});
    void navigator.clipboard?.writeText(result.url).catch(() => undefined);
    await reload();
    setFreshLinks(current => ({ ...current, [`${experimentId}:${key}`]: { id: result.link.id, url: result.url } }));
  }

  function copyFreshLink(url: string) {
    void navigator.clipboard?.writeText(url).catch(showError);
  }

  async function revokeLink(linkId: string) {
    await del(`/api/admin/variant-links/${linkId}`);
    setFreshLinks(current => Object.fromEntries(
      Object.entries(current).filter(([, link]) => link.id !== linkId),
    ));
    await reload();
  }


  async function createExperimentLink(experimentId: string) {
    const result = await post<{ link: { id: string }; url: string }>(`/api/admin/experiments/${experimentId}/links`, {});
    void navigator.clipboard?.writeText(result.url).catch(() => undefined);
    await reload();
    setFreshExperimentLinks(current => ({ ...current, [experimentId]: { id: result.link.id, url: result.url } }));
  }

  async function revokeExperimentLink(linkId: string) {
    await del(`/api/admin/experiment-links/${linkId}`);
    setFreshExperimentLinks(current => Object.fromEntries(
      Object.entries(current).filter(([, link]) => link.id !== linkId),
    ));
    await reload();
  }

  async function loadReport(experimentId: string) {
    const result = await api<{ report: ExperimentAnalyticsReport }>(`/api/admin/experiments/${experimentId}/analytics`);
    setReports(current => ({ ...current, [experimentId]: result.report }));
  }

  return <div class="experiments-panel">
    {permissions.edit && releases.length > 0 && <form class="form experiment-create" onSubmit={event => void create(event).catch(showError)}>
      <h3>Новый эксперимент</h3>
      <input required value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Название эксперимента" />
      <div class="row">
        <label>Variant A <ReleaseSelect releases={releases} value={aRelease} onChange={setARelease} /></label>
        <label>Variant B <ReleaseSelect releases={releases} value={bRelease} onChange={setBRelease} /></label>
        <label>Трафик A, % <input type="number" min="1" max="99" value={aWeight} onInput={event => setAWeight(Number(event.currentTarget.value))} /></label>
        <span class="small muted">B: {100 - aWeight}%</span>
        <button class="primary" disabled={!bRelease || !Number.isInteger(aWeight) || aWeight < 1 || aWeight > 99}>Создать</button>
      </div>
    </form>}
    {releases.length === 0 && <p class="muted">Сначала зафиксируйте хотя бы одну immutable release.</p>}
    <div class="experiment-list">{experiments.map(experiment => {
      const freshExperimentLink = freshExperimentLinks[experiment.id];
      const report = reports[experiment.id];
      return <article class="experiment" key={experiment.id}>
      <div class="row experiment-heading">
        <div><h3>{experiment.name}</h3><span class={`badge experiment-${experiment.status}`}>{experiment.status}</span>
          {experiment.winnerVariantKey && <span class="badge winner">Победитель: {experiment.winnerVariantKey}</span>}
        </div>
        {permissions.publish && <div class="row">
          {(experiment.status === 'draft' || experiment.status === 'paused') && <button class="primary" onClick={() => void transition(experiment.id, 'activate').catch(showError)}>Запустить</button>}
          {experiment.status === 'active' && <button onClick={() => void transition(experiment.id, 'pause').catch(showError)}>Пауза</button>}
          {(experiment.status === 'active' || experiment.status === 'paused') && <>
            <button onClick={() => void transition(experiment.id, 'complete', 'A').catch(showError)}>Завершить · A</button>
            <button onClick={() => void transition(experiment.id, 'complete', 'B').catch(showError)}>Завершить · B</button>
            <button class="danger" onClick={() => void transition(experiment.id, 'complete', null).catch(showError)}>Без победителя</button>
          </>}
        </div>}
      </div>
      <div class="experiment-delivery">
        <b>Распределение: {experiment.variants[0].weightBps / 100}% / {experiment.variants[1].weightBps / 100}%</b>
        {experiment.status === 'draft' && permissions.edit && <VariantWeightEditor
          value={experiment.variants[0].weightBps / 100}
          onSave={value => updateWeight(experiment, value)}
          showError={showError}
        />}
        {experiment.status === 'active' && permissions.publish && <button onClick={() => void createExperimentLink(experiment.id).catch(showError)}>Создать A/B-ссылку</button>}
        {freshExperimentLink && <div class="row small fresh-variant-link">
          <a href={freshExperimentLink.url} target="_blank" rel="noreferrer">Открыть A/B-ссылку</a>
          <button onClick={() => copyFreshLink(freshExperimentLink.url)}>Копировать</button>
        </div>}
        {experiment.links.filter(link => !link.revokedAt).map(link => <div class="row small" key={link.id}>
          <span>A/B token …{link.tokenHint}</span>
          {permissions.publish && <button class="danger" onClick={() => void revokeExperimentLink(link.id).catch(showError)}>Отозвать</button>}
        </div>)}
      </div>
      <div class="variant-grid">{experiment.variants.map(variant => {
        const freshLink = freshLinks[`${experiment.id}:${variant.key}`];
        return <section class="variant" key={variant.id}>
          <h4>Variant {variant.key}</h4>
          {experiment.status === 'draft' && permissions.edit
            ? <ReleaseSelect releases={releases} value={variant.releaseId ?? 'native'} onChange={value => void updateVariant(experiment.id, variant, value).catch(showError)} />
            : <p>{variant.releaseVersion === null ? 'Исходная страница' : `Version ${variant.releaseVersion}`}</p>}
          {variant.description && <p class="small muted">{variant.description}</p>}
          {experiment.status === 'active' && permissions.publish && <button onClick={() => void createLink(experiment.id, variant.key).catch(showError)}>Создать ссылку</button>}
          {freshLink && <div class="row small fresh-variant-link">
            <a href={freshLink.url} target="_blank" rel="noreferrer">Открыть свежую ссылку</a>
            <button onClick={() => copyFreshLink(freshLink.url)}>Копировать</button>
          </div>}
          {variant.links.filter(link => !link.revokedAt).map(link => <div class="row small" key={link.id}>
            <span>token …{link.tokenHint}</span>
            {permissions.publish && <button class="danger" onClick={() => void revokeLink(link.id).catch(showError)}>Отозвать</button>}
          </div>)}
        </section>;
      })}</div>
      {permissions.publish && <div class="analytics-report">
        <button onClick={() => void loadReport(experiment.id).catch(showError)}>{report ? 'Обновить аналитику' : 'Показать аналитику'}</button>
        {report && <AnalyticsReport report={report} />}
      </div>}
    </article>;
    })}</div>
  </div>;
}

function VariantWeightEditor({ value, onSave, showError }: {
  value: number;
  onSave: (value: number) => Promise<void>;
  showError: (error: unknown) => void;
}) {
  const [percent, setPercent] = useState(value);
  useEffect(() => setPercent(value), [value]);
  return <div class="row weight-editor">
    <label>A <input type="number" min="1" max="99" value={percent} onInput={event => setPercent(Number(event.currentTarget.value))} />%</label>
    <span class="muted">B {100 - percent}%</span>
    <button disabled={!Number.isInteger(percent) || percent < 1 || percent > 99 || percent === value} onClick={() => void onSave(percent).catch(showError)}>Сохранить</button>
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

function ReleaseSelect({ releases, value, onChange }: { releases: Release[]; value: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={event => onChange(event.currentTarget.value)}>
    <option value="native">Исходная страница</option>
    {releases.map(release => <option value={release.id} key={release.id}>Version {release.version}</option>)}
  </select>;
}

function MembersPanel({ access, currentUserId, projectId, reload, showError }: {
  access: ProjectAccess;
  currentUserId: string;
  projectId: string;
  reload: () => Promise<void>;
  showError: (error: unknown) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('editor');
  const [status, setStatus] = useState('');
  async function invite(event: Event) {
    event.preventDefault();
    await post(`/api/admin/projects/${projectId}/invitations`, { email, role });
    setStatus(`Приглашение для ${email} создано.`);
    setEmail('');
    await reload();
  }
  async function changeRole(member: ProjectMember, nextRole: InvitableRole) {
    await patch(`/api/admin/projects/${projectId}/members/${member.id}`, { role: nextRole });
    await reload();
  }
  async function revokeMember(member: ProjectMember) {
    if (!confirm(`Отозвать доступ у ${member.email}?`)) return;
    await del(`/api/admin/projects/${projectId}/members/${member.id}`);
    await reload();
  }
  async function transfer(member: ProjectMember) {
    if (!confirm(`Передать ownership пользователю ${member.email}? Вы станете Admin.`)) return;
    await post(`/api/admin/projects/${projectId}/transfer-ownership`, { membershipId: member.id });
    await reload();
  }
  async function resend(invitation: ProjectInvitation) {
    await post(`/api/admin/invitations/${invitation.id}/resend`, {});
    setStatus(`Новая ссылка для ${invitation.email} создана.`);
    await reload();
  }
  async function cancel(invitation: ProjectInvitation) {
    if (!confirm(`Отозвать приглашение для ${invitation.email}?`)) return;
    await del(`/api/admin/invitations/${invitation.id}`);
    await reload();
  }
  return <div class="members-panel">
    {access.permissions.manageMembers && <form class="member-invite" onSubmit={event => void invite(event).catch(showError)}>
      <h3>Пригласить участника</h3>
      <div class="row">
        <input type="email" required value={email} onInput={event => setEmail(event.currentTarget.value)} placeholder="member@example.com" aria-label="Email участника" />
        <select value={role} onChange={event => setRole(event.currentTarget.value as InvitableRole)} aria-label="Роль приглашения">
          <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
        </select>
        <button class="primary">Пригласить</button>
      </div>
      {status && <p class="success">{status}</p>}
    </form>}
    <h3>Активные участники</h3>
    <div class="member-list">{access.members.map(member => {
      const mutable = access.permissions.manageMembers && member.userId !== currentUserId && member.role !== 'owner';
      return <div class="member-row" key={member.id}>
        <div><b>{member.email}</b>{member.userId === currentUserId && <span class="muted small"> · вы</span>}</div>
        {mutable ? <select
          value={member.role}
          onChange={event => void changeRole(member, event.currentTarget.value as InvitableRole).catch(showError)}
          aria-label={`Роль ${member.email}`}
        ><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select> : <span class={`badge role-${member.role}`}>{roleLabel(member.role)}</span>}
        <div class="member-actions">
          {access.permissions.transferOwnership && member.userId !== currentUserId && <button onClick={() => void transfer(member).catch(showError)}>Передать ownership</button>}
          {mutable && <button class="danger" onClick={() => void revokeMember(member).catch(showError)}>Отозвать доступ</button>}
        </div>
      </div>;
    })}</div>
    <h3>Ожидают принятия</h3>
    {access.invitations.length === 0 ? <p class="muted">Активных приглашений нет.</p> : <div class="member-list">{access.invitations.map(invitation => <div class="member-row" key={invitation.id}>
      <div><b>{invitation.email}</b><div class="small muted">{new Date(invitation.expiresAt) <= new Date() ? 'Истекло' : `Действует до ${new Date(invitation.expiresAt).toLocaleString()}`}</div></div>
      <span class={`badge role-${invitation.role}`}>{roleLabel(invitation.role)}</span>
      {access.permissions.manageMembers && <div class="member-actions"><button onClick={() => void resend(invitation).catch(showError)}>Отправить повторно</button><button class="danger" onClick={() => void cancel(invitation).catch(showError)}>Отозвать</button></div>}
    </div>)}</div>}
  </div>;
}

function roleLabel(role: ProjectRole): string {
  return ({ owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' })[role];
}

render(<App />, document.getElementById('app')!);
