import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeInputsChanged } from './runtime-inputs.mjs';
const script = fileURLToPath(new URL('./runtime-needed.mjs', import.meta.url));
test('runtime inputs trigger native CI but documentation/UI-only diffs do not', () => {
  for (const file of ['assets/fix.patch', 'assets/odd\nname.patch', 'scripts/runtime-patches.lock.json', 'scripts/runtime-base.lock.json',
    'scripts/runtime-tests/winrt-json-probe.c', 'scripts/build-shared-runtime.mjs', 'scripts/assemble-shared-runtime.mjs',
    '.github/workflows/runtime.yml', 'src/main/proton.ts']) assert.equal(runtimeInputsChanged([file]), true, file);
  assert.equal(runtimeInputsChanged(['docs/development/STATUS.md', 'src/renderer/App.tsx']), false);
});
test('first/manual runtime builds are forced and malformed revisions are rejected', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-needed-test-'));
  try {
    const output = path.join(root, 'output');
    const env = { ...process.env, BASE_SHA: '0'.repeat(40), HEAD_SHA: 'a'.repeat(40), GITHUB_OUTPUT: output };
    execFileSync(process.execPath, [script], { env, stdio: 'pipe' });
    assert.equal(await fs.readFile(output, 'utf8'), 'needed=true\n');
    assert.throws(() => execFileSync(process.execPath, [script], { env: { ...env, HEAD_SHA: 'HEAD; touch forbidden' }, stdio: 'pipe' }));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('promotion refuses an unauthorised invocation before accessing GitHub', () => {
  const promote = fileURLToPath(new URL('./promote-candidate.mjs', import.meta.url));
  assert.throws(() => execFileSync(process.execPath, [promote], { env: { ...process.env, GITHUB_REF: 'refs/heads/develop', APPROVE_RELEASE: 'false' }, stdio: 'pipe' }), /Command failed/);
});
test('a removed pre-reset base forces a complete runtime build', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-reset-test-'));
  try {
    const output = path.join(root, 'output');
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    execFileSync(process.execPath, [script], {
      env: { ...process.env, BASE_SHA: 'f'.repeat(40), HEAD_SHA: head, FORCE_RUNTIME: 'false', GITHUB_OUTPUT: output },
      stdio: 'pipe',
    });
    assert.equal(await fs.readFile(output, 'utf8'), 'needed=true\n');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
