import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const source = await fs.readFile('scripts/linux/deb-after-install.sh', 'utf8');
const hookSource = await fs.readFile('scripts/launcher-fonts-after-pack.cjs', 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

async function fixture() {
  // Refuse to execute a fixture if a production change would bypass the
  // substituted root/PATH or the harmless permission-command recorders.
  for (const token of ['PATH=/usr/sbin:/usr/bin:/sbin:/bin', "APP_DIR='/opt/Xodus Nexus'", "PARENT_DIR='/opt'"]) assert.equal(source.split(token).length, 2, token);
  assert.doesNotMatch(source, /\/(?:chmod|chown|update-alternatives)\b|\b(?:sudo|doas|pkexec)\b/);
  assert.match(source, /^chown 0:0 -- "\$APP_DIR\/chrome-sandbox"$/m);
  assert.match(source, /^chmod 4755 -- "\$APP_DIR\/chrome-sandbox"$/m);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-native-package-'));
  const parent = path.join(root, 'system opt'), app = path.join(parent, 'Xodus Nexus');
  const tools = path.join(root, 'tools'), state = path.join(root, 'calls.json');
  await fs.mkdir(path.join(app, 'resources'), { recursive: true });
  await fs.mkdir(tools);
  await fs.writeFile(state, JSON.stringify({ calls: [], modes: {}, owners: {} }));
  for (const directory of [parent, app, path.join(app, 'resources')]) await fs.chmod(directory, 0o755);
  const native = Buffer.from('Synthetic native fixture, never executed.');
  const helper = Buffer.from('Matching helper fixture, never executed.');
  await fs.writeFile(path.join(app, 'xodus-nexus'), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  await fs.writeFile(path.join(app, 'xodus-nexus.bin'), native, { mode: 0o755 });
  await fs.writeFile(path.join(app, 'chrome-sandbox'), helper, { mode: 0o755 });
  await fs.writeFile(path.join(app, 'resources/xodus-nexus-sandbox.sha256'), `${hash(native)}  xodus-nexus.bin\n${hash(helper)}  chrome-sandbox\n`, { mode: 0o644 });
  // Only this disposable copy substitutes paths and commands. The production
  // script has no environment override, and is never run on the real /opt.
  const script = path.join(root, 'postinst');
  await fs.writeFile(script, source.replace('PATH=/usr/sbin:/usr/bin:/sbin:/bin', `PATH=${quote(`${tools}:/usr/bin:/bin`)}`)
    .replace("APP_DIR='/opt/Xodus Nexus'", `APP_DIR=${quote(app)}`).replace("PARENT_DIR='/opt'", `PARENT_DIR=${quote(parent)}`));
  const tool = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),name=path.basename(process.argv[1]),stateFile=process.env.NEXUS_SANDBOX_FIXTURE_STATE;
const state=JSON.parse(fs.readFileSync(stateFile));
if(name==='id') process.stdout.write((process.env.NEXUS_SANDBOX_FIXTURE_UID||'0')+'\\n');
else if(name==='stat') {
  const file=args.at(-1),st=fs.lstatSync(file),fmt=args[args.indexOf('-c')+1];
  const mode=state.modes[file]||(st.mode&0o7777).toString(8),owner=state.owners[file]||'0:0';
  const values={'%u:%g':owner,'%a':mode,'%h':String(st.nlink),'%s':String(st.size),'%u:%g:%a':owner+':'+mode};
  if(!(fmt in values)) process.exit(98); process.stdout.write(values[fmt]+'\\n');
} else {
  if(!['chmod','chown','update-alternatives','update-mime-database','update-desktop-database'].includes(name)) process.exit(97);
  state.calls.push({name,args});
  if(name==='chmod'&&!process.env.NEXUS_SANDBOX_FIXTURE_IGNORE_CHMOD) state.modes[args.at(-1)]=args[0];
  fs.writeFileSync(stateFile,JSON.stringify(state));
}
`;
  for (const name of ['id', 'stat', 'chmod', 'chown', 'update-alternatives', 'update-mime-database', 'update-desktop-database']) await fs.writeFile(path.join(tools, name), tool, { mode: 0o755 });
  const readState = async () => JSON.parse(await fs.readFile(state, 'utf8'));
  const run = (extra = {}, args = ['configure']) => spawnSync('/bin/sh', [script, ...args], {
    env: { ...process.env, NEXUS_SANDBOX_FIXTURE_STATE: state, ...extra }, encoding: 'utf8', timeout: 15_000,
  });
  return { root, parent, app, run, state, readState, calls: async () => (await readState()).calls };
}
async function scenario(action) {
  const f = await fixture();
  try { await action(f); }
  finally { await fs.rm(f.root, { recursive: true, force: true }); }
}

test('native DEB verifies the packaged pair before enabling only its root-owned helper', () => scenario(async f => {
  const before = await fs.stat(path.join(f.app, 'chrome-sandbox'));
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await f.calls()).slice(0, 3), [
    { name: 'chown', args: ['0:0', '--', path.join(f.app, 'chrome-sandbox')] },
    { name: 'chmod', args: ['4755', '--', path.join(f.app, 'chrome-sandbox')] },
    { name: 'update-alternatives', args: ['--install', '/usr/bin/xodus-nexus', 'xodus-nexus', path.join(f.app, 'xodus-nexus'), '100'] },
  ]);
  // Elevation commands only update mock state. No user-owned fixture, helper,
  // host path or real permissions are elevated by the test.
  const after = await fs.stat(path.join(f.app, 'chrome-sandbox'));
  assert.equal(after.mode & 0o7777, 0o755); assert.equal(after.uid, before.uid); assert.equal(after.gid, before.gid);
}));
test('non-root and non-configuration invocations make no permission or integration changes', async () => {
  await scenario(async f => {
    const result = f.run({ NEXUS_SANDBOX_FIXTURE_UID: '1000' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /configured.*root/); assert.deepEqual(await f.calls(), []);
  });
  await scenario(async f => {
    for (const args of [[], ['abort-upgrade'], ['triggered']]) assert.equal(f.run({}, args).status, 0);
    assert.deepEqual(await f.calls(), []);
  });
});
test('changed native or helper bytes are refused before granting SUID', async () => {
  for (const name of ['xodus-nexus.bin', 'chrome-sandbox']) await scenario(async f => {
    await fs.appendFile(path.join(f.app, name), 'changed');
    const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /checksum mismatch/); assert.deepEqual(await f.calls(), []);
  });
});
test('symlinked package paths and hard-linked executables are refused before changing permissions', async () => {
  for (const name of ['', 'resources', 'xodus-nexus', 'xodus-nexus.bin', 'chrome-sandbox', 'resources/xodus-nexus-sandbox.sha256']) await scenario(async f => {
    const file = path.join(f.app, name); await fs.rename(file, file + '.original'); await fs.symlink(file + '.original', file);
    assert.notEqual(f.run().status, 0); assert.deepEqual(await f.calls(), []);
  });
  await scenario(async f => {
    const file = path.join(f.app, 'chrome-sandbox'); await fs.link(file, file + '.hardlink');
    assert.notEqual(f.run().status, 0); assert.deepEqual(await f.calls(), []);
  });
});
test('writable or foreign-owned directories, binaries and checksum manifests are refused', async () => {
  for (const name of ['..', '', 'resources', 'xodus-nexus', 'xodus-nexus.bin', 'chrome-sandbox', 'resources/xodus-nexus-sandbox.sha256']) await scenario(async f => {
    await fs.chmod(path.join(f.app, name), 0o777);
    assert.notEqual(f.run().status, 0); assert.deepEqual(await f.calls(), []);
  });
  for (const name of ['xodus-nexus.bin', 'chrome-sandbox', 'resources/xodus-nexus-sandbox.sha256']) await scenario(async f => {
    const state = await f.readState(); state.owners[path.join(f.app, name)] = '1000:1000'; await fs.writeFile(f.state, JSON.stringify(state));
    assert.notEqual(f.run().status, 0); assert.deepEqual(await f.calls(), []);
  });
});
test('missing, oversized, malformed or additional manifest paths cannot choose another helper', async () => {
  const a = 'a'.repeat(64), b = 'b'.repeat(64);
  for (const value of [null, 'x'.repeat(257), `${a}  ../other\n${b}  chrome-sandbox\n`, `${a}  xodus-nexus.bin\n${b}  chrome-sandbox\nextra\n`, `${a}  xodus-nexus.bin\n${b}  chrome-sandbox\npartial`, `${a}  xodus-nexus.bin\n${b}  chrome-sandbox`, `${a.toUpperCase()}  xodus-nexus.bin\n${b}  chrome-sandbox\n`]) await scenario(async f => {
    const manifest = path.join(f.app, 'resources/xodus-nexus-sandbox.sha256');
    if (value === null) await fs.unlink(manifest); else await fs.writeFile(manifest, value);
    assert.notEqual(f.run().status, 0); assert.deepEqual(await f.calls(), []);
  });
});
test('a helper permission failure prevents creation of the system command alternative', () => scenario(async f => {
  const result = f.run({ NEXUS_SANDBOX_FIXTURE_IGNORE_CHMOD: '1' });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /permissions were not applied/);
  assert.deepEqual((await f.calls()).map(call => call.name), ['chown', 'chmod']);
  assert.equal((await fs.stat(path.join(f.app, 'chrome-sandbox'))).mode & 0o7777, 0o755);
}));

async function packedFixture(action) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-pack-hook-'));
  try {
    const scripts = path.join(root, 'scripts'), app = path.join(root, 'linux-unpacked');
    await fs.mkdir(scripts); await fs.mkdir(path.join(app, 'resources'), { recursive: true });
    await fs.mkdir(path.join(root, 'dist-electron/main'), { recursive: true });
    for (const file of ['launcher-font-wrapper.sh', 'launcher-font-bootstrap.mjs']) await fs.copyFile(path.join('scripts', file), path.join(scripts, file));
    await fs.writeFile(path.join(root, 'dist-electron/main/launcher-fonts.js'), '// Synthetic compiled public font module.\n');
    await fs.writeFile(path.join(app, 'xodus-nexus'), 'Synthetic Electron binary, never executed.', { mode: 0o755 });
    await fs.writeFile(path.join(app, 'chrome-sandbox'), 'Synthetic matching helper, never executed.', { mode: 0o755 });
    const modes = [], safeFs = { ...fs, chmod: async (file, mode) => { assert.equal(mode & 0o6000, 0, 'build hook must never grant SUID/SGID'); modes.push({ file, mode }); await fs.chmod(file, mode); } };
    const module = { exports: undefined };
    runInNewContext(hookSource, { module, __dirname: scripts, require: name => name === 'node:fs/promises' ? safeFs : require(name) });
    await action({ root, app, modes, hook: module.exports, context: { electronPlatformName: 'linux', appOutDir: app, packager: { executableName: 'xodus-nexus' } } });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('afterPack preserves the font bootstrap and records a matching pair with no elevated AppImage permissions', () => packedFixture(async f => {
  await f.hook(f.context);
  const native = await fs.readFile(path.join(f.app, 'xodus-nexus.bin')), helper = await fs.readFile(path.join(f.app, 'chrome-sandbox'));
  assert.equal(await fs.readFile(path.join(f.app, 'resources/xodus-nexus-sandbox.sha256'), 'utf8'), `${hash(native)}  xodus-nexus.bin\n${hash(helper)}  chrome-sandbox\n`);
  assert.equal(await fs.readFile(path.join(f.app, 'xodus-nexus'), 'utf8'), await fs.readFile('scripts/launcher-font-wrapper.sh', 'utf8'));
  assert.equal(await fs.readFile(path.join(f.app, 'resources/font-bootstrap/launcher-fonts.mjs'), 'utf8'), '// Synthetic compiled public font module.\n');
  assert.equal(await fs.readFile(path.join(f.app, 'resources/font-bootstrap/bootstrap.mjs'), 'utf8'), await fs.readFile('scripts/launcher-font-bootstrap.mjs', 'utf8'));
  for (const name of ['xodus-nexus', 'xodus-nexus.bin', 'chrome-sandbox']) assert.equal((await fs.stat(path.join(f.app, name))).mode & 0o7777, 0o755);
}));
test('afterPack refuses symlinked or hard-linked package inputs without chmod on another file', async () => {
  for (const name of ['xodus-nexus', 'chrome-sandbox', 'resources']) await packedFixture(async f => {
    const file = path.join(f.app, name); await fs.rename(file, file + '.original'); await fs.symlink(file + '.original', file);
    await assert.rejects(f.hook(f.context), /regular|symbolic links/); assert.deepEqual(f.modes, []);
  });
  await packedFixture(async f => {
    const file = path.join(f.app, 'chrome-sandbox'); await fs.link(file, file + '.hardlink');
    await assert.rejects(f.hook(f.context), /regular/); assert.deepEqual(f.modes, []);
  });
});
test('afterPack rejects unexpected executable names and never follows an existing checksum symlink', async () => {
  await packedFixture(async f => {
    await assert.rejects(f.hook({ ...f.context, packager: { executableName: 'other' } }), /Unexpected Nexus/); assert.deepEqual(f.modes, []);
  });
  await packedFixture(async f => {
    const outside = path.join(f.root, 'outside'); await fs.writeFile(outside, 'keep');
    await fs.symlink(outside, path.join(f.app, 'resources/xodus-nexus-sandbox.sha256'));
    await assert.rejects(f.hook(f.context), { code: 'EEXIST' }); assert.equal(await fs.readFile(outside, 'utf8'), 'keep');
  });
});
test('the Nexus wrapper resolves alternatives and preserves arguments when its install directory has spaces', () => scenario(async f => {
  await fs.copyFile('scripts/launcher-font-wrapper.sh', path.join(f.app, 'xodus-nexus'));
  await fs.chmod(path.join(f.app, 'xodus-nexus'), 0o755);
  await fs.writeFile(path.join(f.app, 'xodus-nexus.bin'), `#!${process.execPath}\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o755 });
  const bin = path.join(f.root, 'bin'), alternatives = path.join(f.root, 'alternatives');
  await fs.mkdir(bin); await fs.mkdir(alternatives);
  await fs.symlink(path.join(f.app, 'xodus-nexus'), path.join(alternatives, 'nexus'));
  const command = path.join(bin, 'xodus-nexus'); await fs.symlink('../alternatives/nexus', command);
  const args = ['--native-helper', 'argument with spaces', '$HOME', '$(never-execute)'];
  const result = spawnSync(command, args, { env: { ...process.env, LD_PRELOAD: '', ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 5_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message); assert.deepEqual(JSON.parse(result.stdout), args);
}));
test('production DEB metadata matches electron-builder and keeps the Nexus identity and sandbox enabled', async () => {
  const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const { AppInfo } = require('app-builder-lib/out/appInfo');
  const appInfo = new AppInfo({ metadata: pkg, config: pkg.build }, undefined, pkg.build.linux);
  assert.equal(appInfo.sanitizedProductName, 'Xodus Nexus'); assert.equal(appInfo.sanitizedName.toLowerCase(), 'xodus-nexus');
  assert.equal(pkg.name, 'xodus-nexus'); assert.equal(pkg.build.productName, 'Xodus Nexus'); assert.equal(pkg.build.appId, 'org.xodusgaming.nexus');
  assert.equal(pkg.build.artifactName, 'Xodus-Nexus-${version}-${arch}.${ext}');
  assert.equal(pkg.scripts.dist, 'npm run build && electron-builder --linux AppImage --publish never');
  assert.ok(pkg.build.linux.target.includes('deb')); assert.ok(pkg.build.linux.target.includes('AppImage'));
  assert.equal(pkg.build.deb.afterInstall, 'scripts/linux/deb-after-install.sh');
  assert.ok(typeof pkg.build.deb.maintainer === 'string' && pkg.build.deb.maintainer.trim());
  assert.equal(new URL(pkg.homepage).protocol, 'https:');
  assert.match(source, /APP_DIR='\/opt\/Xodus Nexus'/); assert.match(source, /PATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin/);
  assert.doesNotMatch(source, /--no-sandbox|disable-setuid-sandbox|apparmor_restrict_unprivileged_userns|sysctl|CHROME_DEVEL_SANDBOX/);
  assert.doesNotMatch(await fs.readFile('scripts/launcher-font-wrapper.sh', 'utf8'), /--no-sandbox|disable-setuid-sandbox/);
  for (const file of ['scripts/linux/deb-after-install.sh', 'scripts/launcher-font-wrapper.sh']) {
    const result = spawnSync('/bin/sh', ['-n', file], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  }
});
