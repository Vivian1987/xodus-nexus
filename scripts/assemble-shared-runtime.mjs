#!/usr/bin/env node
// Overlay verified clean-build components onto a separately supplied Proton.
// Creates a new directory, never changes the base or current runtime pointer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--base', '--components', '--output'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Usage: assemble-shared-runtime.mjs --base PROTON --components BUILT_COMPONENTS --output NEW_DIRECTORY');
  options[process.argv[i].slice(2)] = path.resolve(process.argv[i + 1]);
}
if (!options.base || !options.components || !options.output) throw new Error('base, components and output are required');
const shaFile = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const manifest = JSON.parse(await fs.readFile(path.join(options.components, 'source-manifest.json'), 'utf8'));
const componentNames = ['xgameruntime.dll', 'winhttp.dll', 'mscoree.dll', 'libnghttp2.dll', 'windows.web.dll'];
if (!manifest.components || Object.keys(manifest.components).some(name => !componentNames.includes(name))) throw new Error('Unrecognized runtime component');
for (const name of componentNames) {
  if (!/^[a-f0-9]{64}$/.test(manifest.components[name] ?? '') || await shaFile(path.join(options.components, name)) !== manifest.components[name]) throw new Error(`Component checksum mismatch: ${name}`);
}
await fs.access(path.join(options.base, 'files/bin/wine'), fs.constants.X_OK);
await fs.access(path.join(options.base, 'proton'), fs.constants.X_OK);
await fs.access(path.join(options.base, 'files/share/default_pfx'));
try { await fs.lstat(options.output); throw new Error('Output already exists; refusing overwrite'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
// Copies symlink entries as symlinks, not their external referents.
execFileSync('cp', ['-a', '--reflink=auto', options.base, options.output], { stdio: 'inherit' });
async function safeParent(relative) {
  let directory = options.output;
  for (const segment of path.dirname(relative).split('/')) {
    directory = path.join(directory, segment);
    try {
      const entry = await fs.lstat(directory);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`Unsafe assembly directory: ${relative}`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; await fs.mkdir(directory); }
  }
}
for (const name of componentNames) {
  for (const relative of [`files/lib/wine/x86_64-windows/${name}`, `files/share/default_pfx/drive_c/windows/system32/${name}`]) {
    const target = path.join(options.output, relative);
    const temporary = `${target}.nexus-${process.pid}`;
    await safeParent(relative);
    await fs.copyFile(path.join(options.components, name), temporary, fs.constants.COPYFILE_EXCL);
    await fs.chmod(temporary, 0o644);
    await fs.rename(temporary, target);
  }
}
const licenseDirectory = path.join(options.output, 'files/share/doc/xodus-nexus-runtime');
await safeParent('files/share/doc/xodus-nexus-runtime/license');
for (const name of ['nghttp2-LICENSE', 'Wine-LICENSE', 'xgameruntime-LICENSE']) await fs.copyFile(path.join(options.components, name), path.join(licenseDirectory, name));
const baseWineSha256 = await shaFile(path.join(options.base, 'files/bin/wine'));
if (baseWineSha256 !== await shaFile(path.join(options.output, 'files/bin/wine'))) throw new Error('Base Wine loader unexpectedly changed');
let baseMetadata = {};
try { baseMetadata = JSON.parse(await fs.readFile(path.join(options.base, 'XODUS_NEXUS_PATCH.json'), 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const metadata = {
  ...manifest, name: 'Nexus runtime',
  description: 'Pinned shared XGameRuntime and HTTP/2 compatibility line. Experimental; see limitations.',
  features: [...new Set([...(baseMetadata.features ?? []), 'cloud-saves-pr28', 'xodus-tcp-bridge-v1', 'package-locale', 'xuser-contract-v1', 'wine-winhttp-http2-v1', 'nghttp2-v1', 'winrt-json-v1', 'xasync-provider-contract-v1', 'xtaskqueue-lifecycle-v1'])],
  baseWineSha256, patchedDllSha256: manifest.components['xgameruntime.dll'],
};
const metadataTemporary = path.join(options.output, `.nexus-metadata-${process.pid}`);
await fs.writeFile(metadataTemporary, JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
await fs.rename(metadataTemporary, path.join(options.output, 'XODUS_NEXUS_PATCH.json'));
console.log(`Assembled isolated runtime: ${options.output}. Active runtime unchanged.`);
