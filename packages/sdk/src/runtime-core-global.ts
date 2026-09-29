import {Lykar, ManifestRequestError} from '@lykar/runtime';

declare const __LYKAR_SDK_COMPATIBILITY_JSON__: string;

const compatibility = JSON.parse(__LYKAR_SDK_COMPATIBILITY_JSON__) as {
  sdk: string;
  runtime: string;
  editor: string;
  protocol: string;
  protocolSchema: number;
  pageRelease: string;
};

if (typeof window !== 'undefined' && !Object.prototype.hasOwnProperty.call(window, Symbol.for('@lykar/runtime-core/v1'))) {
  Object.defineProperty(window, Symbol.for('@lykar/runtime-core/v1'), {
    value: Object.freeze({Lykar, ManifestRequestError, compatibility: Object.freeze(compatibility)}),
    configurable: false,
    writable: false,
  });
}
