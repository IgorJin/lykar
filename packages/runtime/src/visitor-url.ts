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
    } catch {
      // New links use fragments; legacy query links still resolve if history is unavailable.
    }
  }

  return {
    variant: hash.get('lykar_variant') ?? search.get('lykar_variant') ?? undefined,
    experiment: hash.get('lykar_experiment') ?? search.get('lykar_experiment') ?? undefined,
  };
}
