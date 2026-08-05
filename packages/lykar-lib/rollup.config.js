import path from 'path';
import peerDepsExternal from 'rollup-plugin-peer-deps-external';
import alias from '@rollup/plugin-alias';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';

const isProduction = process.env.NODE_ENV === 'production';
const __dirname = path.resolve();

export default {
  input: 'src/index.tsx',
  output: [
    {
      file: 'dist/editor.umd.js',
      format: 'umd',
      name: 'PageEditor',
      sourcemap: true
    },
    {
      file: 'dist/editor.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  plugins: [
    // 1) Делает peerDependencies внешними (если в package.json указаны)
    peerDepsExternal(),

    // 2) Настройка alias для импортов ~/...
    alias({
      entries: [{ find: '@', replacement: path.resolve(__dirname, 'src') }]
    }),


    // 3) Разрешить модули из node_modules
    nodeResolve({
      browser: true,
      extensions: ['.js', '.ts', '.tsx', '.jsx']
    }),

    // 4) Преобразование CommonJS → ESM (нужно для некоторых пакетов)
    commonjs(),

    // 5) Транспиляция TypeScript (использует tsconfig.json)
    typescript({
      tsconfig: './tsconfig.json',
      sourceMap: !isProduction,
      declaration: true,
      declarationDir: 'dist/types',
      rootDir: 'src'
    }),

    // 6) Загрузка CSS через PostCSS (инлайн в JS)
    postcss({
      extensions: ['.css']
      // inject: true, // по умолчанию стили инлайнятся
      // extract: false // встроить в JS
    }),

    // 7) Dev-сервер + LiveReload (только в режиме разработки)
    !isProduction &&
      serve({
        open: true,
        contentBase: ['public', 'dist'],
        host: 'localhost',
        port: 3001
      }),

    !isProduction && livereload({ watch: 'dist' }),

    // 8) Минификация (только в продакшн-режиме)
    isProduction && terser()
  ].filter(Boolean),
  // Не объявляем preact и preact/hooks external, чтобы они вошли в бандл
  external: []
};