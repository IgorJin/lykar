import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=process.cwd();
const targets=[['report',path.join(root,'docs/verification/reports/SERVICE-V1/deployment.html')],['plan',path.join(root,'tasks/SERVICE-V1/plan.html')]];
const browser=await chromium.launch({channel:'chromium'});
const results=[];
try {
 for(const [name,file] of targets) for(const [label,width,height] of [['desktop',1440,960],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto(pathToFileURL(file).href);
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')),status:document.body.innerText.includes('SERVICE-V1-04')&&document.body.innerText.includes('DONE')}));
  const absent=state.links.filter(href=>!href.startsWith('#')&&!/^[a-z]+:/i.test(href)).filter(href=>!fs.existsSync(path.resolve(path.dirname(file),decodeURIComponent(href.split('#')[0]))));
  const pending=name==='plan'?absent.filter(href=>/reports\/SERVICE-V1\/(onboarding|experiments|operations|release-acceptance|pilot-readiness)\.html/.test(href)):[];
  const broken=absent.filter(href=>!pending.includes(href));
  const screenshot=path.join(dir,`${name}-${label}-qa.png`);
  await page.screenshot({path:screenshot});
  results.push({name,label,...state,links:undefined,broken,pendingReports:[...new Set(pending)],screenshot:path.basename(screenshot)});
  await page.close();
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(dir,'document-qa.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
if(results.some(r=>r.scrollWidth>r.width||r.broken.length||!r.status))process.exitCode=1;
