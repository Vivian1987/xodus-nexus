#!/usr/bin/env node
// Reconstruct the shared development runtime from pinned Git objects only.
// Never reads a user's game/prefix/account or updates the active runtime.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockBytes = await fs.readFile(path.join(project, 'scripts/runtime-patches.lock.json'));
const lock = JSON.parse(lockBytes);
const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--prepare-only') options.prepareOnly = true;
  else if (['--work', '--jobs', '--wine-mirror', '--xgameruntime-mirror', '--nghttp2-mirror', '--base-runtime'].includes(key)) {
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
    options[key.slice(2)] = process.argv[++i];
  } else throw new Error(`Unknown argument ${key}`);
}
if (!options.work) throw new Error('Usage: node scripts/build-shared-runtime.mjs --work NEW_DIRECTORY [--jobs 4] [--base-runtime PROTON_DIRECTORY] [--prepare-only] [--wine-mirror GIT_REPO] [--xgameruntime-mirror GIT_REPO] [--nghttp2-mirror GIT_REPO]');
const work = path.resolve(options.work);
const jobs = options.jobs ?? '4';
if (!/^[1-9][0-9]?$/.test(jobs)) throw new Error('jobs must be 1..99');
const env = { ...process.env };
// Editors/AppImages may inject incompatible libraries into compiler utilities.
for (const name of ['LD_LIBRARY_PATH', 'WINEPREFIX', 'WINEDLLPATH', 'XODUS_SOCKET', 'XODUS_BRIDGE_KEY', 'XODUS_BRIDGE_PORT']) delete env[name];
function run(command, args, cwd, capture = false) {
  return execFileSync(command, args, { cwd, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: capture ? 'utf8' : undefined, maxBuffer: 32 * 1024 * 1024 });
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function shaFile(file) { return sha(await fs.readFile(file)); }
async function exists(file) { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
async function checkout(name, target) {
  const source = lock.sources[name];
  await fs.mkdir(target, { recursive: true });
  run('git', ['init', '--quiet', target], work);
  // Mirrors supply Git objects, never working-tree files or build artifacts.
  const remote = options[`${name}-mirror`] ? await fs.realpath(options[`${name}-mirror`]) : source.url;
  run('git', ['-C', target, 'fetch', '--depth', '1', '--no-tags', remote, source.commit], work);
  run('git', ['-C', target, 'checkout', '--quiet', '--detach', 'FETCH_HEAD'], work);
  if (run('git', ['-C', target, 'rev-parse', 'HEAD'], work, true).trim() !== source.commit ||
      run('git', ['-C', target, 'status', '--porcelain'], work, true).trim()) throw new Error(`Not a clean pinned ${name} checkout`);
}
if (await exists(work)) throw new Error(`Refusing to overwrite an existing work directory: ${work}`);
// Verify exports before doing any clone/build. A mismatch is never forced.
for (const patch of lock.patches) {
  if (await shaFile(path.join(project, patch.file)) !== patch.sha256) throw new Error(`Patch checksum mismatch: ${patch.file}`);
}
await fs.mkdir(work, { recursive: true });
const source = path.join(work, 'wine-src');
const ngSource = path.join(work, 'nghttp2-src');
const ngBuild = path.join(work, 'nghttp2-build');
const build = path.join(work, 'wine-build');
await checkout('wine', source);
await checkout('xgameruntime', path.join(source, 'dlls/xgameruntime'));
await checkout('nghttp2', ngSource);
for (const patch of lock.patches) {
  console.log(`Applying ${patch.file}`);
  run('git', ['apply', '--check', path.join(project, patch.file)], source);
  run('git', ['apply', path.join(project, patch.file)], source);
}
for (const [relative, expected] of Object.entries(lock.expectedXgameruntimeSources)) {
  if (await shaFile(path.join(source, relative)) !== expected) throw new Error(`Source reproduction mismatch: ${relative}`);
}
const provenance = {
  schema: 1, status: lock.status, sourceLockSha256: sha(lockBytes), sources: lock.sources,
  patches: lock.patches, verifiedXgameruntimeSources: lock.expectedXgameruntimeSources,
  limitations: lock.limitations, components: {},
  configure: ['--enable-win64', '--without-x', '--without-wayland', '--disable-tests'],
  toolchain: Object.fromEntries(['gcc', 'x86_64-w64-mingw32-gcc', 'cmake', 'make', 'autoconf', 'bison', 'flex'].map(tool => [tool, run(tool, ['--version'], work, true).split('\n')[0]])),
};
await fs.writeFile(path.join(work, 'source-manifest.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
console.log('All 23 modified/added xgameruntime source files match the online-tested development tree.');
if (options.prepareOnly) process.exit(0);

run('cmake', ['-S', ngSource, '-B', ngBuild, '-DCMAKE_SYSTEM_NAME=Windows', '-DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc', '-DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres', '-DENABLE_LIB_ONLY=ON', '-DBUILD_SHARED_LIBS=ON', '-DBUILD_STATIC_LIBS=OFF', '-DENABLE_DOC=OFF', '-DENABLE_APP=OFF', '-DENABLE_EXAMPLES=OFF', '-DENABLE_FAILMALLOC=OFF', '-DBUILD_TESTING=OFF'], work);
run('cmake', ['--build', ngBuild, '--parallel', jobs], work);
// Wine makedep resolves includes under Wine/include. No private sibling paths.
await fs.mkdir(path.join(source, 'include/nghttp2'));
await fs.copyFile(path.join(ngSource, 'lib/includes/nghttp2/nghttp2.h'), path.join(source, 'include/nghttp2/nghttp2.h'));
await fs.copyFile(path.join(ngBuild, 'lib/includes/nghttp2/nghttp2ver.h'), path.join(source, 'include/nghttp2/nghttp2ver.h'));
run('python3', ['make_vulkan', '-x', 'vk.xml', '-X', 'video.xml'], path.join(source, 'dlls/winevulkan'));
run('perl', ['tools/make_specfiles'], source);
run('autoreconf', ['-fiv'], source);
await fs.mkdir(build);
run(path.join(source, 'configure'), provenance.configure, build);
run('make', [`-j${jobs}`, 'dlls/xgameruntime/x86_64-windows/xgameruntime.dll', 'dlls/winhttp/x86_64-windows/winhttp.dll', 'dlls/mscoree/x86_64-windows/mscoree.dll', 'dlls/windows.web/x86_64-windows/windows.web.dll'], build);
const components = path.join(work, 'components');
await fs.mkdir(components);
const outputs = {
  'xgameruntime.dll': path.join(build, 'dlls/xgameruntime/x86_64-windows/xgameruntime.dll'),
  'winhttp.dll': path.join(build, 'dlls/winhttp/x86_64-windows/winhttp.dll'),
  'mscoree.dll': path.join(build, 'dlls/mscoree/x86_64-windows/mscoree.dll'),
  // XUser parses endpoint/auth replies through Windows.Data.Json. Stock
  // Proton may expose these interfaces but return E_NOTIMPL from Parse.
  'windows.web.dll': path.join(build, 'dlls/windows.web/x86_64-windows/windows.web.dll'),
  'libnghttp2.dll': path.join(ngBuild, 'lib/libnghttp2.dll'),
};
for (const [name, file] of Object.entries(outputs)) {
  if (!/PE32\+ executable.*x86-64/.test(run('file', ['-b', file], work, true))) throw new Error(`Not a 64-bit Windows DLL: ${name}`);
  await fs.copyFile(file, path.join(components, name));
  provenance.components[name] = await shaFile(file);
}
const tests = path.join(work, 'tests');
await fs.mkdir(tests);
for (const test of ['taskqueue-teardown', 'taskqueue-contract', 'async-provider-contract', 'async-completion-lifetime']) {
  run('x86_64-w64-mingw32-gcc', ['-D__WINESRC__', '-O2', '-Wall', '-I', path.join(build, 'dlls/xgameruntime'), '-I', path.join(source, 'dlls/xgameruntime'), path.join(project, `scripts/runtime-tests/${test}-probe.c`), '-o', path.join(tests, `${test}-probe.exe`)], work);
}
// windows.web generated these WinRT headers from the pinned IDL sources.
// Ubuntu's older MinGW SDK need not contain windows.data.json.h at all.
run('x86_64-w64-mingw32-gcc', ['-O2', '-Wall', '-I', path.join(build, 'include'), '-I', path.join(source, 'include'), path.join(project, 'scripts/runtime-tests/winrt-json-probe.c'), '-o', path.join(tests, 'winrt-json-probe.exe'), '-lruntimeobject'], work);
await fs.copyFile(path.join(ngSource, 'COPYING'), path.join(components, 'nghttp2-LICENSE'));
await fs.copyFile(path.join(source, 'COPYING.LIB'), path.join(components, 'Wine-LICENSE'));
await fs.copyFile(path.join(source, 'dlls/xgameruntime/COPYING.LIB'), path.join(components, 'xgameruntime-LICENSE')).catch(async e => {
  if (e.code !== 'ENOENT') throw e;
  await fs.copyFile(path.join(source, 'COPYING.LIB'), path.join(components, 'xgameruntime-LICENSE'));
});
await fs.writeFile(path.join(components, 'source-manifest.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
if (options['base-runtime']) {
  run('node', [path.join(project, 'scripts/assemble-shared-runtime.mjs'), '--base', path.resolve(options['base-runtime']), '--components', components, '--output', path.join(work, 'runtime')], project);
}
console.log(`Built shared runtime components and ABI probes: ${components}`);
