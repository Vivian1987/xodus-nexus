import { describe, expect, it } from 'vitest';
import { downloadFailure, parseBackendHelp, progressBytesFromLine, progressFromLine, safeProductId, stripAnsi } from './utils.js';

describe('parseBackendHelp', () => {
  it('detects only advertised commands', () => {
    const parsed = parseBackendHelp(`Usage: xodus-cli <COMMAND>\n\nCommands:\n  account     Show stored account\n  download    Download files\n  login       \n  logout      \n  streaming   Stream\n  run         Run game\n  help        Help\n`);
    expect(parsed.account).toBe(true);
    expect(parsed.streaming).toBe(true);
    expect(parsed.logout).toBe(true);
    expect(parsed.commands).toContain('run');
  });
});

describe('progress parser', () => {
  it('parses percentages and byte ratios', () => {
    expect(progressFromLine('Downloading 42%')).toBe(42);
    expect(progressFromLine('1.5 MiB / 3 MiB')).toBe(50);
    expect(progressFromLine('Downloading                    512 MiB/2 GiB 12 MiB/s [###] 25%')).toBe(25);
    expect(progressBytesFromLine('Downloading                    512 MiB/2 GiB 12 MiB/s [###] 25%')).toEqual({ current: 512 * 1024 ** 2, total: 2 * 1024 ** 3 });
  });
  it('strips terminal control codes', () => expect(stripAnsi('\u001b[32mok\u001b[0m\r')).toContain('ok'));
});

describe('download failure summary', () => {
  it('shows panic cause instead of Rust backtrace hint', () => {
    const log = [
      '0% · Initializing 0 B/9.13 GiB',
      "thread 'main' panicked at streaming.rs:280:14:",
      'ok: Header(Io(Custom { kind: UnexpectedEof, error: "cache ended before cached_len" }))',
      'note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace',
    ];
    expect(downloadFailure(log, 101)).toContain('cache ended before cached_len');
  });
});

describe('product id validation', () => {
  it('normalizes safe IDs', () => expect(safeProductId(' 9n4pt8hgcdhq ')).toBe('9N4PT8HGCDHQ'));
  it('rejects shell-like input', () => expect(() => safeProductId('foo; rm -rf')).toThrow());
});
