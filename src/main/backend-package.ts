import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BACKEND_REPOSITORY = 'domsvoboda/xodus-nexus';
export const backendAssets = fileURLToPath(new URL('../../assets/', import.meta.url));
const lockBytes = readFileSync(new URL('../../assets/backend-source.lock.json', import.meta.url));
export const backendLock = JSON.parse(lockBytes.toString()) as {
  schema: number; version: string; repository: string; commit: string; rust: string;
  cargoLockSha256: string; patchId: string; compatibility: string;
  patches: Array<{ file: string; sha256: string }>;
};
export const backendRecipeSha256 = createHash('sha256').update(lockBytes).digest('hex');
export const backendPackageName = `xodus-nexus-backend-${backendLock.version}-linux-x86_64`;

export interface BackendPackageManifest {
  schema: number; version: string; commit: string; recipeSha256: string;
  compatibility: string; platform: string; arch: string;
  archive: string; archiveSha512: string;
  files: Record<string, string>;
}

export function validateBackendManifest(value: unknown): BackendPackageManifest {
  const item = value as BackendPackageManifest | undefined;
  if (!item || item.schema !== 1 || item.version !== backendLock.version ||
      item.commit !== backendLock.commit || item.recipeSha256 !== backendRecipeSha256 ||
      item.compatibility !== backendLock.compatibility || item.platform !== 'linux' || item.arch !== 'x64' ||
      item.archive !== `${backendPackageName}.tar.xz` || !/^[a-f0-9]{128}$/.test(item.archiveSha512) ||
      !item.files || Object.keys(item.files).sort().join(',') !== 'LICENSE,xodus-cli,xodus-service' ||
      Object.values(item.files).some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('The backend package does not match this launcher’s pinned source and patches.');
  }
  return item;
}

export function backendAssetUrl(tag: string, name: string, url: unknown): string {
  const expected = `https://github.com/${BACKEND_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${name}`;
  if (url !== expected) throw new Error('Unexpected backend release asset URL.');
  return expected;
}

export function validateBackendArchive(entries: string[], verbose: string[]): void {
  const expected = new Set([`${backendPackageName}/`, ...['xodus-cli', 'xodus-service', 'LICENSE'].map(name => `${backendPackageName}/${name}`)]);
  if (entries.length !== expected.size || entries.some(name => !expected.delete(name)) ||
      verbose.length !== entries.length || verbose.some(line => {
        const size = line.match(/^[-d]\S*\s+\S+\s+(\d+)\s/);
        return !size || Number(size[1]) > 256 * 1024 * 1024;
      })) {
    throw new Error('Unsafe backend archive: only the package directory and regular binaries/license are allowed.');
  }
}
