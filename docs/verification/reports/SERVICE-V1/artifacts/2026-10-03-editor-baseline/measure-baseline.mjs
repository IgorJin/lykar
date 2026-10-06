import {brotliCompressSync, gzipSync} from 'node:zlib';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const repoDir = process.cwd();
const packageDir = resolve(repoDir, 'packages/sdk');
const outputDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const artifactDir = join(packageDir, 'dist');
const runs = 7;

const artifactNames = ['sdk.iife.js', 'index.js', 'runtime-core.iife.js', 'editor.iife.js'];
const sizes = {};
for (const name of artifactNames) {
  const content = await readFile(join(artifactDir, name));
  sizes[name] = {
    rawBytes: content.byteLength,
    gzipBytes: gzipSync(content, {level: 9}).byteLength,
    brotliBytes: brotliCompressSync(content).byteLength,
  };
}

const replayCases = [
  {nodes: 100, operations: 25},
  {nodes: 500, operations: 100},
];
const replay = [];
const {applyOperation} = await import(resolve(repoDir, 'packages/runtime/dist/runtime.js'));

for (const testCase of replayCases) {
  const durations = [];
  for (let run = 0; run < runs; run += 1) {
    const html = `<main>${Array.from({length: testCase.nodes}, (_, index) =>
      `<p data-lykar-id="item-${index}">Original ${index}</p>`).join('')}</main>`;
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
      url: 'https://example.test/',
    });
    const operations = Array.from({length: testCase.operations}, (_, index) => ({
      schemaVersion: 1,
      id: `perf-${testCase.nodes}-${index}`,
      kind: 'setText',
      target: {marker: `item-${index % testCase.nodes}`},
      value: `Updated ${index}`,
    }));
    const started = performance.now();
    for (const operation of operations) await applyOperation(dom.window.document, operation);
    durations.push(performance.now() - started);
    dom.window.close();
  }
  durations.sort((a, b) => a - b);
  replay.push({
    ...testCase,
    runs,
    minMs: Number(durations[0].toFixed(3)),
    p50Ms: Number(durations[Math.floor(durations.length * 0.5)].toFixed(3)),
    p95Ms: Number(durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1)].toFixed(3)),
    maxMs: Number(durations.at(-1).toFixed(3)),
  });
}

const budgets = {
  visitorIifeRawBytes: 80_000,
  visitorIifeGzipBytes: 25_000,
  editorIifeRawBytes: 100_000,
  replayP95Ms: 250,
};
const failures = [];
if (sizes['sdk.iife.js'].rawBytes > budgets.visitorIifeRawBytes) failures.push('visitor IIFE raw size');
if (sizes['sdk.iife.js'].gzipBytes > budgets.visitorIifeGzipBytes) failures.push('visitor IIFE gzip size');
if (sizes['editor.iife.js'].rawBytes > budgets.editorIifeRawBytes) failures.push('editor IIFE raw size');
if (replay.some(item => item.p95Ms > budgets.replayP95Ms)) failures.push('replay p95');

const result = {
  interpretation: 'Legacy S1 budgets, measured for comparison; editor overflow is a known open decision for SERVICE-V1-02, not an approved new budget. Local jsdom timing is not a production SLA.',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  method: {
    runs,
    size: 'raw bytes plus gzip level 9 and brotli bytes from built dist artifacts',
    replay: 'sequential runtime applyOperation calls against fresh jsdom documents',
  },
  sizes,
  replay,
  budgets,
  status: failures.length === 0 ? 'PASS' : 'FAIL',
  failures,
};

await mkdir(outputDir, {recursive: true});
await writeFile(join(outputDir, 'performance-baseline.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
// Baseline measurement records legacy failures without proposing a new release gate.
