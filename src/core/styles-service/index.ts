import { styleConfig, StyleProperty } from './styles-config';

function resolveExtends(
  config: typeof styleConfig
): StyleProperty[] {
  const map = Object.fromEntries(config.map(p => [p.key, p]));
  
  return config.map(p => {
    if ('extends' in p && p.extends && map[p.extends]) {
      return { ...map[p.extends], ...p, extends: undefined };
    }
    return p;
  });
}

const resolvedConfig = resolveExtends(styleConfig);