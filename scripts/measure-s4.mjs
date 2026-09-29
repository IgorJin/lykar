import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {ConditionalRuntime, applyOperation} from '../packages/runtime/dist/runtime.js';
const out = new URL('../docs/verification/reports/s4/', import.meta.url);
const sizes = {};
for (const name of ['sdk.iife.js', 'runtime-core.iife.js', 'index.js', 'editor.iife.js']) {
  let content;
  try {content = await readFile(new URL(`../packages/sdk/dist/${name}`, import.meta.url));} catch {if (name === 'runtime-core.iife.js') continue; throw new Error(`Missing ${name}`);}
  sizes[name] = {rawBytes: content.length, gzipBytes: gzipSync(content, {level: 9}).length, sha256: createHash('sha256').update(content).digest('hex')};
}
const dom = new JSDOM('<!doctype html><head></head><body><button id="cta" style="color:gray">Waiting</button></body>');
const document = dom.window.document;
const button = document.querySelector('button');
const textNode = button.firstChild;
const runtime = new ConditionalRuntime({document, root: document, groups: [{id:'ready',target:{selectors:{css:'#cta'}},when:{kind:'textEquals',value:'Continue'},operations:[{kind:'setText',value:'Next'},{kind:'setStyle',property:'color',value:'navy'}]}],resolveTargetSync:()=>button});
runtime.start();
const timings=[];
for(let cycle=0;cycle<200;cycle++) {
  const start=performance.now();
  textNode.data='Continue'; runtime.sync(); assert.equal(button.textContent,'Next');
  button.style.color=cycle%2?'green':'navy';
  textNode.data='Waiting'; runtime.sync(); assert.equal(button.textContent,'Waiting');
  assert.equal(button.style.color,cycle%2?'green':'navy');
  timings.push(performance.now()-start);
}
timings.sort((a,b)=>a-b);
const stats=runtime.stats;
assert.equal(stats.suspended,false);
assert.equal(stats.groups,1);
assert.equal(stats.active,0);
runtime.dispose();
assert.equal(document.head.querySelectorAll('style').length,0);
assert.equal(button.attributes.length,2);
const replay=[];
for (const [nodes,operations] of [[100,25],[500,100]]) {
 const durations=[];
 for(let run=0;run<7;run++) {
  const fixture=new JSDOM(`<main>${Array.from({length:nodes},(_,i)=>`<p data-lykar-id="n${i}">Original</p>`).join('')}</main>`);
  const start=performance.now();
  for(let i=0;i<operations;i++) await applyOperation(fixture.window.document,{schemaVersion:1,id:`op${i}`,kind:'setText',target:{marker:`n${i}`},value:'Edited'});
  durations.push(performance.now()-start); fixture.window.close();
 }
 durations.sort((a,b)=>a-b); replay.push({nodes,operations,runs:7,p95Ms:durations[6]});
}
const initialBudget={rawBytes:80000,gzipBytes:25000};
const initialPass=sizes['sdk.iife.js'].rawBytes<=initialBudget.rawBytes && sizes['sdk.iife.js'].gzipBytes<=initialBudget.gzipBytes;
const runtimeAsset=sizes['runtime-core.iife.js'];
const result={measuredAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch},sizes,initialBudget,initialPass,totalScriptVisitor:{rawBytes:sizes['sdk.iife.js'].rawBytes+(runtimeAsset?.rawBytes??0),gzipBytes:sizes['sdk.iife.js'].gzipBytes+(runtimeAsset?.gzipBytes??0),extraRuntimeRequest:!!runtimeAsset,note:'Asset-manifest bytes and network latency are additional. Splitting reduces initial native-page cost, not total feature bytes.'},conditional:{cycles:200,p50Ms:timings[100],p95Ms:timings[190],stats,remainingSheets:0,note:'Synchronous JSDOM CPU measurement, not browser latency or heap proof. No new absolute threshold adopted.'},legacyReplay:{cases:replay,budgetP95Ms:250,pass:replay.every(value=>value.p95Ms<=250)},legacyEditorBudget:{rawBytes:100000,current:sizes['editor.iife.js'].rawBytes,note:'Historical S1 threshold was already exceeded by accepted S2 style editor (172928 bytes). Reported separately; not silently treated as a current PASS.'}};
await mkdir(out,{recursive:true}); await writeFile(new URL('performance.json',out),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));
dom.window.close();
if(!initialPass || !result.legacyReplay.pass)process.exitCode=1;
