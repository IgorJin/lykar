import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';

const require = createRequire(join(process.cwd(), 'package.json'));
const {build} = require('esbuild');
const {chromium} = require('playwright');
const root = process.cwd();
const buildModule = async globalName => (await build({
  absWorkingDir: root,
  entryPoints: ['packages/runtime/src/conditional-runtime.ts'],
  alias: {'@lykar/protocol': join(root, 'packages/protocol/src/index.ts')},
  bundle: true, platform: 'browser', format: 'iife', globalName, write: false,
})).outputFiles[0].text;
const [bundleA, bundleB] = await Promise.all([buildModule('ConditionalA'), buildModule('ConditionalB')]);
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
});
try {
  const page = await browser.newPage();
  const results = {};
  await page.setContent('<button id="cta" style="color:orange">Продолжить</button>');
  await page.addScriptTag({content: bundleA});
  results.normal = await page.evaluate(async () => {
    const button = document.querySelector('#cta');
    const diagnostics = [];
    const runtime = new ConditionalA.ConditionalRuntime({
      document, root: document.body,
      groups: [{id:'continue',target:{selectors:{css:'#cta'}},when:{kind:'textEquals',value:'Продолжить'},operations:[{kind:'setText',value:'Далее'},{kind:'setStyle',property:'color',value:'navy'}]}],
      resolveTargetSync: () => button, onDiagnostic: event => diagnostics.push(event.code),
    });
    runtime.start();
    const active = {text:button.textContent,color:getComputedStyle(button).color,styles:document.head.querySelectorAll('style').length,own:runtime.stats.ownRecords};
    button.style.color = 'navy';
    button.firstChild.data = 'Ожидаем';
    await Promise.resolve();
    const restored = {text:button.textContent,inline:button.style.color,styles:document.head.querySelectorAll('style').length};
    runtime.dispose();
    return {active,restored,diagnostics};
  });
  assert.deepEqual(results.normal.active.text, 'Далее');
  assert.deepEqual(results.normal.active.color, 'rgb(0, 0, 128)');
  assert.deepEqual(results.normal.restored, {text:'Ожидаем',inline:'navy',styles:0});

  await page.setContent('<style>#cta { color:red !important }</style><button id="cta">Продолжить</button>');
  await page.addScriptTag({content: bundleA});
  results.important = await page.evaluate(() => {
    const button = document.querySelector('#cta');
    const runtime = new ConditionalA.ConditionalRuntime({
      document, root: document.body,
      groups: [{id:'continue',target:{selectors:{css:'#cta'}},when:{kind:'textEquals',value:'Продолжить'},operations:[{kind:'setText',value:'Далее'},{kind:'setStyle',property:'color',value:'navy'}]}],
      resolveTargetSync: () => button,
    });
    runtime.start();
    const before = runtime.stats.syncPasses;
    const ownBefore = runtime.stats.ownRecords;
    for (let index=0; index<10; index++) runtime.sync();
    const result = {text:button.textContent,color:getComputedStyle(button).color,state:runtime.groupStates[0],styles:document.head.querySelectorAll('style').length,extraPasses:runtime.stats.syncPasses-before,extraOwnWrites:runtime.stats.ownRecords-ownBefore};
    runtime.dispose();
    return result;
  });
  assert.equal(results.important.text, 'Продолжить');
  assert.equal(results.important.color, 'rgb(255, 0, 0)');
  assert.equal(results.important.state.reason, 'STYLE_OVERLAY_OVERRIDDEN');
  assert.equal(results.important.styles, 1);
  assert.equal(results.important.extraPasses, 10);
  assert.equal(results.important.extraOwnWrites, 0);

  await page.setContent('<button id="one">Продолжить</button><button id="two">Продолжить</button>');
  await page.addScriptTag({content: bundleA});
  await page.addScriptTag({content: bundleB});
  results.copies = await page.evaluate(() => {
    const make = (Constructor,id) => {
      const button = document.querySelector(`#${id}`);
      const runtime = new Constructor({document,root:document.body,
        groups:[{id,target:{selectors:{css:`#${id}`}},when:{kind:'textEquals',value:'Продолжить'},operations:[{kind:'setText',value:'Далее'},{kind:'setStyle',property:'color',value:'navy'}]}],
        resolveTargetSync:()=>button});
      runtime.start();
      return runtime;
    };
    const first = make(ConditionalA.ConditionalRuntime,'one');
    const second = make(ConditionalB.ConditionalRuntime,'two');
    const attrs = ['one','two'].map(id=>document.querySelector(`#${id}`).getAttributeNames().find(name=>name.startsWith('data-lykar-overlay-')));
    const activeStyles = document.head.querySelectorAll('style').length;
    first.dispose(); second.dispose();
    return {attrs,activeStyles,remainingStyles:document.head.querySelectorAll('style').length};
  });
  assert.notEqual(results.copies.attrs[0], results.copies.attrs[1]);
  assert.equal(results.copies.activeStyles, 2);
  assert.equal(results.copies.remainingStyles, 0);
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
