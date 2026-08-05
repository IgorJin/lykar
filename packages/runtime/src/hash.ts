const SHA256_PATTERN = /^(?:sha256:)?([0-9a-f]{64})$/i;

export function normalizeSha256(value: string): string | null {
  return SHA256_PATTERN.exec(value.trim())?.[1]?.toLowerCase() ?? null;
}

export async function sha256Text(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is unavailable; SHA-256 preconditions cannot be verified');
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function matchesSha256(value: string, expected: string): Promise<boolean> {
  const normalized = normalizeSha256(expected);
  if (!normalized) throw new Error('Expected hash is not a SHA-256 hex digest');
  return (await sha256Text(value)) === normalized;
}
