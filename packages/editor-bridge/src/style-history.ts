/** CSSOM snapshots preserve individual longhands, priorities and absence.
 * Only changed declarations are restored, so unrelated host edits survive. */
export type Declaration = {property: string; value: string; priority: string};
export type StyleMutation = {before: Declaration[]; after: Declaration[]; touched: string[]};
export function styleSnapshot(style: CSSStyleDeclaration): Declaration[] {
  return Array.from({length: style.length}, (_, index) => style.item(index)).map(property => ({
    property, value: style.getPropertyValue(property), priority: style.getPropertyPriority(property),
  }));
}
export function styleMutation(before: Declaration[], after: Declaration[]): StyleMutation {
  const names = new Set([...before, ...after].map(item => item.property));
  const touched = [...names].filter(name => {
    const a = before.find(item => item.property === name);
    const b = after.find(item => item.property === name);
    return a?.value !== b?.value || a?.priority !== b?.priority;
  });
  return {before, after, touched};
}
export function restoreStyle(style: CSSStyleDeclaration, mutation: StyleMutation): boolean {
  const current = styleSnapshot(style);
  for (const property of mutation.touched) {
    const expected = mutation.after.find(item => item.property === property);
    const actual = current.find(item => item.property === property);
    if (actual?.value !== expected?.value || actual?.priority !== expected?.priority) return false;
  }
  for (const property of mutation.touched) style.removeProperty(property);
  for (const item of mutation.before) {
    if (mutation.touched.includes(item.property)) style.setProperty(item.property, item.value, item.priority);
  }
  return true;
}
