import {parsePublishedManifestV1} from '@lykar/protocol';
import {ManifestRequestError} from './manifest-client.js';
import type {DeploymentSelection, ManifestClientOptions} from './types.js';

/** Anonymous resolution is deliberately separate from capability-bearing previews. */
export async function fetchDeployment(options: Pick<ManifestClientOptions,
  'projectKey' | 'apiBaseUrl' | 'pathname' | 'signal' | 'fetch'>): Promise<DeploymentSelection | null> {
  const query = new URLSearchParams({pathname: options.pathname});
  const base = (options.apiBaseUrl ?? '').replace(/\/+$/, '');
  const url = `${base}/api/runtime/projects/${encodeURIComponent(options.projectKey)}/deployment?${query}`;
  try {
    const response = await options.fetch(url, {
      method: 'GET', credentials: 'omit', cache: 'no-store',
      headers: {Accept: 'application/json'}, signal: options.signal,
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new ManifestRequestError(`Deployment request returned HTTP ${response.status}`, response.status);
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid deployment response');
    const data = value as Record<string, unknown>;
    if (typeof data.pageId !== 'string' || !data.pageId.trim()
      || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0) {
      throw new Error('Invalid deployment metadata');
    }
    const metadata = {pageId: data.pageId, revision: data.revision as number};
    if (data.activeReleaseId === null && data.manifest === null) {
      return {...metadata, activeReleaseId: null, manifest: null};
    }
    if (typeof data.activeReleaseId !== 'string' || !data.activeReleaseId || metadata.revision === 0) {
      throw new Error('Invalid active release');
    }
    const manifest = parsePublishedManifestV1(data.manifest);
    if (manifest.pageId !== data.pageId || manifest.releaseId !== data.activeReleaseId
      || manifest.pathname !== options.pathname) throw new Error('Deployment manifest does not match its pointer or path');
    return {...metadata, activeReleaseId: data.activeReleaseId, manifest};
  } catch (error) {
    if (error instanceof ManifestRequestError) throw error;
    throw new ManifestRequestError(error instanceof Error ? error.message : 'Deployment request failed');
  }
}
