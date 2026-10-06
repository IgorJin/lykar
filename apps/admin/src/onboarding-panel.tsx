import {useRef,useState} from 'preact/hooks';
import {api,post,type Project,type Page,type ProjectAccess} from './api';
import {ConnectionPanel} from './connection-panel';
import {InstallationPanel} from './installation-panel';
import {PageWorkspace} from './page-workspace';
import {errorMessage} from './use-async-action';

const steps=['Подтвердить адрес','Установить SDK','Проверить страницу','Первая правка'];
export function OnboardingPanel({project,pages,page,access,userId,onPage,reload}:{project:Project;pages:Page[];page?:Page;access:ProjectAccess;userId:string;onPage:(id:string)=>void;reload:()=>Promise<void>}) {
  const heading=useRef<HTMLHeadingElement>(null);
  const key=`lykar:onboarding:${userId}:${project.id}`;
  const [step,setStep]=useState(()=>{try{const n=Number(localStorage.getItem(key));return Number.isInteger(n)&&n>=0&&n<4?n:0;}catch{return 0;}});
  const choose=(n:number)=>{setStep(n);requestAnimationFrame(()=>heading.current?.focus());try{localStorage.setItem(key,String(n));}catch{/* Navigation remains usable without storage. */}};
  return <section class="onboarding" aria-label="Мастер подключения">
    <h2>От сайта до первой правки</h2>
    <p>Разработчик один раз устанавливает SDK на ваш сайт. После этого тексты и стили можно менять в браузере. Для подтверждения домена нужен доступ к DNS.</p>
    <nav class="onboarding-steps" aria-label="Шаги подключения">{steps.map((name,i)=><button type="button" aria-current={step===i?'step':undefined} class={step===i?'active':''} onClick={()=>choose(i)}>{i+1}. {name}</button>)}</nav>
    <h3 ref={heading} tabIndex={-1}>{steps[step]}</h3>
    {step===0&&<><OriginManager project={project} canManage={access.permissions.manageMembers} reload={reload}/>{page&&<ConnectionPanel project={project} page={page} canManage={access.permissions.manageMembers} canProbe={false} mode="verify"/>}</>}
    {step===1&&<InstallationPanel project={project}/>}
    {step>=2&&<><label>Страница для проверки и правки<select aria-label="Страница мастера" value={page?.id??''} onChange={event=>onPage(event.currentTarget.value)}>{pages.map(item=><option value={item.id}>{item.name} · {item.pathname}</option>)}</select></label>
      <p class="muted">Правки относятся к пути страницы, а не к query-параметрам или #якорю. Повторные и завершающие слеши нормализуются. Добавьте другую страницу вручную или из sitemap во вкладке «Страницы».</p>
    </>}
    {step===2&&page&&<ConnectionPanel key={page.id} project={project} page={page} canManage={false} canProbe={access.permissions.edit} mode="probe"/>}
    {step===3&&<><p>Создайте черновик, откройте редактор, выберите текст и нажмите Save. Сохранение меняет только черновик. «Зафиксировать версию» создаёт Release; ссылка на версию позволяет проверить результат. Deploy во вкладке версий включает её для обычных посетителей.</p><p>Начните с текста или стиля. Структурные изменения ограничены поддержанными редактором операциями; перестройка React/Vue-компонентов, логики приложения и серверного контента сюда не входит.</p>
      {page&&<PageWorkspace key={page.id} page={page} project={project} permissions={access.permissions} members={access.members}/>}</>}
    <div class="row onboarding-navigation"><button disabled={step===0} onClick={()=>choose(step-1)}>Назад</button>{step<3&&<button class="primary" onClick={()=>choose(step+1)}>Далее: {steps[step+1]}</button>}</div>
    <p class="small muted">Выбранный шаг сохраняется в этом браузере. Подтверждение адресов, страницы и сохранённые правки хранятся в аккаунте. Переход к следующему шагу сам по себе не подтверждает подключение.</p>
  </section>;
}

export function OriginManager({project,canManage,reload}:{project:Project;canManage:boolean;reload:()=>Promise<void>}) {
  const [origin,setOrigin]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');
  async function mutate(remove?:string){setPending(true);setError('');try{await api(`/api/admin/projects/${project.id}/origins`,{method:remove?'DELETE':'POST',body:JSON.stringify({origin:remove??origin})});setOrigin('');await reload();}catch(reason){setError(errorMessage(reason));}finally{setPending(false);}}
  return <div><h4>Разрешённые адреса</h4><p class="muted">Укажите протокол и домен без пути. www и адрес без www — разные адреса. Каждый новый адрес подтверждается отдельно; удаление прекращает выдачу изменений для него.</p>
    <ul>{project.origins.map(item=><li class="row"><span>{item}</span>{canManage&&<button disabled={pending||project.origins.length===1} onClick={()=>void mutate(item)}>Удалить {item}</button>}</li>)}</ul>
    {canManage&&<form class="row" onSubmit={event=>{event.preventDefault();void mutate();}}><label>Дополнительный адрес<input required type="url" placeholder="https://www.example.com" value={origin} onInput={event=>setOrigin(event.currentTarget.value)}/></label><button disabled={pending}>Добавить адрес</button></form>}{error&&<p role="alert" class="inline-error">{error}</p>}</div>;
}

type Preview={pages:{pathname:string;url:string}[];duplicates:number;excluded:number};
export function SitemapImport({project,reload}:{project:Project;reload:()=>Promise<void>}) {
  const [url,setUrl]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[selected,setSelected]=useState<string[]>([]),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function run(importing:boolean){setPending(true);setError('');setNotice('');try{if(importing){const result=await post<{imported:number;duplicates:number}>(`/api/admin/projects/${project.id}/sitemap/import`,{urls:selected});setNotice(`Добавлено страниц: ${result.imported}. Уже существовали: ${result.duplicates}.`);setPreview(null);setSelected([]);await reload();}else{setPreview(null);setSelected([]);const result=await post<Preview>(`/api/admin/projects/${project.id}/sitemap/preview`,{url});setPreview(result);setSelected(result.pages.map(p=>p.url));}}catch(reason){setError(errorMessage(reason));}finally{setPending(false);}}
  return <details class="sitemap"><summary>Импортировать страницы из sitemap</summary><p>Необязательный шаг. Поддержан XML urlset по публичному HTTPS-адресу вашего сайта, без перенаправлений. Sitemap index и внутренние адреса не загружаются. Можно всегда добавить страницу вручную.</p>
    <form class="row" onSubmit={event=>{event.preventDefault();void run(false);}}><label>URL sitemap<input disabled={pending} required type="url" placeholder="https://example.com/sitemap.xml" value={url} onInput={event=>{setUrl(event.currentTarget.value);setPreview(null);setSelected([]);}}/></label><button disabled={pending}>Предпросмотр sitemap</button></form>
    {pending&&<p role="status">Обрабатываем sitemap…</p>}{error&&<p class="inline-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {preview&&<><p>Доступно: {preview.pages.length}. Дубликатов: {preview.duplicates}. Исключено: {preview.excluded}. Query и #якорь не создают отдельную страницу.</p><div class="sitemap-pages">{preview.pages.map(item=><label><input type="checkbox" checked={selected.includes(item.url)} onChange={event=>setSelected(current=>event.currentTarget.checked?[...current,item.url]:current.filter(value=>value!==item.url))}/>{item.pathname}</label>)}</div><button disabled={pending||!selected.length} onClick={()=>void run(true)}>Импортировать выбранные ({selected.length})</button></>}
  </details>;
}
