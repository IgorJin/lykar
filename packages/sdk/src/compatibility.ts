import {LykarSdkError} from './types.js';

export type SdkAssetCompatibility = {
  sdk: string;
  runtime: string;
  editor: string;
  protocol: string;
  protocolSchema: number;
  pageRelease: string;
};

export type SdkAssetEntry = {
  path: string;
  bytes: number;
  sha256: string;
  integrity: string;
  versionedPath?: string;
};

export type SdkAssetManifest = {
  schemaVersion: number;
  package: string;
  packageVersion: string;
  compatibility: SdkAssetCompatibility;
  assets: Record<string, SdkAssetEntry>;
};

declare const __LYKAR_SDK_COMPATIBILITY_JSON__: string;

const fallbackCompatibility =
  '{"sdk":"0.0.0","runtime":"0.0.0","editor":"0.0.0","protocol":"0.0.0","protocolSchema":1,"pageRelease":"external"}';
const compiledCompatibility =
  typeof __LYKAR_SDK_COMPATIBILITY_JSON__ === 'string'
    ? __LYKAR_SDK_COMPATIBILITY_JSON__
    : fallbackCompatibility;

export const SDK_COMPATIBILITY: Readonly<SdkAssetCompatibility> =
  Object.freeze(JSON.parse(compiledCompatibility) as SdkAssetCompatibility);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integrityForHexSha256(value: string): string {
  const bytes = value.match(/.{2}/g)?.map(byte => String.fromCharCode(Number.parseInt(byte, 16)));
  return `sha256-${globalThis.btoa(bytes?.join('') ?? '')}`;
}

export function validateAssetManifest(value: unknown): SdkAssetManifest {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new LykarSdkError(
      'ASSET_MANIFEST_INVALID',
      'Lykar asset manifest must use schemaVersion 1.',
    );
  }
  if (
    value.package !== '@lykar/sdk' ||
    typeof value.packageVersion !== 'string' ||
    !isRecord(value.compatibility) ||
    !isRecord(value.assets)
  ) {
    throw new LykarSdkError(
      'ASSET_MANIFEST_INVALID',
      'Lykar asset manifest is missing package, compatibility, or asset metadata.',
    );
  }

  for (const [key, expected] of Object.entries(SDK_COMPATIBILITY)) {
    if (value.compatibility[key] !== expected) {
      throw new LykarSdkError(
        'ASSET_COMPATIBILITY_MISMATCH',
        'Lykar asset compatibility mismatch for ' + key + '.',
      );
    }
  }
  if (value.packageVersion !== SDK_COMPATIBILITY.sdk) {
    throw new LykarSdkError(
      'ASSET_COMPATIBILITY_MISMATCH',
      'Lykar asset package version does not match the running SDK.',
    );
  }

  const editor = value.assets['editor.iife.js'];
  if (
    !isRecord(editor) ||
    editor.path !== 'editor.iife.js' ||
    typeof editor.bytes !== 'number' ||
    !Number.isSafeInteger(editor.bytes) ||
    editor.bytes <= 0 ||
    typeof editor.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(editor.sha256) ||
    typeof editor.integrity !== 'string' ||
    !/^sha256-[A-Za-z0-9+/]+={0,2}$/.test(editor.integrity) ||
    editor.integrity !== integrityForHexSha256(editor.sha256) ||
    editor.versionedPath !== `editor-${SDK_COMPATIBILITY.sdk.replace(/[^0-9A-Za-z.-]+/g, '-')}.iife.js`
  ) {
    throw new LykarSdkError(
      'ASSET_MANIFEST_INVALID',
      'Lykar asset manifest does not contain a valid editor asset.',
    );
  }

  return value as SdkAssetManifest;
}
