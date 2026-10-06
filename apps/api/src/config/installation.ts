export type InstallationOptions = {
  apiBaseUrl?: string;
  release?: {version: string; baseUrl: string};
};
export type InstallationAssets = {
  mode: 'development' | 'versioned';
  sdkVersion: string;
  sdkUrl: string;
  runtimeAssetUrl: string;
  editorAssetUrl: string;
  assetManifestUrl: string;
  editorAssetOrigin: string;
};
export type InstallationConfig = {
  status: 'configured' | 'unavailable';
  apiBaseUrl: string;
  assets: InstallationAssets | null;
  reason?: string;
};

function endpoint(value: string, development: boolean): URL {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || /^127\./.test(hostname);
  if ((!development && loopback) || url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(development && url.protocol === 'http:'))) {
    throw new Error('Installation endpoints require HTTPS and must not contain credentials, query or fragment');
  }
  return url;
}

/** Only configured immutable releases may be advertised outside development. */
export function installationConfig(
  appOrigin: string,
  development: boolean,
  options: InstallationOptions = {},
  environment: NodeJS.ProcessEnv = process.env,
): InstallationConfig {
  const apiBaseUrl = endpoint(options.apiBaseUrl ?? environment.LYKAR_INSTALL_API_BASE_URL ?? appOrigin, development).toString().replace(/\/$/, '');
  const version = options.release?.version ?? environment.LYKAR_SDK_RELEASE_VERSION;
  const releaseBase = options.release?.baseUrl ?? environment.LYKAR_SDK_RELEASE_BASE_URL;
  if (Boolean(version) !== Boolean(releaseBase)) throw new Error('Configure SDK release version and base URL together');
  if (version && releaseBase) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid SDK release version');
    const base = endpoint(releaseBase, false);
    if (!base.pathname.endsWith('/') || !base.pathname.endsWith(`/${version}/`)) {
      throw new Error('SDK release base URL must be an immutable version directory ending with a slash');
    }
    return {status: 'configured', apiBaseUrl, assets: assets(base, version, 'versioned')};
  }
  if (!development) return {status: 'unavailable', apiBaseUrl, assets: null, reason: 'RELEASE_ASSETS_NOT_CONFIGURED'};
  return {status: 'configured', apiBaseUrl, assets: assets(new URL('/lykar-assets/dev/', appOrigin), '0.0.0', 'development')};
}

function assets(base: URL, sdkVersion: string, mode: InstallationAssets['mode']): InstallationAssets {
  const tag = mode === 'versioned' ? `-${sdkVersion}` : '';
  return {mode, sdkVersion, sdkUrl: new URL(`sdk${tag}.iife.js`, base).toString(),
    runtimeAssetUrl: new URL(`runtime-core${tag}.iife.js`, base).toString(),
    editorAssetUrl: new URL(`editor${tag}.iife.js`, base).toString(),
    assetManifestUrl: new URL('asset-manifest.json', base).toString(), editorAssetOrigin: base.origin};
}
