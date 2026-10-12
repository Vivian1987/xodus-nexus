import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const base = process.env.BASE_SHA ?? '', head = process.env.HEAD_SHA ?? '';
if (!/^[a-f0-9]{40}$/.test(head) || (base && !/^[a-f0-9]{40}$/.test(base))) throw Error('Invalid diff identity');
const force = process.env.FORCE_RUNTIME === 'true' || !base || /^0+$/.test(base);
const changed = force ? [] : execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).trim().split('\n');
const needed = force || changed.some(file => /^assets\/.*\.patch$/.test(file) ||
  /^scripts\/(?:ci\/|runtime-tests\/|runtime-.*\.lock\.json$|(?:build-shared-runtime|assemble-shared-runtime|verify-runtime-base)\.mjs$)/.test(file) ||
  file === '.github/workflows/runtime.yml' || /^src\/main\/proton\./.test(file));
if (!process.env.GITHUB_OUTPUT) throw Error('GITHUB_OUTPUT missing');
fs.appendFileSync(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
console.log(`Runtime build needed: ${needed}`);
