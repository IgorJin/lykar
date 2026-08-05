export const camelToKebab = (string: string): string => string.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();

export const camelCase = (value: string): string => {
  return value.replace(/-./g, x => x[1].toUpperCase());
};
