import { describe, expect, it } from 'vitest';
import { spawnGameProcess } from './game-process.js';

describe('game process', () => {
  it('launches directly and monitors output and exit status', async () => {
    const lines: string[] = [];
    const game = await spawnGameProcess('printf', ['game output\n'], { onLine: (line) => lines.push(line) });
    const result = await game.result;
    expect(result.code).toBe(0);
    expect(result.output).toContain('game output');
    expect(lines).toContain('game output');
    await game.cleanup();
  });
});
