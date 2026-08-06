import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { ApiError, api, del, post } from './api';
import type { Draft, Page, Project, Release, Share } from './api';

type Session = { user:{id:string;email:string}; expiresAt:string };

function App() {
  const [session,setSession] = useState<Session|null|undefined>();
  useEffect(() => { void api<Session>('/api/auth/session').then(setSession).catch(error => {
    if (error instanceof ApiError && error.status === 401) setSession(null); else throw error;
  }); }, []);
  if (session === undefined) return <div class="login card">Загрузка…</div>;
  if (!session) return <Login/>;
  return <Dashboard session={session}/>;
}

function Login() {
  const [email,setEmail] = useState(''); const [status,setStatus] = useState('');
  async function submit(event:Event) { event.preventDefault(); await post('/api/auth/magic-link',{email}); setStatus('Ссылка создана. В localhost она напечатана в terminal API.'); }
  return <main class="login card"><h1>Lykar Admin</h1><p class="muted">Вход без пароля по magic link.</p><form class="form" onSubmit={submit}><input type="email" required value={email} onInput={e=>setEmail(e.currentTarget.value)} placeholder="owner@example.com"/><button class="primary">Получить ссылку</button></form>{status&&<p class="success">{status}</p>}</main>;
}

function Dashboard({session}:{session:Session}) {
  const [projects,setProjects]=useState<Project[]>([]); const [projectId,setProjectId]=useState('');
  const [pages,setPages]=useState<Page[]>([]); const [pageId,setPageId]=useState(''); const [error,setError]=useState('');
  const project=projects.find(item=>item.id===projectId); const page=pages.find(item=>item.id===pageId);
  async function loadProjects(){ const result=await api<{projects:Project[]}>('/api/admin/projects'); setProjects(result.projects); if(!projectId&&result.projects[0]) setProjectId(result.projects[0].id); }
  async function loadPages(id:string){ const result=await api<{pages:Page[]}>(`/api/admin/projects/${id}/pages`); setPages(result.pages); setPageId(current=>result.pages.some(p=>p.id===current)?current:(result.pages[0]?.id??'')); }
  useEffect(()=>{void loadProjects().catch(show)},[]); useEffect(()=>{if(projectId) void loadPages(projectId).catch(show);},[projectId]);
  function show(reason:unknown){setError(reason instanceof Error?reason.message:String(reason));}
  async function logout(){await post('/api/auth/logout',{});location.reload();}
  return <main class="shell"><header><h1>Lykar</h1><span class="badge">localhost</span><span class="user">{session.user.email}</span><button onClick={()=>void logout()}>Выйти</button></header>{error&&<p class="error">{error}</p>}
    <div class="grid"><aside class="card"><ProjectCreate onCreated={()=>void loadProjects()}/><h2>Сайты</h2><div class="list">{projects.map(item=><button class={`list-item ${item.id===projectId?'active':''}`} onClick={()=>setProjectId(item.id)}><span>{item.name}</span><small>{item.origins[0]}</small></button>)}</div></aside>
    <section class="card">{project?<><div class="row"><div><h2>{project.name}</h2><div class="muted small">{project.publicKey}</div></div></div><PageCreate projectId={project.id} onCreated={()=>void loadPages(project.id)}/><h3>Страницы</h3><div class="row">{pages.map(item=><button class={item.id===pageId?'active':''} onClick={()=>setPageId(item.id)}>{item.name} <span class="muted">{item.pathname}</span></button>)}</div>{page&&<PageWorkspace page={page} showError={show}/>}</>:<p class="muted">Создайте первый сайт.</p>}</section></div></main>;
}

function ProjectCreate({onCreated}:{onCreated:()=>void}) { const [name,setName]=useState(''); const [origin,setOrigin]=useState('http://localhost:4173'); async function submit(e:Event){e.preventDefault();await post('/api/admin/projects',{name,origins:[origin]});setName('');onCreated();} return <form class="form" onSubmit={submit}><h2>Новый сайт</h2><input required value={name} onInput={e=>setName(e.currentTarget.value)} placeholder="Название"/><input required value={origin} onInput={e=>setOrigin(e.currentTarget.value)} placeholder="http://localhost:4173"/><button class="primary">Создать</button></form>; }
function PageCreate({projectId,onCreated}:{projectId:string;onCreated:()=>void}) { const [name,setName]=useState(''); const [pathname,setPath]=useState('/pricing'); async function submit(e:Event){e.preventDefault();await post(`/api/admin/projects/${projectId}/pages`,{name,pathname});setName('');onCreated();} return <form class="row" onSubmit={submit}><input required value={name} onInput={e=>setName(e.currentTarget.value)} placeholder="Новая страница"/><input required value={pathname} onInput={e=>setPath(e.currentTarget.value)} placeholder="/pricing"/><button>Добавить</button></form>; }

function PageWorkspace({page,showError}:{page:Page;showError:(e:unknown)=>void}) {
  const [drafts,setDrafts]=useState<Draft[]>([]); const [releases,setReleases]=useState<Release[]>([]); const [shares,setShares]=useState<Share[]>([]);
  async function load(){const [d,r,s]=await Promise.all([api<{drafts:Draft[]}>(`/api/admin/pages/${page.id}/drafts`),api<{releases:Release[]}>(`/api/admin/pages/${page.id}/releases`),api<{shares:Share[]}>(`/api/admin/pages/${page.id}/shares`)]);setDrafts(d.drafts);setReleases(r.releases);setShares(s.shares);}
  useEffect(()=>{void load().catch(showError)},[page.id]); const open=drafts.find(d=>d.status==='open');
  async function createDraft(){await post(`/api/admin/pages/${page.id}/drafts`,{});await load();}
  async function launch(){if(!open)return;const result=await post<{launchUrl:string}>(`/api/admin/pages/${page.id}/editor-launch`,{draftId:open.id});window.open(result.launchUrl,'_blank','noopener');}
  async function publish(){if(!open)return;await post(`/api/admin/drafts/${open.id}/publish`,{expectedRevision:open.revision});await load();}
  async function rollback(releaseId:string){await post(`/api/admin/pages/${page.id}/rollback`,{releaseId});await load();}
  async function share(releaseId:string){const result=await post<{url:string}>(`/api/admin/pages/${page.id}/shares`,{releaseId,expiresInSeconds:604800});await navigator.clipboard?.writeText(result.url);await load();alert(`Share URL скопирован:\n${result.url}`);}
  async function revoke(id:string){await del(`/api/admin/shares/${id}`);await load();}
  return <div class="detail-grid"><div><h3>Draft</h3>{open?<div class="draft"><b>Open draft</b><div class="small muted">revision {open.revision}</div><div class="row"><button class="primary" onClick={()=>void launch().catch(showError)}>Открыть редактор</button><button onClick={()=>void publish().catch(showError)}>Publish</button></div></div>:<button onClick={()=>void createDraft().catch(showError)}>Создать draft</button>}</div>
    <div><h3>Share links</h3>{shares.filter(s=>!s.revokedAt).map(item=><div class="share"><span>v{item.version}</span> <span class="small muted">до {item.expiresAt?new Date(item.expiresAt).toLocaleString():'∞'}</span> <button class="danger" onClick={()=>void revoke(item.id).catch(showError)}>Отозвать</button></div>)}</div>
    <div class="wide"><h3>Immutable releases</h3>{releases.length===0?<p class="muted">Публикаций ещё нет.</p>:releases.map(item=><div class="release row"><b>Version {item.version}</b><span class="muted">{item.operationCount} команд</span><button onClick={()=>void rollback(item.id).catch(showError)}>Rollback</button><button onClick={()=>void share(item.id).catch(showError)}>Share</button></div>)}</div></div>;
}

render(<App/>, document.getElementById('app')!);
