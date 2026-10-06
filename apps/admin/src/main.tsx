import {OnboardingPanel,SitemapImport} from './onboarding-panel';
import {ConnectionPanel} from './connection-panel';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { ApiError, api, post } from './api';
import type {
  Page,
  Project,
  ProjectAccess,
} from './api';
import { MembersPanel, roleLabel } from './members-panel';
import { PageWorkspace } from './page-workspace';
import { errorMessage, useAsyncAction } from './use-async-action';

type Session = { user: { id: string; email: string }; expiresAt: string };
type LoadState = 'loading' | 'ready' | 'error';
const INVALID_LINK_MESSAGE = 'Ссылка недействительна, уже использована или срок её действия истёк. Запросите новую ссылку.';
const invalidLink = new URLSearchParams(location.search).get('authError') === 'invalid-link';

function App() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [localLoginEnabled, setLocalLoginEnabled] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const sessionRequest = useRef(0);

  async function loadSession() {
    const request = ++sessionRequest.current;
    setSessionLoading(true);
    setSessionError('');
    try {
      const result = await api<Session>('/api/auth/session');
      if (request === sessionRequest.current) setSession(result);
    } catch (error) {
      if (request !== sessionRequest.current) return;
      if (error instanceof ApiError && error.status === 401) setSession(null);
      else {
        setSession(undefined);
        setSessionError(errorMessage(error));
      }
    } finally {
      if (request === sessionRequest.current) setSessionLoading(false);
    }
  }

  useEffect(() => {
    void api<{ enabled: boolean }>('/api/auth/dev-login')
      .then(result => setLocalLoginEnabled(result.enabled))
      .catch(() => setLocalLoginEnabled(false));
    void loadSession();
  }, []);
  if (sessionLoading) return <div class="login card loading-state" role="status">Загружаем сессию…</div>;
  if (sessionError) return <main class="login card error-state" role="alert">
    <h1>Не удалось проверить сессию</h1>
    <p>{sessionError}</p>
    <button type="button" class="primary" onClick={() => void loadSession()}>Повторить</button>
  </main>;
  if (!session) return <Login localLoginEnabled={localLoginEnabled} />;
  return <>{invalidLink && <p class="login card inline-error" role="alert">{INVALID_LINK_MESSAGE} Вы уже вошли в аккаунт.</p>}<Dashboard session={session} allowLocal={localLoginEnabled} /></>;
}

function Login({ localLoginEnabled }: { localLoginEnabled: boolean }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(invalidLink ? INVALID_LINK_MESSAGE : '');
  const [pending, setPending] = useState<'email' | 'local' | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [, setTimerTick] = useState(0);
  const secondsLeft = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setTimerTick(tick => tick + 1), 250);
    return () => clearInterval(timer);
  }, [retryAt]);
  async function submit(event: Event) {
    event.preventDefault();
    if (pending || retryAt > Date.now()) return;
    setPending('email');
    setError('');
    setStatus('');
    try {
      const result = await post<{ accepted: boolean; retryAfterSeconds?: number }>('/api/auth/magic-link', { email });
      setRetryAt(Date.now() + (result.retryAfterSeconds ?? 0) * 1000);
      setStatus('Проверьте почту. Запрос на отправку ссылки принят. При первом входе мы создадим ваш аккаунт.');
    } catch (reason) {
      setError(errorMessage(reason));
      if (reason instanceof ApiError && reason.retryAfterSeconds) setRetryAt(Date.now() + reason.retryAfterSeconds * 1000);
    } finally {
      setPending(null);
    }
  }
  async function localLogin() {
    if (pending) return;
    setPending('local');
    setError('');
    setStatus('');
    try {
      await post('/api/auth/dev-login', {});
      location.reload();
    } catch (error) {
      setError(errorMessage(error));
      setPending(null);
    }
  }
  return <main class="login card">
    <h1>Lykar Admin</h1>
    <p class="muted">Регистрация и вход по email. Подтвердите адрес одноразовой ссылкой из письма.</p>
    {localLoginEnabled && <>
      <button type="button" class="primary" disabled={Boolean(pending)} onClick={() => void localLogin()}>{pending === 'local' ? 'Входим…' : 'Войти как локальный владелец'}</button>
      <p class="muted small">Доступно только в локальном режиме разработки.</p>
    </>}
    <form class="form" onSubmit={submit}>
      <label for="login-email">Email</label>
      <input id="login-email" name="email" disabled={Boolean(pending)} type="email" autoComplete="email" required value={email} onInput={event => { setEmail(event.currentTarget.value); setStatus(''); setRetryAt(0); }} placeholder="you@example.com" />
      <button class="primary" disabled={Boolean(pending) || secondsLeft > 0}>{pending === 'email' ? 'Отправляем…' : secondsLeft > 0 ? `Повторить через ${secondsLeft} сек.` : status ? 'Отправить повторно' : 'Получить ссылку'}</button>
    </form>
    {error && <p class="inline-error" role="alert">{error}</p>}
    {status && <p class="success" role="status">{status}</p>}
  </main>;
}

function Dashboard({ session,allowLocal }: { session: Session;allowLocal:boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState('');
  const [access, setAccess] = useState<ProjectAccess | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [section, setSection] = useState<'pages' | 'members' | 'connection' | 'onboarding'>(()=>{const value=new URLSearchParams(location.search).get('section');return value==='onboarding'||value==='members'||value==='connection'?value:'pages';});
  const [projectsState, setProjectsState] = useState<LoadState>('loading');
  const [projectsError, setProjectsError] = useState('');
  const [projectDetailsState, setProjectDetailsState] = useState<LoadState>('loading');
  const [projectDetailsError, setProjectDetailsError] = useState('');
  const [loadedProjectId, setLoadedProjectId] = useState('');
  const projectListRequest = useRef(0);
  const projectDetailsRequest = useRef(0);
  const accessRequest = useRef(0);
  const selectedProjectId = useRef('');
  const project = projects.find(item => item.id === projectId);
  const page = pages.find(item => item.id === pageId);

  async function loadProjects() {
    const request = ++projectListRequest.current;
    setProjectsState('loading');
    setProjectsError('');
    try {
      const result = await api<{ projects: Project[] }>('/api/admin/projects');
      if (request !== projectListRequest.current) return;
      setProjects(result.projects);
      const current = selectedProjectId.current;
      const requested = new URLSearchParams(location.search).get('project');
      const next = result.projects.some(item => item.id === current)
        ? current
        : result.projects.find(item => item.id === requested)?.id ?? result.projects[0]?.id ?? '';
      selectedProjectId.current = next;
      setProjectId(next);
      setProjectsState('ready');
    } catch (reason) {
      if (request === projectListRequest.current) {
        setProjectsError(errorMessage(reason));
        setProjectsState('error');
      }
    }
  }

  async function loadProjectDetails(id: string) {
    if (id !== selectedProjectId.current) return;
    const request = ++projectDetailsRequest.current;
    const selectedPageId = pageId || new URLSearchParams(location.search).get('page') || '';
    accessRequest.current += 1;
    setLoadedProjectId('');
    setProjectDetailsState('loading');
    setProjectDetailsError('');
    setPages([]);
    setAccess(null);
    try {
      const [pageResult, accessResult] = await Promise.all([
        api<{ pages: Page[] }>(`/api/admin/projects/${id}/pages`),
        api<ProjectAccess>(`/api/admin/projects/${id}/members`),
      ]);
      if (request !== projectDetailsRequest.current || id !== selectedProjectId.current) return;
      setPages(pageResult.pages);
      setPageId(pageResult.pages.some(item => item.id === selectedPageId)
        ? selectedPageId
        : pageResult.pages[0]?.id ?? '');
      setAccess(accessResult);
      setLoadedProjectId(id);
      setProjectDetailsState('ready');
    } catch (reason) {
      if (request === projectDetailsRequest.current && id === selectedProjectId.current) {
        setProjectDetailsError(errorMessage(reason));
        setProjectDetailsState('error');
      }
    }
  }

  async function loadAccess(id: string) {
    if (id !== selectedProjectId.current) return;
    const request = ++accessRequest.current;
    const result = await api<ProjectAccess>(`/api/admin/projects/${id}/members`);
    if (request === accessRequest.current && id === selectedProjectId.current && loadedProjectId === id) {
      setAccess(result);
    }
  }

  useEffect(() => { void loadProjects(); }, []);
  useEffect(() => {
    if (!projectId) {
      projectDetailsRequest.current += 1;
      setProjectDetailsState('ready');
      setLoadedProjectId('');
      setPages([]);
      setPageId('');
      setAccess(null);
      return;
    }
    void loadProjectDetails(projectId);
    return () => { projectDetailsRequest.current += 1; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const url=new URL(location.href);url.searchParams.set('project',projectId);url.searchParams.set('section',section);
    if(pageId)url.searchParams.set('page',pageId);
    history.replaceState(null,'',url);
  }, [projectId,pageId,section]);

  async function logout() {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError('');
    try {
      await post('/api/auth/logout', {});
      location.replace('/admin/');
    } catch (reason) {
      setLogoutError(errorMessage(reason));
      setLogoutPending(false);
    }
  }

  const detailsReady = Boolean(projectId) && loadedProjectId === projectId && projectDetailsState === 'ready';
  return <main class="shell">
    <header>
      <h1>Lykar</h1><span class="badge">Управление сайтами</span>
      <span class="user">{session.user.email}</span>
      <button disabled={logoutPending} onClick={() => void logout()}>{logoutPending ? 'Выходим…' : 'Выйти'}</button>
    </header>
    {logoutError && <p class="inline-error" role="alert">Не удалось выйти: {logoutError}</p>}
    <div class="grid">
      <aside class="card">
        <ProjectCreate allowLocal={allowLocal} onCreated={async id=>{selectedProjectId.current=id;setSection('onboarding');await loadProjects();}} />
        <h2>Сайты</h2>
        {projectsState === 'loading' && <p class="loading-state" role="status">Загружаем сайты…</p>}
        {projectsState === 'error' && <div class="error-state" role="alert"><p>Не удалось загрузить сайты: {projectsError}</p><button type="button" onClick={() => void loadProjects()}>Повторить</button></div>}
        {projectsState === 'ready' && projects.length === 0 && <p class="muted">Сайтов пока нет.</p>}
        <div class="list">{projects.map(item => <button
          key={item.id}
          class={`list-item ${item.id === projectId ? 'active' : ''}`}
          onClick={() => { selectedProjectId.current = item.id; setProjectId(item.id); }}
        ><span>{item.name}</span><small>{item.origins[0]}</small></button>)}</div>
      </aside>
      <section class="card">{project ? <>
        <div class="row project-heading">
          <div><h2>{project.name}</h2><div class="muted small">{project.publicKey}</div></div>
          {detailsReady && access && <span class={`badge role-${access.actorRole}`}>{roleLabel(access.actorRole)}</span>}
        </div>
        <div class="tabs">
          <button class={section === 'onboarding' ? 'active' : ''} onClick={() => setSection('onboarding')}>Мастер подключения</button>
          <button class={section === 'pages' ? 'active' : ''} onClick={() => setSection('pages')}>Страницы</button>
          <button class={section === 'members' ? 'active' : ''} onClick={() => setSection('members')}>Участники</button>
          <button class={section === 'connection' ? 'active' : ''} onClick={() => setSection('connection')}>Подключение</button>
        </div>
        {!detailsReady && projectDetailsState !== 'error' && <p class="loading-state" role="status">Загружаем страницы и доступ…</p>}
        {!detailsReady && projectDetailsState === 'error' && <div class="error-state" role="alert"><p>Не удалось загрузить данные сайта: {projectDetailsError}</p><button type="button" onClick={() => void loadProjectDetails(project.id)}>Повторить</button></div>}
        {detailsReady && section === 'onboarding' && access && <OnboardingPanel key={project.id} project={project} pages={pages} page={page} access={access} userId={session.user.id} onPage={setPageId} reload={async()=>{await loadProjects();await loadProjectDetails(project.id);}}/>}
        {detailsReady && section === 'pages' && <>
          {access?.permissions.publish && <PageCreate projectId={project.id} onCreated={() => loadProjectDetails(project.id)} />}
            {access?.permissions.publish && <SitemapImport project={project} reload={()=>loadProjectDetails(project.id)}/>}
            <h3>Страницы</h3>
            {pages.length === 0 ? <p class="muted">В этом сайте пока нет страниц.</p> : <div class="row">{pages.map(item => <button key={item.id} class={item.id === pageId ? 'active' : ''} onClick={() => setPageId(item.id)}>
              {item.name} <span class="muted">{item.pathname}</span>
            </button>)}</div>}
            {page && access && <PageWorkspace key={page.id} page={page} project={project!} permissions={access.permissions} members={access.members} />}
        </>}
        {section === 'connection' && detailsReady && page && access && <ConnectionPanel key={`${project.id}:${page.id}`} project={project} page={page} canManage={access.permissions.manageMembers} canProbe={access.permissions.edit} />}
        {section === 'members' && detailsReady && access && <MembersPanel
          access={access}
          currentUserId={session.user.id}
          projectId={project.id}
          reload={() => loadAccess(project.id)}
        />}
      </> : projectsState === 'loading' ? <p class="loading-state" role="status">Загружаем сайт…</p>
        : projectsState === 'error' ? <p class="muted">Список сайтов пока недоступен.</p>
          : <p class="muted">Создайте первый сайт.</p>}</section>
    </div>
  </main>;
}

function ProjectCreate({ onCreated,allowLocal }: { onCreated: (id:string) => Promise<void>;allowLocal:boolean }) {
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('');
  const { pendingAction, actionError, runAction } = useAsyncAction(async()=>{}, true, 'Список сайтов изменился.');
  async function submit(event: Event) {
    event.preventDefault();
    await runAction('create', async () => {
      const url=new URL(origin);
      const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&!(allowLocal&&local&&url.protocol==='http:'))) throw new Error('Укажите HTTPS-адрес сайта без пути, параметров и данных входа. HTTP допустим только для локальной разработки.');
      if((local&&!allowLocal)||(!local&&(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(url.hostname)||/\.(?:local|localhost|internal|home|lan|test|invalid|onion)$/i.test(url.hostname)))) throw new Error('Нужен публичный DNS-домен сайта. Локальные адреса доступны только в режиме разработки.');
      const result=await post<{project:Project}>('/api/admin/projects', { name, origins: [url.origin] });
      setName('');setOrigin('');await onCreated(result.project.id);
    });
  }
  return <form class="form" onSubmit={submit}>
    <h2>Новый сайт</h2>
    <label>Название сайта<input required value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Название" /></label>
    <label>Адрес сайта<input required type="url" value={origin} onInput={event => setOrigin(event.currentTarget.value)} placeholder="https://example.com" /></label>
    <button class="primary" disabled={Boolean(pendingAction)}>{pendingAction ? 'Создаём…' : 'Создать'}</button>
    {actionError && <p class="inline-error" role="alert">{actionError}</p>}
  </form>;
}

function PageCreate({ projectId, onCreated }: { projectId: string; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [pathname, setPath] = useState('/pricing');
  const { pendingAction, actionError, runAction } = useAsyncAction(onCreated, true, 'Список страниц изменился.');
  async function submit(event: Event) {
    event.preventDefault();
    await runAction('create', async () => {
      await post(`/api/admin/projects/${projectId}/pages`, { name, pathname });
      setName('');
    });
  }
  return <form class="row" onSubmit={submit}>
    <input aria-label="Название страницы" required value={name} onInput={event => setName(event.currentTarget.value)} placeholder="Новая страница" />
    <input aria-label="Путь страницы" required value={pathname} onInput={event => setPath(event.currentTarget.value)} placeholder="/pricing" />
    <button disabled={Boolean(pendingAction)}>{pendingAction ? 'Добавляем…' : 'Добавить'}</button>
    {actionError && <p class="inline-error" role="alert">{actionError}</p>}
  </form>;
}

render(<App />, document.getElementById('app')!);
