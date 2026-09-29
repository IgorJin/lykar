import {fileURLToPath} from 'node:url';

const reactWrapper = fileURLToPath(new URL('./react-dom-client.js', import.meta.url));
const vueWrapper = fileURLToPath(new URL('./vue.js', import.meta.url));

function replacement(source, importer = '') {
  if (source === 'react-dom/client' && importer.split('?')[0] !== reactWrapper) return reactWrapper;
  if (source === 'vue' && importer.split('?')[0] !== vueWrapper) return vueWrapper;
  return undefined;
}

export function lykarEsbuildPlugin() {
  return {
    name: 'lykar-framework-boot',
    setup(build) {
      build.onResolve({filter: /^(react-dom\/client|vue)$/}, args => {
        const path = replacement(args.path, args.importer);
        return path ? {path} : undefined;
      });
    },
  };
}

export function lykarVitePlugin() {
  return {
    name: 'lykar-framework-boot',
    enforce: 'pre',
    resolveId(source, importer) {
      return replacement(source, importer);
    },
  };
}
