import {useEffect,useRef,useState} from 'preact/hooks';
import {isConnectionReport,type ConnectionReport} from '@lykar/protocol';
import {api,post,type Page,type Project} from './api';
import {errorMessage} from './use-async-action';

type Health={status:string;code:string;checkedAt:string|null;report:{sdkVersion:string;api:string;runtimeAsset:string;editorAsset:string;readiness:string;csp:string[]}|null};
type Origin={id:string;origin:string;verifiedAt:string|null;verificationMethod:string|null;connection:Health};
type State={origins:Origin[];allowLoopback:boolean};
type Challenge={id:string;token:string;recordName:string;recordValue:string;expiresAt:string};
type Probe={id:string;nonce:string;pageUrl:string;publicKey:string};
const reasons:Record<string,string>={
  NOT_CHECKED:'Ещё не проверено.',AWAITING_SIGNAL:'Ожидаем ответ выбранной страницы.',NO_SIGNAL:'Ответ SDK не получен. Проверьте установку SDK, его загрузку и разрешения браузера. Отсутствие ответа не означает, что сайт недоступен.',
  CANCELLED:'Проверка отменена.',WRONG_PROJECT_KEY:'SDK настроен на другой сайт. Замените projectKey на ключ этого проекта.',
  API_UNAVAILABLE:'Страница не смогла связаться с API. Проверьте адрес API, сеть и connect-src в CSP.',
  CSP_BLOCKED:'Браузер сообщил о блокировке CSP. Разрешите необходимые источники API и файлов SDK; проверьте политику стилей редактора.',
  UNSUPPORTED_FRAMEWORK:'Этот режим фреймворка не поддержан. Используйте static либо поддержанный React/Vue CSR или ordinary hydration.',
  RUNTIME_ASSET_UNAVAILABLE:'Файл runtime не загрузился или не прошёл проверку. Проверьте URL, доступность и версии SDK assets.',
  EDITOR_ASSET_UNAVAILABLE:'Файл редактора не загрузился или не прошёл проверку. Проверьте URL и совместимость assets.',
  READINESS_PENDING:'SDK ответил, но готовность страницы не подтверждена. Для static укажите frameworkMode: static; для React/Vue подключите сигнал готовности.',
  ASSETS_UNCHECKED:'Не все файлы SDK проверены.',OK:'Проверка завершена: SDK, API и файлы runtime/editor доступны; страница сообщила о готовности.',
};

export async function runConnectionProbe(page:Page,origin:string,signal:AbortSignal):Promise<void> {
  const popup=window.open('about:blank','_blank');
  if(!popup)throw new Error('Разрешите всплывающие окна для проверки сайта.');
  popup.opener=null;
  let probe:Probe|undefined;
  let timer:ReturnType<typeof setInterval>|undefined;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  let receive:((event:MessageEvent)=>void)|undefined;
  let abort:(()=>void)|undefined;
  try {
    probe=await post<Probe>(`/api/admin/pages/${page.id}/connection/probes`,{origin});
    if(signal.aborted){await post(`/api/admin/pages/${page.id}/connection/probes/${probe.id}`,{nonce:probe.nonce,reason:'CANCELLED'});return;}
    const current=probe;
    const result=await new Promise<ConnectionReport|'NO_SIGNAL'|'CANCELLED'>(resolve=>{
      let done=false;
      const finish=(value:ConnectionReport|'NO_SIGNAL'|'CANCELLED')=>{if(!done){done=true;resolve(value);}};
      receive=event=>{
        if(event.source!==popup||event.origin!==origin||!isConnectionReport(event.data))return;
        if(event.data.nonce!==current.nonce||event.data.pageUrl!==current.pageUrl)return;
        finish(event.data);
      };
      abort=()=>finish('CANCELLED');
      window.addEventListener('message',receive);
      signal.addEventListener('abort',abort,{once:true});
      timeout=setTimeout(()=>finish('NO_SIGNAL'),35000);
      popup.location.replace(current.pageUrl);
      timer=setInterval(()=>{
        if(popup.closed){finish('CANCELLED');return;}
        popup.postMessage({type:'lykar:connection-check',schemaVersion:1,nonce:current.nonce,pageUrl:current.pageUrl},origin);
      },250);
    });
    await post(`/api/admin/pages/${page.id}/connection/probes/${probe.id}`,{nonce:probe.nonce,
      ...(typeof result==='string'?{reason:result}:{report:result})});
  } finally {
    if(timer)clearInterval(timer);if(timeout)clearTimeout(timeout);
    if(receive)window.removeEventListener('message',receive);
    if(abort)signal.removeEventListener('abort',abort);
    // After opener is detached, WebKit refuses a foreign page closing this tab.
    // Close only the still-local placeholder; the customer can close the host tab.
    try {if(popup.location.origin===location.origin||popup.location.href==='about:blank')popup.close();} catch {/* Cross-origin host stays available for inspection. */}
  }
}

export function ConnectionPanel({project,page,canManage,canProbe,mode='all'}:{project:Project;page:Page;canManage:boolean;canProbe:boolean;mode?:'all'|'verify'|'probe'}) {
  const [state,setState]=useState<State|null>(null),[origin,setOrigin]=useState(project.origins[0]??'');
  const [challenge,setChallenge]=useState<Challenge|null>(null),[error,setError]=useState(''),[status,setStatus]=useState('');
  const [pending,setPending]=useState(false);
  const probe=useRef<AbortController|null>(null),alive=useRef(true);
  const selected=state?.origins.find(item=>item.origin===origin);
  async function load(){const result=await api<State>(`/api/admin/pages/${page.id}/connection`);if(alive.current)setState(result);}
  useEffect(()=>{alive.current=true;void load().catch(reason=>setError(errorMessage(reason)));
    const timer=setInterval(()=>void load().catch(()=>{}),30000);
    return()=>{alive.current=false;probe.current?.abort();clearInterval(timer);};},[page.id]);
  async function action(work:()=>Promise<unknown>,message=''){
    if(pending)return;setPending(true);setError('');setStatus('');
    try{await work();if(alive.current){setStatus(message);await load();}}
    catch(reason){if(alive.current)setError(errorMessage(reason));}
    finally{if(alive.current)setPending(false);}
  }
  const local=(()=>{try{return ['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname);}catch{return false;}})();
  const health=selected?.connection;
  const stale=health?.status==='stale'||Boolean(health?.checkedAt&&Date.now()-Date.parse(health.checkedAt)>=15*60000);
  return <section class="connection-panel">
    <h3>Подтверждение сайта и подключение</h3>
    <p class="muted">Владение доменом и работа SDK проверяются отдельно. Перед Deploy нужно подтвердить все адреса сайта.</p>
    <label>Адрес сайта <select aria-label="Адрес проверки" value={origin} disabled={pending} onChange={event=>{setOrigin(event.currentTarget.value);setChallenge(null);setError('');setStatus('');}}>
      {project.origins.map(value=><option key={value} value={value}>{value}</option>)}
    </select></label>
    {error&&<p class="inline-error" role="alert">{error}</p>}
    {status&&<p role="status">{status}</p>}
    {!state&&<p>Загружаем сведения…</p>}
    {selected&&<>
      {mode !== 'probe' && <><h4>Владение адресом</h4>
      <p>{selected.verifiedAt?`Подтверждено ${new Date(selected.verifiedAt).toLocaleString()}${selected.verificationMethod==='local-development'?' · только локальная разработка':''}`:'Адрес не подтверждён.'}</p>
      {canManage&&<div class="row">
        {local?<button disabled={pending||!state?.allowLoopback} onClick={()=>void action(()=>post(`/api/admin/projects/${project.id}/origins/verify-local`,{origin}),'Локальный адрес подтверждён.')}>Подтвердить localhost</button>
          :<button disabled={pending} onClick={()=>void action(async()=>{const value=await post<Challenge>(`/api/admin/projects/${project.id}/origins/challenge`,{origin});setChallenge(value);})}>Получить DNS-код</button>}
        {selected.verifiedAt&&<button disabled={pending} class="danger" onClick={()=>void action(async()=>{await post(`/api/admin/projects/${project.id}/origins/revoke`,{origin});setChallenge(null);},'Подтверждение отозвано. Выдача deployment для этого адреса остановлена.')}>Отозвать подтверждение</button>}
      </div>}
      {challenge&&<div class="card"><p>Добавьте TXT-запись у DNS-провайдера домена. Дождитесь её распространения и нажмите «Проверить DNS».</p>
        <p>Имя: <code style={{overflowWrap:'anywhere'}}>{challenge.recordName}</code></p>
        <label>Значение TXT<textarea readOnly rows={3} aria-label="Значение TXT" value={challenge.recordValue}/></label>
        <p class="muted">Код действует до {new Date(challenge.expiresAt).toLocaleString()}. Новый код заменяет предыдущий. После перезагрузки страницы запросите новый код.</p>
        <button disabled={pending} onClick={()=>void action(async()=>{await post(`/api/admin/projects/${project.id}/origins/verify`,{origin,challengeId:challenge.id,token:challenge.token});setChallenge(null);},'Владение доменом подтверждено.')}>Проверить DNS</button>
      </div>}
      </>}{mode !== 'verify' && <><h4>Подключение страницы {page.pathname}</h4>
      <p>{health?.checkedAt?`Проверено ${new Date(health.checkedAt).toLocaleString()}. Это результат прошлой проверки, не online-статус.`:'Успешной проверки этой страницы ещё нет.'}</p>
      {stale?<p>Результат устарел. Запустите проверку снова.</p>:<p>{reasons[health?.code??'NOT_CHECKED']??'Подключение требует проверки.'}</p>}
      {health?.report&&<p class="small muted">SDK {health.report.sdkVersion} · API: {health.report.api} · runtime: {health.report.runtimeAsset} · editor: {health.report.editorAsset} · readiness: {health.report.readiness}{health.report.csp.length?` · CSP: ${health.report.csp.join(', ')}`:''}</p>}
      {canProbe&&<div class="row"><button disabled={pending} onClick={()=>{const controller=new AbortController();probe.current=controller;void action(()=>runConnectionProbe(page,origin,controller.signal));}}>{pending&&probe.current?'Проверяем…':'Проверить подключение'}</button>
        {pending&&probe.current&&<button onClick={()=>probe.current?.abort()}>Отменить проверку</button>}
      </div>}
      <p class="muted small">Откроется выбранная страница. После проверки её окно можно закрыть самостоятельно. Проверка не публикует изменения и не запускает редактор. Если SDK заблокирован или не установлен, точную причину отсутствия ответа смотрите в консоли браузера.</p></>}
    </>}
  </section>;
}
