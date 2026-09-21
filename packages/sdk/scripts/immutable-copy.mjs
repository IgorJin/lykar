import {readFile, writeFile} from 'node:fs/promises';
import {basename} from 'node:path';

export async function copyImmutable(source, target) {
  const content = await readFile(source);
  try {
    const existing = await readFile(target);
    if (!existing.equals(content)) {
      throw new Error(`Immutable Lykar asset conflict: ${basename(target)}`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(target, content, {flag: 'wx'});
  }
}
