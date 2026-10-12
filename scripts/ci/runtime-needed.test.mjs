import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./runtime-needed.mjs', import.meta.url));
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
