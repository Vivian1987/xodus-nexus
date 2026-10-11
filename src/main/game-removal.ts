import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Game } from '../shared/types.js';

function contains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

export async function validateGameTrashTarget(game: Game, otherGames: Game[], protectedPaths: string[]): Promise<string> {
  const target = path.resolve(game.path);
  const root = path.parse(target).root;
  if (target === root) throw new Error('Refusing to remove a filesystem root.');
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('The game location must be a real directory.');
  if (await fs.realpath(target) !== target) throw new Error('The game location contains a symbolic link.');
  if (protectedPaths.some((entry) => contains(target, path.resolve(entry)))) {
    throw new Error('The game location contains a protected launcher or system directory.');
  }
  if (otherGames.some((entry) => contains(target, path.resolve(entry.path)))) {
    throw new Error('The game location contains another library game.');
  }
  const files = await fs.readdir(target);
  if (!files.some((name) => /^(MicrosoftGame\.config|AppxManifest\.xml)$/i.test(name))) {
    throw new Error('The game manifest is missing; remove this entry from the library instead.');
  }
  return target;
}
