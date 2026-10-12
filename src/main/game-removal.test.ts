import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Game } from '../shared/types.js';
import { validateGameTrashTarget } from './game-removal.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true }))); });

async function fixture(): Promise<Game> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'xodus-trash-test-'));
  temporary.push(parent);
  const directory = path.join(parent, 'game');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'MicrosoftGame.config'), '<Game />');
  return { id: 'game', title: 'Test', path: directory, installState: 'ready', addedAt: new Date().toISOString() };
}

describe('game removal target', () => {
  it('accepts an isolated game directory with a manifest', async () => {
    const game = await fixture();
    expect(await validateGameTrashTarget(game, [], [os.homedir()])).toBe(game.path);
  });

  it('rejects a directory containing another game', async () => {
    const game = await fixture();
    const nested = { ...game, id: 'nested', path: path.join(game.path, 'nested') };
    await expect(validateGameTrashTarget(game, [nested], [])).rejects.toThrow('another library game');
  });

  it('rejects a protected directory and a missing manifest', async () => {
    const game = await fixture();
    await expect(validateGameTrashTarget(game, [], [path.join(game.path, 'runtime')])).rejects.toThrow('protected');
    await fs.unlink(path.join(game.path, 'MicrosoftGame.config'));
    await expect(validateGameTrashTarget(game, [], [])).rejects.toThrow('manifest');
  });
});
