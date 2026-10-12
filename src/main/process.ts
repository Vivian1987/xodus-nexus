import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { stripAnsi } from '../shared/utils.js';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  onLine?: (line: string) => void;
  maxOutput?: number;
  terminal?: boolean;
}

export interface RunResult {
  code: number;
  output: string;
}

export function spawnTracked(command: string, args: string[], options: RunOptions = {}): {
  child: ChildProcessWithoutNullStreams;
  result: Promise<RunResult>;
} {
  // indicatif deliberately hides progress bars when stdout is a pipe. Give only
  // streaming downloads a PTY; other Xodus commands keep their direct spawn.
  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const actualCommand = options.terminal ? 'script' : command;
  const actualArgs = options.terminal
    ? ['-q', '-f', '-e', '-c', [command, ...args].map(shellQuote).join(' '), '/dev/null']
    : args;
  const child = spawn(actualCommand, actualArgs, {
    cwd: options.cwd,
    env: options.terminal ? { ...(options.env ?? process.env), TERM: 'xterm' } : options.env ?? process.env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const chunks: string[] = [];
  const max = options.maxOutput ?? 2_000_000;
  let chunksLength = 0;
  let buffered = '';
  const consume = (chunk: Buffer) => {
    const clean = stripAnsi(chunk.toString('utf8'));
    buffered += clean;
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line) options.onLine?.(line);
    }
    chunks.push(clean);
    chunksLength += clean.length;
    while (chunksLength > max && chunks.length > 1) chunksLength -= chunks.shift()!.length;
  };
  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  const result = new Promise<RunResult>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (buffered.trim()) options.onLine?.(buffered.trimEnd());
      resolve({ code: code ?? -1, output: chunks.join('') });
    });
  });
  return { child, result };
}

export async function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return spawnTracked(command, args, options).result;
}
