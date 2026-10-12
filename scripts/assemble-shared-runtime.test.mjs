import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./assemble-shared-runtime.mjs', import.meta.url));
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-assembly-test-'));
  const base = path.join(root, 'base'), components = path.join(root, 'components'), output = path.join(root, 'output');
  await fs.mkdir(path.join(base, 'files/bin'), { recursive: true });
  await fs.mkdir(path.join(base, 'files/lib/wine/x86_64-windows'), { recursive: true });
  await fs.mkdir(path.join(base, 'files/share/default_pfx/drive_c/windows/system32'), { recursive: true });
  for (const file of [path.join(base, 'files/bin/wine'), path.join(base, 'proton')]) await fs.writeFile(file, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await fs.mkdir(components);
  const manifest = { components: {} };
  for (const name of ['xgameruntime.dll', 'winhttp.dll', 'mscoree.dll', 'libnghttp2.dll', 'windows.web.dll']) {
    const bytes = Buffer.from(`new-${name}`);
    await fs.writeFile(path.join(components, name), bytes);
    manifest.components[name] = createHash('sha256').update(bytes).digest('hex');
  }
  for (const name of ['nghttp2-LICENSE', 'Wine-LICENSE', 'xgameruntime-LICENSE']) await fs.writeFile(path.join(components, name), 'test license');
  await fs.writeFile(path.join(components, 'source-manifest.json'), JSON.stringify(manifest));
  const run = () => execFileSync(process.execPath, [script, '--base', base, '--components', components, '--output', output], { stdio: 'pipe' });
  return { root, base, components, output, manifest, run };
}
test('assembly replaces symlink entries without altering base/old runtime', async () => {
  const f = await fixture();
  try {
    const previous = path.join(f.root, 'previous.dll');
    await fs.writeFile(previous, 'previous runtime');
    await fs.symlink(previous, path.join(f.base, 'files/lib/wine/x86_64-windows/xgameruntime.dll'));
    await fs.symlink(previous, path.join(f.base, 'files/share/default_pfx/drive_c/windows/system32/windows.web.dll'));
    f.run();
    assert.equal(await fs.readFile(previous, 'utf8'), 'previous runtime');
    assert.equal(await fs.readlink(path.join(f.base, 'files/lib/wine/x86_64-windows/xgameruntime.dll')), previous);
    assert.equal(await fs.readFile(path.join(f.output, 'files/lib/wine/x86_64-windows/xgameruntime.dll'), 'utf8'), 'new-xgameruntime.dll');
    assert.equal(await fs.readFile(path.join(f.output, 'files/share/default_pfx/drive_c/windows/system32/libnghttp2.dll'), 'utf8'), 'new-libnghttp2.dll');
    assert.equal(await fs.readFile(path.join(f.output, 'files/share/default_pfx/drive_c/windows/system32/windows.web.dll'), 'utf8'), 'new-windows.web.dll');
    assert.throws(f.run, /Command failed/);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
test('missing JSON dependency is rejected before creating output', async () => {
  const f = await fixture();
  try {
    delete f.manifest.components['windows.web.dll'];
    await fs.writeFile(path.join(f.components, 'source-manifest.json'), JSON.stringify(f.manifest));
    assert.throws(f.run, /Command failed/);
    await assert.rejects(fs.lstat(f.output), { code: 'ENOENT' });
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
test('invalid component checksum is rejected before creating output', async () => {
  const f = await fixture();
  try {
    await fs.writeFile(path.join(f.components, 'winhttp.dll'), 'corrupted');
    assert.throws(f.run, /Command failed/);
    await assert.rejects(fs.lstat(f.output), { code: 'ENOENT' });
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
test('unknown component paths are rejected before creating output', async () => {
  const f = await fixture();
  try {
    f.manifest.components['../escape.dll'] = 'a'.repeat(64);
    await fs.writeFile(path.join(f.components, 'source-manifest.json'), JSON.stringify(f.manifest));
    assert.throws(f.run, /Command failed/);
    await assert.rejects(fs.lstat(f.output), { code: 'ENOENT' });
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
