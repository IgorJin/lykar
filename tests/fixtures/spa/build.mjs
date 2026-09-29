import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {lykarEsbuildPlugin} from '../../../packages/frameworks/src/build.js';

const directory = fileURLToPath(new URL('.', import.meta.url));
const outputDirectory = join(directory, 'dist');
await mkdir(outputDirectory, {recursive: true});
await build({
  entryPoints: [join(directory, 'react-client.mjs'), join(directory, 'vue-client.mjs'), join(directory, 'sdk-client.mjs')],
  outdir: outputDirectory,
  entryNames: '[name]',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  define: {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  sourcemap: true,
  plugins: [lykarEsbuildPlugin()],
});
