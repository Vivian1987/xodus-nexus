import { describe, expect, it } from 'vitest';
import { spawnTracked } from './process.js';

describe('tracked terminal output', () => {
  it('emits carriage-return updates from a pseudo-terminal', async () => {
    const lines: string[] = [];
    const tracked = spawnTracked('printf', ['Downloading 1 MiB/10 MiB 10%%\rDownloading 5 MiB/10 MiB 50%%\n'], {
      terminal: true,
      onLine: (line) => lines.push(line),
    });
    const result = await tracked.result;
    expect(result.code).toBe(0);
    expect(lines.some((line) => line.includes('1 MiB/10 MiB'))).toBe(true);
    expect(lines.some((line) => line.includes('5 MiB/10 MiB'))).toBe(true);
  });

  it('preserves paths with apostrophes without interpreting them as shell code', async () => {
    const tracked = spawnTracked('printf', ['%s\n', "a'b; echo UNSAFE"], { terminal: true });
    const result = await tracked.result;
    expect(result.code).toBe(0);
    expect(result.output).toContain("a'b; echo UNSAFE");
  });
});
