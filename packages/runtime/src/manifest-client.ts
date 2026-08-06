import { parsePublishedManifestV1 } from '@lykar/protocol';

import type { ManifestClientOptions, RuntimeSelection } from './types.js';

export class ManifestRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ManifestRequestError';
  }
}

export async function fetchManifest(options: ManifestClientOptions): Promise<RuntimeSelection> {
  if (!options.projectKey.trim()) throw new ManifestRequestError('projectKey must be a non-empty string');
  if (options.version !== undefined && (!Number.isSafeInteger(options.version) || options.version <= 0)) {
    throw new ManifestRequestError('version must be a positive integer');
  }

  const baseUrl = (options.apiBaseUrl ?? '').replace(/\/+$/, '');
  const path = `/api/runtime/projects/${encodeURIComponent(options.projectKey)}/manifest`;
  const query = new URLSearchParams();

  query.set('pathname', options.pathname);
  if (options.version !== undefined) query.set('version', String(options.version));
  if (options.variantToken) query.set('variantToken', options.variantToken);

  const url = `${baseUrl}${path}${query.size > 0 ? `?${query}` : ''}`;
  let response: Response;
  try {
    response = await options.fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      ...(options.credentials ? { credentials: options.credentials } : {}),
    });
  } catch (error) {
    throw new ManifestRequestError(`Manifest request failed: ${errorMessage(error)}`);
  }

  if (response.status === 204) return null;
  if (!response.ok) {
    throw new ManifestRequestError(`Manifest request returned HTTP ${response.status}`, response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ManifestRequestError(`Manifest response is not valid JSON: ${errorMessage(error)}`, response.status);
  }

  if (!isRecord(payload) || !('manifest' in payload)) {
    throw new ManifestRequestError('Manifest response must contain a manifest field', response.status);
  }

  if (payload.manifest === null) {
    if (
      !isRecord(payload.variant)
      || typeof payload.variant.experimentId !== 'string'
      || (payload.variant.key !== 'A' && payload.variant.key !== 'B')
    ) {
      throw new ManifestRequestError('Native variant response is invalid', response.status);
    }
    return {
      mode: 'native-variant',
      experimentId: payload.variant.experimentId,
      variantKey: payload.variant.key,
    };
  }

  try {
    return parsePublishedManifestV1(payload.manifest);
  } catch (error) {
    throw new ManifestRequestError(errorMessage(error), response.status);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
