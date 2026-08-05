import { Lykar, init } from './runtime.js';

const globalApi = Object.assign(Lykar, { init });

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'Lykar', {
    configurable: true,
    value: globalApi,
    writable: false,
  });
}
