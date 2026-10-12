#!/usr/bin/env node
// Fresh, unauthenticated test prefix only. Stops only its own wineserver.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const [runtimeArg, testsArg, workArg] = process.argv.slice(2);
if (!runtimeArg || !testsArg || !workArg || process.argv.length !== 5) throw new Error('Usage: run-contract-probes.mjs RUNTIME TEST_EXECUTABLE_DIRECTORY WORK_PARENT');
const runtime = await fs.realpath(runtimeArg);
const tests = await fs.realpath(testsArg);
const parent = await fs.realpath(workArg);
for (const name of ['wine', 'wine64', 'wineserver', 'wineserver64', 'xodus-cli', 'xodus-service']) {
  try { execFileSync('pgrep', ['-x', name], { stdio: 'ignore' }); throw new Error(`${name} active; wait before starting ABI stress tests`); }
  catch (e) { if (e.status !== 1) throw e; }
}
const root = await fs.mkdtemp(path.join(parent, 'runtime-contract-'));
await fs.chmod(root, 0o700);
const prefix = path.join(root, 'pfx');
const files = path.join(runtime, 'files');
const env = { ...process.env, WINEPREFIX: prefix, WINEARCH: 'win64', WINEDEBUG: '-all,err+all',
  WINEDLLPATH: path.join(files, 'lib/wine'),
  LD_LIBRARY_PATH: ['/usr/lib', path.join(files, 'lib/x86_64-linux-gnu'), path.join(files, 'lib/i386-linux-gnu')].join(':'),
  WINEDLLOVERRIDES: 'winemenubuilder.exe=d;mshtml=;mscoree=;xgameruntime=b;winhttp=b;libnghttp2=n' };
for (const key of Object.keys(env)) if (/^(XODUS_|XUSER_|STEAM_COMPAT_|SteamAppId$|SteamGameId$)/.test(key)) delete env[key];
const wine = path.join(files, 'bin/wine');
const server = path.join(files, 'bin/wineserver');
async function run(executable, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false;
    const collect = bytes => { if (output.length < 512000) output += bytes.toString().slice(0, 512000 - output.length); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      try { execFileSync(server, ['-k'], { env, timeout: 5000, stdio: 'ignore' }); } catch { child.kill('SIGKILL'); }
    }, timeout);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, output, timedOut }); });
  });
}
const results = [];
try {
  const boot = await run(wine, ['wineboot', '--init']);
  await fs.writeFile(path.join(root, 'wineboot.log'), boot.output, { mode: 0o600 });
  if (boot.code || boot.timedOut) throw new Error(`Disposable wineboot failed; see ${root}`);
  // Replace the copied directory entry, never follow a default-prefix link.
  for (const name of ['xgameruntime.dll', 'winhttp.dll', 'mscoree.dll', 'libnghttp2.dll', 'windows.web.dll']) {
    const dest = path.join(prefix, 'drive_c/windows/system32', name);
    const temporary = `${dest}.contract-${process.pid}`;
    await fs.copyFile(path.join(files, 'lib/wine/x86_64-windows', name), temporary, fs.constants.COPYFILE_EXCL);
    await fs.rename(temporary, dest);
  }
  for (const name of ['taskqueue-teardown', 'taskqueue-contract', 'async-provider-contract', 'async-completion-lifetime', 'winrt-json']) {
    const result = await run(wine, [path.join(tests, `${name}-probe.exe`)]);
    await fs.writeFile(path.join(root, `${name}.log`), result.output, { mode: 0o600 });
    const summary = result.output.split(/\r?\n/).filter(line => /^(FAIL |CHECKS |QUEUE |ASYNC )/.test(line));
    console.log(`${name}: exit=${result.code} timeout=${result.timedOut}\n${summary.join('\n')}`);
    results.push({ name, code: result.code, timedOut: result.timedOut, summary });
    if (result.code !== 0 || result.timedOut) throw new Error(`Contract probe failed: ${name}; see ${root}`);
  }
} finally {
  try { execFileSync(server, ['-k'], { env, timeout: 5000, stdio: 'ignore' }); } catch { /* never stop another prefix */ }
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify({ root, results }, null, 2) + '\n', { mode: 0o600 });
  console.log(`Private test results: ${root}`);
}
