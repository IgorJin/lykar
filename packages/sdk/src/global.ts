import {Lykar, consent, init, track} from './index.js';
import type {LykarSdkOptions} from './types.js';

type GlobalApi = typeof Lykar & {
  init: typeof init;
  track: typeof track;
  consent: typeof consent;
};

function scriptOptions(script: HTMLScriptElement): LykarSdkOptions | null {
  const projectKey = script.dataset.lykarProject;
  if (!projectKey) return null;
  const scriptUrl = script.src ? new URL(script.src, document.baseURI) : null;
  return {
    projectKey,
    apiBaseUrl: script.dataset.lykarApi,
    mode: (script.dataset.lykarMode as LykarSdkOptions['mode']) ?? 'auto',
    delivery: (script.dataset.lykarDelivery as LykarSdkOptions['delivery']) ?? 'links-only',
    editorAssetUrl: scriptUrl ? new URL('editor.iife.js', scriptUrl).toString() : undefined,
    assetManifestUrl: scriptUrl ? new URL('asset-manifest.json', scriptUrl).toString() : undefined,
    editorAssetOrigin: scriptUrl?.origin,
  };
}

const globalApi = Object.assign(Lykar, {init, track, consent}) as GlobalApi;

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'Lykar', {
    configurable: true,
    value: globalApi,
    writable: false,
  });

  const script = document.currentScript as HTMLScriptElement | null;
  const options = script ? scriptOptions(script) : null;
  if (options) {
    const sdk = init(options);
    Object.defineProperty(window, '__LYKAR_SDK__', {
      configurable: true,
      value: sdk,
      writable: false,
    });
    void sdk.start();
  }
}
