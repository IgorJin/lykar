import { LykarEditor, startEditor } from './editor.js';
import { exchangeEditorLaunch, exchangeShareAccess } from './access-client.js';

const globalApi = Object.assign(LykarEditor, {
  start: startEditor,
  exchangeEditorLaunch,
  exchangeShareAccess,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'LykarEditor', {
    configurable: true,
    value: globalApi,
    writable: false,
  });
}
