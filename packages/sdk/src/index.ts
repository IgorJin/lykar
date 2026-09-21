export {Lykar} from './sdk.js';
export {
  LykarSdkError,
  type EditorApplyHandler,
  type EditorCommitHandler,
  type EditorHandle,
  type LykarDeliveryMode,
  type LykarNavigateOptions,
  type LykarSdkConstructorOptions,
  type LykarSdkMode,
  type LykarSdkOptions,
  type LykarSdkResult,
  type LykarSdkResultMode,
  type LykarTrackResult,
  type SdkEditorCapability,
  type SdkShareAccess,
} from './types.js';
export {
  exchangeEditorLaunch,
  exchangeShareAccess,
  getLocationSelectors,
} from './access.js';
export {
  SDK_COMPATIBILITY,
  validateAssetManifest,
  type SdkAssetCompatibility,
  type SdkAssetEntry,
  type SdkAssetManifest,
} from './compatibility.js';

let activeSdk: import('./sdk.js').Lykar | undefined;

export function init(
  projectKey: string,
  options?: import('./types.js').LykarSdkConstructorOptions,
): import('./sdk.js').Lykar;
export function init(options: import('./types.js').LykarSdkOptions): import('./sdk.js').Lykar;
export function init(
  projectKeyOrOptions: string | import('./types.js').LykarSdkOptions,
  options: import('./types.js').LykarSdkConstructorOptions = {},
): import('./sdk.js').Lykar {
  activeSdk =
    typeof projectKeyOrOptions === 'string'
      ? new (requireLykar())(projectKeyOrOptions, options)
      : new (requireLykar())(projectKeyOrOptions);
  return activeSdk;
}

export function track(
  eventName: string,
  properties?: Record<string, string | number | boolean | null>,
): Promise<{accepted: boolean; duplicate?: boolean; code?: string}> {
  return activeSdk?.track(eventName, properties) ?? Promise.resolve({accepted: false, code: 'NO_ACTIVE_RUNTIME'});
}

export function consent(value: 'pending' | 'granted' | 'denied'): void {
  activeSdk?.consent(value);
}

function requireLykar(): typeof import('./sdk.js').Lykar {
  // The binding is imported statically below; keeping init as a function avoids
  // a second public class name in the generated global bundle.
  return Lykar;
}

import {Lykar} from './sdk.js';
