import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import {readFile} from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const runtimeJson = JSON.parse(await readFile(new URL('../runtime/package.json', import.meta.url), 'utf8'));
const editorJson = JSON.parse(await readFile(new URL('../editor-bridge/package.json', import.meta.url), 'utf8'));
const protocolJson = JSON.parse(await readFile(new URL('../protocol/package.json', import.meta.url), 'utf8'));
const compatibilityJson = JSON.stringify({
  sdk: packageJson.version,
  runtime: runtimeJson.version,
  editor: editorJson.version,
  protocol: protocolJson.version,
  protocolSchema: 1,
  pageRelease: 'external',
});

function compatibilityConstants() {
  return {
    name: 'lykar-compatibility-constants',
    transform(code) {
      if (!code.includes('__LYKAR_SDK_COMPATIBILITY_JSON__')) return null;
      return {
        code: code.replaceAll(
          '__LYKAR_SDK_COMPATIBILITY_JSON__',
          JSON.stringify(compatibilityJson),
        ),
        map: null,
      };
    },
  };
}

const plugins = [
  nodeResolve({browser: true, extensions: ['.mjs', '.js', '.json', '.ts']}),
  commonjs(),
  esbuild({target: 'es2020', tsconfig: 'tsconfig.json'}),
  compatibilityConstants(),
];

export default [
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins,
  },
  {
    input: 'src/global.ts',
    output: {
      file: 'dist/sdk.iife.js',
      format: 'iife',
      name: 'Lykar',
      sourcemap: true,
    },
    plugins,
  },
];
