import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

test('backend source and ordered patch hashes are locked', async () => {
  const lock = JSON.parse(await fs.readFile('assets/backend-source.lock.json', 'utf8'));
  assert.equal(lock.schema, 1);
  assert.match(lock.commit, /^[a-f0-9]{40}$/);
  assert.match(lock.cargoLockSha256, /^[a-f0-9]{64}$/);
  assert.match(lock.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.patches.length, new Set(lock.patches.map(p => p.file)).size);
  for (const patch of lock.patches) {
    assert.match(patch.file, /^xodus-[a-z-]+\.patch$/);
    assert.equal(createHash('sha256').update(await fs.readFile(`assets/${patch.file}`)).digest('hex'), patch.sha256);
  }
});

test('backend workflow shell parses and resolves the locked toolchain', async () => {
  const require = createRequire(import.meta.url);
  const yaml = require('js-yaml');
  const workflow = yaml.load(await fs.readFile('.github/workflows/backend.yml', 'utf8'));
  const steps = workflow.jobs.build.steps;
  for (const step of steps) if (step.run) execFileSync('bash', ['-n', '-c', step.run], { stdio: 'pipe' });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'backend-workflow-test-'));
  try {
    const env = path.join(root, 'env');
    execFileSync('bash', ['-c', steps.find(step => step.name === 'Read pinned Rust version').run], { env: { ...process.env, GITHUB_ENV: env } });
    const lock = JSON.parse(await fs.readFile('assets/backend-source.lock.json', 'utf8'));
    assert.equal(await fs.readFile(env, 'utf8'), `BACKEND_RUST=${lock.rust}\n`);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
