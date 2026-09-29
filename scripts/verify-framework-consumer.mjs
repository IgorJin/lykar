import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build as esbuild} from 'esbuild';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const vite = await import(pathToFileURL(require.resolve('vite', {paths: [require.resolve('vitest/package.json')]})).href);
const run = promisify(execFile);
const root = resolve(new URL('..', import.meta.url).pathname);
const temp = await mkdtemp(join(tmpdir(), 'lykar-framework-consumer-'));
try {
  const packed = await run('npm', ['pack', '--workspace', '@lykar/frameworks', '--pack-destination', temp], {cwd: root});
  const tarball = packed.stdout.trim().split('\n').at(-1);
  const dependencies = {'@lykar/frameworks': `file:${join(temp, tarball)}`};
  for (const name of ['react', 'react-dom', 'vue', '@types/react', '@types/react-dom']) dependencies[name] = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'))).version;
  await writeFile(join(temp, 'package.json'), JSON.stringify({private: true, type: 'module', dependencies}));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: temp});
  const framework = join(temp, 'node_modules/@lykar/frameworks');
  const {lykarEsbuildPlugin, lykarVitePlugin} = await import(pathToFileURL(join(framework, 'src/build.js')).href);
  await run(process.execPath, ['--input-type=module', '-e', "await import('@lykar/frameworks/react-dom-client'); await import('@lykar/frameworks/vue'); await import('@lykar/frameworks/build');"], {cwd: temp});
  const source = `import {createRoot} from 'react-dom/client'; import {createApp, h} from 'vue';
    import {lykarVitePlugin, lykarEsbuildPlugin} from '@lykar/frameworks/build';
    void lykarVitePlugin; void lykarEsbuildPlugin;
    export const react = () => createRoot(document.createElement('div'));
    export const vue = () => createApp({render: () => h('button', 'Continue')});`;
  // Types exercise public wrapper exports; browser entry exercises automatic bare-import rewriting.
  await writeFile(join(temp, 'types.ts'), source.replace("'react-dom/client'", "'@lykar/frameworks/react-dom-client'").replace("'vue'", "'@lykar/frameworks/vue'"));
  await run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', join(temp, 'types.ts')], {cwd: temp});
  await writeFile(join(temp, 'entry.js'), source.split("    import {lykarVitePlugin")[0] + "export {createRoot, createApp, h};");
  const es = await esbuild({entryPoints: [join(temp, 'entry.js')], bundle: true, write: false, format: 'esm', plugins: [lykarEsbuildPlugin()]});
  if (!es.outputFiles[0].text.includes('@lykar/framework-roots/v1')) throw new Error('esbuild omitted bridge');
  await vite.build({root: temp, configFile: false, logLevel: 'error', plugins: [lykarVitePlugin()], build: {outDir: join(temp, 'vite-dist'), minify: false, lib: {entry: join(temp, 'entry.js'), formats: ['es'], fileName: 'consumer'}}});
  const output = await readFile(join(temp, 'vite-dist/consumer.js'), 'utf8');
  if (!output.includes('@lykar/framework-roots/v1')) throw new Error('Vite omitted bridge');
  console.log(JSON.stringify({result: 'PASS', dependencies, vite: vite.version, checks: ['packed installation', 'SSR imports', 'public TypeScript', 'esbuild automatic rewrite', 'Vite production automatic rewrite']}, null, 2));
} finally {await rm(temp, {recursive: true, force: true});}
