import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';

const required=(key:string)=>{const value=process.env[key];if(!value)throw new Error(`${key} is required`);return value;};
// This suite deliberately generates CSP and asset failures and asserts their exact diagnostic outcomes.
for(const [scenario,code] of [['ok','OK'],['wrong-key','WRONG_PROJECT_KEY'],['runtime-missing','RUNTIME_ASSET_UNAVAILABLE'],
  ['editor-missing','EDITOR_ASSET_UNAVAILABLE'],['csp-connect','CSP_BLOCKED'],['csp-script','CSP_BLOCKED'],['csp-style','CSP_BLOCKED'],['streaming','UNSUPPORTED_FRAMEWORK'],['missing-sdk','NO_SIGNAL'],['react-csr','OK'],['react-ssr','OK'],['vue-csr','OK'],['vue-ssr','OK']] as const){
  test(`connection probe: ${scenario}`,async({context,page})=>{
    const api=required('LYKAR_E2E_API_BASE_URL'),origin=required('LYKAR_E2E_PLAYGROUND_BASE_URL');
    expect((await context.request.post(`${api}/api/auth/dev-login`,{data:{}})).status()).toBe(200);
    const projects=await (await context.request.get(`${api}/api/admin/projects`)).json();
    const project=projects.projects.find((p:{publicKey:string})=>p.publicKey==='pk_playground_local')??projects.projects[0];
    const framework=/^(react|vue)-(csr|ssr)$/.test(scenario);
    const pathname=framework?`/__e2e__/s4-${scenario}-a-${randomUUID()}`:`/__e2e__/connection/${scenario}/${randomUUID()}`;
    const created=await context.request.post(`${api}/api/admin/projects/${project.id}/pages`,{data:{name:`Connection ${scenario}`,pathname}});
    expect(created.status()).toBe(201);const target=(await created.json()).page;
    const started=await context.request.post(`${api}/api/admin/pages/${target.id}/connection/probes`,{data:{origin}});
    expect(started.status()).toBe(201);const probe=await started.json();
    await page.goto(`${api}/admin/`);
    await page.evaluate(({url,nonce})=>{
      const button=document.createElement('button');button.id='launch-probe';button.textContent='Launch probe';document.body.append(button);
      button.onclick=()=>{
      const popup=window.open(url,'_blank');if(!popup)throw new Error('Popup blocked');popup.opener=null;
      (window as any).__probe={popup,report:null,url,nonce};
      window.addEventListener('message',event=>{
        if(event.source===popup&&event.origin===new URL(url).origin&&event.data?.type==='lykar:connection-report'&&event.data.nonce===nonce){
          (window as any).__probe.report=event.data;
        }
      });

      };
    },{url:probe.pageUrl,nonce:probe.nonce});
    const opened=context.waitForEvent('page');
    await page.locator('#launch-probe').click();
    const host=await opened;await host.waitForLoadState('load');
    if(framework)await host.waitForFunction(()=>{const roots=(window as any)[Symbol.for('@lykar/framework-roots/v1')];return roots?.size>0&&[...roots.values()].every((root:any)=>root.phase==='ready');});
    await page.evaluate(()=>{const {popup,url,nonce}=(window as any).__probe;(window as any).__probe.timer=setInterval(()=>popup.postMessage({type:'lykar:connection-check',schemaVersion:1,nonce,pageUrl:url},new URL(url).origin),100);});
    let report:unknown=null;
    if(scenario==='missing-sdk'){
      await expect.poll(()=>page.evaluate(()=>Boolean((window as any).__probe.popup&&!((window as any).__probe.popup.closed)))).toBe(true);
      // No response is inconclusive, not proof that the host is unavailable.
      await page.waitForTimeout(1000);
      expect(await page.evaluate(()=>(window as any).__probe.report)).toBeNull();
    }else{
      await expect.poll(()=>page.evaluate(()=>(window as any).__probe.report),{timeout:12000}).not.toBeNull();
      report=await page.evaluate(()=>(window as any).__probe.report);
    }
    const finish=await context.request.post(`${api}/api/admin/pages/${target.id}/connection/probes/${probe.id}`,{data:{nonce:probe.nonce,...(report?{report}:{reason:'NO_SIGNAL'})}});
    expect(finish.status(),await finish.text()).toBe(200);expect((await finish.json()).code).toBe(code);
    if(framework)await expect(host.locator('body')).toContainText('Alpha');
    else await expect(host.getByRole('heading',{name:'Original host content'})).toBeVisible();
    expect(await host.locator('[data-lykar-editor-root]').count()).toBe(0);
    await page.evaluate(()=>{clearInterval((window as any).__probe.timer);(window as any).__probe.popup.close();});
    const state=await (await context.request.get(`${api}/api/admin/pages/${target.id}/connection`)).json();
    expect(state.origins.find((o:{origin:string})=>o.origin===origin).connection.status).toBe(scenario==='missing-sdk'?'inconclusive':code==='OK'?'checked':'attention');
  });
}

test('Admin connection tab verifies loopback explicitly and shows a dated probe result',async({page,context},testInfo)=>{
  const base=required('LYKAR_E2E_API_BASE_URL');
  await context.request.post(`${base}/api/auth/dev-login`,{data:{}});
  await page.goto(`${base}/admin/`);
  await page.getByRole('button',{name:'Подключение',exact:true}).click();
  await page.getByRole('button',{name:'Подтвердить localhost'}).click();
  await expect(page.getByText('Локальный адрес подтверждён.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Проверить подключение',exact:true}).click();
  await expect(page.getByText('Проверка завершена:',{exact:false})).toBeVisible({timeout:20000});
  await expect(page.getByText('Это результат прошлой проверки, не online-статус.',{exact:false})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('connection-admin.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'Проверить подключение',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('connection-admin-mobile.png'),fullPage:true});
});
