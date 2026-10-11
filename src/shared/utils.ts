import type { BackendCapabilities } from './types.js';

const COMMAND_LINE = /^[ \t]{2}([a-z][a-z0-9-]+)[ \t]{2,}/gm;

export function parseBackendHelp(help: string): BackendCapabilities {
  const commands = [...help.matchAll(COMMAND_LINE)].map((match) => match[1]);
  const version = help.match(/xodus-cli\s+([\w.+-]+)/i)?.[1];
  return {
    commands,
    account: commands.includes('account'),
    login: commands.includes('login'),
    logout: commands.includes('logout'),
    download: commands.includes('download'),
    streaming: commands.includes('streaming'),
    run: commands.includes('run'),
    version,
  };
}

export function stripAnsi(value: string): string {
  // ANSI CSI/OSC sequences emitted by indicatif and tracing.
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n');
}

export function progressFromLine(line: string): number | null {
  const explicit = line.match(/(?:^|\s)(100|\d{1,2}(?:\.\d+)?)%/);
  if (explicit) return Math.min(100, Number(explicit[1]));
  const bytes = progressBytesFromLine(line);
  return bytes ? Math.min(100, (bytes.current / bytes.total) * 100) : null;
}

export function progressBytesFromLine(line: string): { current: number; total: number } | null {
  const bytes = line.match(/([\d.]+)\s*(B|KiB|MiB|GiB|TiB)\s*\/\s*([\d.]+)\s*(B|KiB|MiB|GiB|TiB)/i);
  if (!bytes) return null;
  const units: Record<string, number> = { b: 1, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };
  const current = Number(bytes[1]) * units[bytes[2].toLowerCase()];
  const total = Number(bytes[3]) * units[bytes[4].toLowerCase()];
  return Number.isFinite(current) && Number.isFinite(total) && total > 0 ? { current, total } : null;
}

export function downloadFailure(log: string[], exitCode: number): string {
  const detail = [...log].reverse().find((line) =>
    line.trim().length > 0
    && !/^\d+% ·/.test(line)
    && !/^note: run with\b.*RUST_BACKTRACE=/i.test(line)
    && !/^session terminated/i.test(line)
    && !/^script done/i.test(line),
  );
  return detail ? `Xodus exited with code ${exitCode}: ${detail.slice(0, 300)}` : `Xodus exited with code ${exitCode}`;
}

export function safeProductId(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9-]{6,40}$/.test(normalized)) {
    throw new Error('Enter a valid Store/Product ID (6–40 characters: A–Z, 0–9, or a hyphen).');
  }
  return normalized;
}
