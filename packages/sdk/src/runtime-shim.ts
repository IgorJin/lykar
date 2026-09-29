/* Script-build-only stand-in. The npm ESM build resolves @lykar/runtime normally. */
type RuntimeCore = {
  Lykar: new (options: unknown) => unknown;
  ManifestRequestError: new (...args: never[]) => Error;
  compatibility: {sdk: string; runtime: string; editor: string; protocol: string};
};

const key = Symbol.for('@lykar/runtime-core/v1');

function core(): RuntimeCore | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as Record<symbol, RuntimeCore | undefined>)[key];
}

export function Lykar(options: unknown): unknown {
  const Runtime = core()?.Lykar;
  if (!Runtime) throw new Error('Verified Lykar runtime core has not loaded.');
  return new Runtime(options);
}

Object.defineProperty(Lykar, 'external', {value: true});

export class ManifestRequestError extends Error {
  static [Symbol.hasInstance](value: unknown): boolean {
    const Constructor = core()?.ManifestRequestError;
    return Constructor ? value instanceof Constructor : false;
  }
}

const tokenNames = ['lykar_variant', 'lykar_experiment'] as const;

export function visitorTokensFromLocation(document: Document): {
  variant?: string;
  experiment?: string;
} {
  const location = document.defaultView?.location;
  if (!location) return {};
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  let changed = false;
  for (const name of tokenNames) {
    const legacyToken = search.get(name);
    if (legacyToken === null) continue;
    if (!hash.has(name)) hash.set(name, legacyToken);
    search.delete(name);
    changed = true;
  }
  if (changed) {
    try {
      document.defaultView?.history.replaceState(
        document.defaultView.history.state,
        '',
        `${location.pathname}${search.size ? `?${search}` : ''}${hash.size ? `#${hash}` : ''}`,
      );
    } catch { /* Preserve legacy query links when history is unavailable. */ }
  }
  return {
    variant: hash.get('lykar_variant') ?? search.get('lykar_variant') ?? undefined,
    experiment: hash.get('lykar_experiment') ?? search.get('lykar_experiment') ?? undefined,
  };
}
