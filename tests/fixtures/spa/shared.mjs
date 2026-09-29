export function routeFromPath(pathname) {
  const match = /^\/__e2e__\/s4-(react|vue)-(csr|ssr)-(a|b)(?:-([a-z0-9-]+))?$/.exec(pathname);
  if (!match) return null;
  return {framework: match[1], mode: match[2], page: match[3], suffix: match[4] ?? ''};
}

export function pathFor(route, page) {
  return `/__e2e__/s4-${route.framework}-${route.mode}-${page}${route.suffix ? `-${route.suffix}` : ''}`;
}

export function pageTitle(page) {
  return page === 'a' ? 'Alpha page' : 'Beta page';
}
