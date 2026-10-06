import {useEffect, useRef, useState} from 'preact/hooks';
import type {PreviewCheckReport} from '@lykar/protocol';
import {api, ApiError, post, type DeploymentAction, type DeploymentActivation, type DeploymentHistory,
  type DeploymentState, type Page, type Project, type ProjectMember, type ProjectPermissions, type Release} from './api';
import {errorMessage} from './use-async-action';
import {checkReleasePreview} from './preview-check';

type Mutation = {action: DeploymentAction; releaseId?: string; reason: string; expectedRevision: number; idempotencyKey: string};
const actionName = {deploy: 'Включение', disable: 'Отключение', rollback: 'Откат'};
const operationName: Record<string,string> = {setText:'Текст',setStyle:'Стиль',setAttribute:'Атрибут',insertNode:'Вставка',removeNode:'Удаление',moveNode:'Перемещение'};
const statusName = {applied:'Применено',skipped:'Пропущено',error:'Ошибка'};
function blockingReport(report: PreviewCheckReport | undefined) {
  return report?.operations.some(operation => operation.status === 'error' || (operation.status === 'skipped'
    && !['CONDITIONAL_REGISTERED','RELEASE_ALREADY_APPLIED','OPERATION_ALREADY_APPLIED','OPERATION_SUPERSEDED'].includes(operation.code ?? '')));
}

export function DeploymentPanel({page, project, releases, permissions, members, mutationsEnabled, onRepair}: {
  page: Page; project: Project; releases: Release[]; permissions: ProjectPermissions; members: ProjectMember[];
  mutationsEnabled: boolean; onRepair: (release: Release) => Promise<void>;
}) {
  const [state,setState] = useState<DeploymentState | null>(null);
  const [history,setHistory] = useState<DeploymentActivation[]>([]);
  const [cursor,setCursor] = useState<number|null>(null);
  const [ready,setReady] = useState(false);
  const [loading,setLoading] = useState(false);
  const [loadError,setLoadError] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [pending,setPending] = useState('');
  const [selected,setSelected] = useState('');
  const [reason,setReason] = useState('');
  const [reports,setReports] = useState<Record<string,PreviewCheckReport>>({});
  const sequence = useRef(0);
  const alive = useRef(true);
  const busy = useRef(false);
  const retry = useRef<Mutation | null>(null);
  const check = useRef<AbortController | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const endpoint = `/api/admin/pages/${page.id}/deployment`;
  const release = releases.find(item=>item.id===selected);
  const report = reports[selected];
  const locked = Boolean(pending) || loading || !ready || !mutationsEnabled;
  const blocked = blockingReport(report);
  const canRollback = state && selected !== state.activeReleaseId && history.some(item=>item.releaseId===selected && item.revision<state.revision);
  const versionLabel = (id: string|null) => id ? `Версия ${releases.find(item=>item.id===id)?.version ?? 'из истории'}` : 'Исходная страница';
  const actorLabel = (id: string) => members.find(member=>member.userId===id)?.email ?? 'Бывший участник проекта';
  function focusFeedback() { queueMicrotask(()=>feedback.current?.focus()); }

  async function load() {
    const request = ++sequence.current;
    setLoading(true);setLoadError('');setReady(false);
    try {
      const [current, rows] = await Promise.all([api<{deployment:DeploymentState}>(endpoint),api<DeploymentHistory>(`${endpoint}/activations`)]);
      if (!alive.current || request!==sequence.current) return;
      setState(current.deployment);setHistory(rows.activations);setCursor(rows.nextBeforeRevision);setReady(true);
    } catch (failure) {
      if (alive.current && request===sequence.current) setLoadError(errorMessage(failure));
      throw failure;
    } finally { if(alive.current&&request===sequence.current)setLoading(false); }
  }
  useEffect(()=>{
    alive.current=true;
    void load().catch(()=>{});
    return ()=>{alive.current=false;sequence.current++;check.current?.abort();};
  },[page.id]);
  useEffect(()=>{
    setSelected(current=>releases.some(item=>item.id===current)?current:(releases[0]?.id??''));
  },[releases]);

  async function mutate(action: DeploymentAction, retrying = false) {
    if (busy.current || locked || !state || !permissions.publish) return;
    const target = action==='disable'?undefined:release?.id;
    if (action!=='disable' && (!target || blocked)) return;
    if (!reason.trim() || [...reason.trim()].length>500) {setError('Укажите причину: от 1 до 500 символов.');focusFeedback();return;}
    const command: Mutation = retrying && retry.current ? retry.current : {
      action, ...(target?{releaseId:target}:{}), reason:reason.trim(),expectedRevision:state.revision,idempotencyKey:crypto.randomUUID(),
    };
    retry.current=command;busy.current=true;setPending(action);setError('');setNotice('');
    try {
      const {action:operation,...body}=command;
      const result=await post<{deployment:DeploymentState;replayed:boolean}>(`${endpoint}/${operation}`,body);
      if(!alive.current)return;
      retry.current=null;
      setNotice(result.replayed?'Эта команда уже была выполнена. Ниже — актуальное состояние сайта.':`${actionName[operation]} принято. Ниже — актуальное состояние сайта.`);
      try {await load();} catch {setNotice('Команда принята, но актуальное состояние не загружено. Обновите данные перед следующим действием.');}
    } catch(failure) {
      if(!alive.current)return;
      if(failure instanceof ApiError && failure.status===409) {
        retry.current=null;
        setError('Публикация изменена в другом окне. Выбор версии и причина сохранены. Проверьте актуальное состояние и повторите действие.');
        await load().catch(()=>{});
      } else {
        if(failure instanceof ApiError && failure.status<500)retry.current=null;
        setError(retry.current?'Ответ команды не подтверждён. Повторите ту же команду с сохранённым ключом; второе включение не произойдёт.':errorMessage(failure));
      }
    } finally {busy.current=false;if(alive.current){setPending('');focusFeedback();}}
  }
  async function preflight() {
    if(busy.current||locked||!release||!permissions.publish)return;
    busy.current=true;setPending('check');setError('');setNotice('');
    setReports(current=>{const next={...current};delete next[release.id];return next;});
    const controller=new AbortController();check.current=controller;
    try {
      const result=await checkReleasePreview(project,page,release,controller.signal);
      if(alive.current){setReports(current=>({...current,[release.id]:result}));setNotice(`Проверка версии ${release.version} получена из окна предпросмотра.`);}
    } catch(failure) {if(alive.current)setError(errorMessage(failure));}
    finally {busy.current=false;check.current=null;if(alive.current){setPending('');focusFeedback();}}
  }
  async function repair() {
    if(busy.current||locked||!release||!permissions.edit)return;
    busy.current=true;setPending('repair');setError('');setNotice('');
    try {await onRepair(release);if(alive.current)setNotice('Открыт черновик на основе выбранной версии. Исправьте команду в списке изменений, сохраните черновик и зафиксируйте новую версию.');}
    catch(failure){if(alive.current)setError(errorMessage(failure));}
    finally {busy.current=false;if(alive.current){setPending('');focusFeedback();}}
  }
  async function more() {
    if(busy.current||locked||cursor===null)return;
    busy.current=true;setPending('history');setError('');
    try {
      const next=await api<DeploymentHistory>(`${endpoint}/activations?beforeRevision=${cursor}`);
      if(alive.current){setHistory(items=>[...items,...next.activations.filter(item=>!items.some(known=>known.id===item.id))]);setCursor(next.nextBeforeRevision);}
    }catch(failure){if(alive.current)setError(errorMessage(failure));}
    finally{busy.current=false;if(alive.current)setPending('');}
  }
  return <section class="deployment-panel" aria-labelledby="deployment-heading" aria-busy={loading||Boolean(pending)}>
    <div class="row deployment-heading"><h3 id="deployment-heading">На действующем сайте</h3><button type="button" disabled={Boolean(pending)||loading} onClick={()=>void load().catch(()=>{})}>Обновить состояние</button></div>
    {loading&&<p role="status">Загружаем публикацию…</p>}
    {loadError&&<div role="alert" class="error-state">Не удалось загрузить публикацию: {loadError}. Действия временно недоступны.</div>}
    {state&&<div class="deployment-current"><strong>{state.activeReleaseId?`${versionLabel(state.activeReleaseId)} включена`:'Правки отключены: исходная страница'}</strong>
      {state.activation&&<p class="small muted">{actionName[state.activation.action]} · {actorLabel(state.activation.actorUserId)} · {new Date(state.activation.createdAt).toLocaleString()}<br/>Причина: {state.activation.reason}</p>}
    </div>}
    <p class="small muted">Зафиксированная версия хранит правки. На сайт они попадут только после включения и при установленном SDK в режиме публикаций. Уже открытые вкладки обновят правки при переходе, обновлении страницы или SDK.</p>
    <div ref={feedback} tabIndex={-1} class="deployment-feedback">
      {error&&<p role="alert" class="inline-error">{error}</p>}
      {notice&&<p role="status" class="success">{notice}</p>}
    </div>
    {retry.current&&!pending&&<div class="error-state"><p>Неподтверждённая команда: {actionName[retry.current.action]} · {versionLabel(retry.current.releaseId??null)} · {retry.current.reason}</p>
      <button type="button" disabled={locked} onClick={()=>void mutate(retry.current!.action,true)}>Повторить ту же команду</button>
      <button type="button" disabled={locked} onClick={()=>{retry.current=null;setError('Повтор отменён. Проверьте актуальное состояние перед новой командой.');void load().catch(()=>{});}}>Перечитать состояние</button></div>}
    <div class="deployment-form">
      <label>Версия для проверки и включения<select aria-label="Версия для публикации" value={selected} disabled={locked||Boolean(retry.current)} onChange={event=>{setSelected(event.currentTarget.value);setError('');setNotice('');}}>
        {!releases.length&&<option value="">Нет зафиксированных версий</option>}
        {releases.map(item=><option key={item.id} value={item.id}>Версия {item.version} · {item.operationCount} команд{item.id===state?.activeReleaseId?' · включена':''}</option>)}
      </select></label>
      {release&&<div class="deployment-check">
        <h4>Применимость правок</h4>
        {report?<><p><strong>{blocked?'Есть неприменимые правки':report.operations.some(item=>item.status==='skipped')?'Есть пропущенные правки':'Проверено в предпросмотре'}</strong> · {new Date(report.checkedAt).toLocaleString()}</p>
          <p class={report.sourceStatus==='drifted'?'warning':'muted'}>{report.sourceStatus==='drifted'?'Структура страницы изменилась относительно сохранённого снимка.':report.sourceStatus==='compatible'?'Структура совпадает с сохранённым снимком.':'Сравнение структуры недоступно.'}</p>
          <ul class="deployment-operations">{report.operations.map((operation,index)=><li key={operation.id}><span>{index+1}. {operationName[operation.kind]??operation.kind}</span><strong class={operation.status==='error'?'error':operation.status==='applied'?'success':'warning'}>{statusName[operation.status]}</strong>{operation.code&&<small>{operation.code}</small>}</li>)}</ul>
        </>:<p><strong>Не проверено.</strong> {release.sourceSnapshot?'Сохранён структурный снимок, но текущего отчёта нет.':'У версии нет структурного снимка и текущего отчёта.'}</p>}
        <p class="small muted">Отчёт относится к одному окну предпросмотра. Он не обнаруживает изменения только в CSS и не гарантирует результат для всех посетителей. Пропущенные targets не переназначаются автоматически.</p>
        {permissions.publish&&<button type="button" disabled={locked||Boolean(retry.current)} onClick={()=>void preflight()}>{pending==='check'?'Ожидаем отчёт…':'Проверить на сайте'}</button>}
        {pending==='check'&&<button type="button" onClick={()=>check.current?.abort()}>Отменить проверку</button>}
        {permissions.edit&&<button type="button" disabled={locked||Boolean(retry.current)} onClick={()=>void repair()}>Исправить в новом черновике</button>}
        {blocked&&<p role="alert" class="error">Эту проверенную версию нельзя включить: исправьте ошибки или отсутствующие элементы, сохраните новую версию и проверьте её.</p>}
      </div>}
      {permissions.publish&&<><label>Причина действия<textarea aria-label="Причина публикации" required value={reason} maxLength={500} disabled={locked||Boolean(retry.current)} onInput={event=>setReason(event.currentTarget.value)} placeholder="Например: уточнили заголовок тарифа"/></label>
        <div class="row"><button type="button" class="primary" disabled={locked||Boolean(retry.current)||!release||!reason.trim()||Boolean(blocked)||selected===state?.activeReleaseId} onClick={()=>void mutate('deploy')}>Включить версию</button>
          <button type="button" class="danger" disabled={locked||Boolean(retry.current)||!state?.activeReleaseId||!reason.trim()} onClick={()=>void mutate('disable')}>Отключить правки</button>
          <button type="button" disabled={locked||Boolean(retry.current)||!canRollback||!reason.trim()||Boolean(blocked)} onClick={()=>void mutate('rollback')}>Откатить на выбранную версию</button></div>
        {release && !canRollback && selected!==state?.activeReleaseId && <p class="small muted">Откат доступен к версии, уже включавшейся раньше. Для старых версий загрузите предыдущие действия в истории.</p>}
        {!report&&release&&<p class="small warning">Версия не проверена. Перед включением откройте предпросмотр; при включении без проверки результат может отличаться от ожидаемого.</p>}</>}
    </div>
    <details class="deployment-history"><summary>История публикаций</summary>{history.length===0?<p class="muted">Активаций пока нет.</p>:<ol>{history.map(item=><li key={item.id}><strong>{actionName[item.action]}: {versionLabel(item.releaseId)}</strong><p class="small muted">{actorLabel(item.actorUserId)} · {new Date(item.createdAt).toLocaleString()}</p><p>{item.reason}</p></li>)}</ol>}
      {cursor!==null&&<button type="button" disabled={locked} onClick={()=>void more()}>Показать предыдущие действия</button>}
    </details>
  </section>;
}
