import { Lykar, consent, init, track } from './runtime.js';

const globalApi = Object.assign(Lykar, { consent, init, track });

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'Lykar', {
    configurable: true,
    value: globalApi,
    writable: false,
  });
}
