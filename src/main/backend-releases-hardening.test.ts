import { expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backendLock, backendPackageName, backendRecipeSha256, type BackendPackageManifest } from './backend-package.js';
import { discoverBackend, installBackend } from './backend-releases.js';
const tag = `backend-v${backendLock.version}`, base = backendPackageName(backendLock.version);
const url = (name: string) => `https://github.com/domsvoboda/xodus-nexus/releases/download/${tag}/${name}`;
const manifest: BackendPackageManifest = { schema: 1, authUi: 'electron', version: backendLock.version, commit: backendLock.commit,
  compatibility: backendLock.compatibility, recipeSha256: backendRecipeSha256, platform: 'linux', arch: 'x64', archive: `${base}.tar.xz`,
  archiveSha512: 'a'.repeat(128), files: { 'xodus-cli': 'b'.repeat(64), 'xodus-service': 'c'.repeat(64), LICENSE: 'd'.repeat(64) } };
function assets() { return ['.tar.xz', '.manifest.json', '.sha512sum', '-source.tar.xz', '-source.sha512sum'].map(suffix => ({ name: `${base}${suffix}`, browser_download_url: url(`${base}${suffix}`) })); }
it.each(['.manifest.json', '-source.tar.xz', '.tar.xz'])('rejects duplicate backend asset identity: %s', async suffix => {
  const list = assets(); list.push(list.find(item => item.name === `${base}${suffix}`)!);
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const request = String(input);
    if (request.includes('/releases?')) return new Response(JSON.stringify([null, 1, {}, { tag_name: tag, assets: list }]));
    if (request.endsWith('.manifest.json')) return new Response(JSON.stringify(manifest));
    if (request.endsWith('.sha512sum')) return new Response(`${manifest.archiveSha512}  ${manifest.archive}`);
    throw Error('Executable bytes must not be fetched during discovery.');
  });
  await expect(discoverBackend(fetcher)).rejects.toThrow('ambiguous');
  expect(fetcher.mock.calls.every(([request]) => !String(request).endsWith('.tar.xz'))).toBe(true);
});
it('rejects oversized release metadata before reading a body', async () => {
  const cancel = vi.fn(), fetcher = vi.fn(async () => new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '2000001' } }));
  await expect(discoverBackend(fetcher)).rejects.toThrow('download limit'); expect(cancel).toHaveBeenCalledOnce();
});
it.each(['tag', 'archive'])('checks the backend tag/archive binding before network or staging: %s', async invalid => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-backend-preflight-')), managed = path.join(root, 'managed');
  const fetcher = vi.fn(), validate = vi.fn(), runner = vi.fn(), idle = vi.fn(async () => {});
  try {
    const artifact = { tag: invalid === 'tag' ? 'backend-v99.99.99' : tag, manifest, archiveUrl: invalid === 'archive' ? 'https://example.test/backend.tar.xz' : url(manifest.archive) };
    await expect(installBackend(managed, artifact, fetcher, validate, idle, () => {}, runner)).rejects.toThrow(invalid === 'tag' ? 'tag does not match' : 'Unexpected');
    expect(idle).toHaveBeenCalledOnce(); expect(fetcher).not.toHaveBeenCalled(); expect(validate).not.toHaveBeenCalled(); expect(runner).not.toHaveBeenCalled();
    expect(await fs.readdir(root)).toEqual([]);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
