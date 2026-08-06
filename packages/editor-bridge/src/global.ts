import { LykarEditor, startEditor } from './editor.js';

const globalApi = Object.assign(LykarEditor, { start: startEditor });

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'LykarEditor', {
    configurable: true,
    value: globalApi,
    writable: false,
  });
}
