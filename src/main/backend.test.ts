import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BackendManager } from './backend.js';
import { backendLock, backendRecipeSha256, backendPackageName, validateBackendManifest, validateBackendArchive } from './backend-package.js';
import { discoverBackend } from './backend-releases.js';
import { run } from './process.js';

vi.mock('./process.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./process.js')>();
  return { ...actual, run: vi.fn(async (cmd: string, args: string[], options: object) => {
    if (cmd.endsWith('/xodus-cli')) {
      const marker = (await fs.readFile(cmd))[63];
      return { code: 0, output: args[0] === 'run' ? (marker === 2 ? '--unsupported' : '--materialize-chain') :
        (marker === 1 ? 'xodus-cli 0.1.0\n  login    Login\n  streaming    Streaming\n' :
        'xodus-cli 0.1.0\n  account    Account\n  login    Login\n  logout    Logout\n  download    Download\n  streaming    Streaming\n  run    Run\n') };
    }
    if (cmd.endsWith('/xodus-service')) throw new Error('Service must never be started by installer tests');
    if (['git', 'cargo', 'rustc', 'protoc'].includes(cmd)) return { code: 1, output: 'Build tool intentionally absent' };
    if (cmd === 'ps') return { code: 0, output: '' };
    return actual.run(cmd, args, options);
  }) };
});
const sha = (data: Buffer, algorithm = 'sha256') => createHash(algorithm).update(data).digest('hex');
const tag = `backend-v${backendLock.version}`;
const url = (name: string) => `https://github.com/domsvoboda/xodus-nexus/releases/download/${tag}/${name}`;
const elf = () => { const bytes = Buffer.alloc(64); bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]); bytes.writeUInt16LE(62, 18); return bytes; };

describe('prebuilt backend', () => {
  it.each(['valid', 'archive-digest', 'recipe', 'binary-digest', 'symlink', 'hardlink', 'missing-service', 'bad-elf', 'bad-service-elf', 'missing-capability', 'missing-launch-chain', 'busy-after-download'])('verifies install and preserves the old pointer on failure: %s', async scenario => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-backend-test-'));
    try {
      const build = path.join(root, 'build');
      const bundle = path.join(build, backendPackageName);
      await fs.mkdir(bundle, { recursive: true });
      const cli = elf();
      if (scenario === 'missing-capability') cli[63] = 1;
      if (scenario === 'missing-launch-chain') cli[63] = 2;
      await fs.writeFile(path.join(bundle, 'xodus-cli'), scenario === 'bad-elf' ? 'not an ELF' : cli);
      await fs.writeFile(path.join(bundle, 'xodus-service'), scenario === 'bad-service-elf' ? 'not an ELF' : elf());
      await fs.writeFile(path.join(bundle, 'LICENSE'), 'synthetic license fixture');
      const files: Record<string, string> = {};
      for (const name of ['xodus-cli', 'xodus-service', 'LICENSE']) files[name] = sha(await fs.readFile(path.join(bundle, name)));
      if (scenario === 'binary-digest') files['xodus-cli'] = '0'.repeat(64);
      if (scenario === 'symlink' || scenario === 'hardlink') {
        await fs.unlink(path.join(bundle, 'xodus-service'));
        if (scenario === 'symlink') await fs.symlink('xodus-cli', path.join(bundle, 'xodus-service'));
        else await fs.link(path.join(bundle, 'xodus-cli'), path.join(bundle, 'xodus-service'));
      }
      if (scenario === 'missing-service') await fs.unlink(path.join(bundle, 'xodus-service'));
      const archive = `${backendPackageName}.tar.xz`;
      expect((await run('tar', ['-cJf', path.join(build, archive), '-C', build, backendPackageName])).code).toBe(0);
      const data = await fs.readFile(path.join(build, archive));
      const manifest = { schema: 1, version: backendLock.version, commit: backendLock.commit, compatibility: backendLock.compatibility,
        recipeSha256: scenario === 'recipe' ? '0'.repeat(64) : backendRecipeSha256, platform: 'linux', arch: 'x64', archive,
        archiveSha512: scenario === 'archive-digest' ? '0'.repeat(128) : sha(data, 'sha512'), files };
      const assets = [archive, `${backendPackageName}.manifest.json`, `${backendPackageName}.sha512sum`, `${backendPackageName}-source.tar.xz`, `${backendPackageName}-source.sha512sum`];
      let downloading = false;
      const fetcher = vi.fn(async (input: URL | RequestInfo) => {
        const target = String(input);
        if (target.includes('/releases?')) return new Response(JSON.stringify([
          { tag_name: 'v0.1.0', assets: [] },
          { tag_name: tag, prerelease: true, assets: [] },
          { tag_name: tag, assets: assets.map(name => ({ name, browser_download_url: url(name) })) },
        ]));
        if (target.endsWith('.manifest.json')) return new Response(JSON.stringify(manifest));
        if (target.endsWith('.sha512sum')) return new Response(`${manifest.archiveSha512}  ${archive}\n`);
        downloading = true;
        return new Response(data);
      }) as unknown as typeof fetch;
      const managed = path.join(root, 'xodus-backends');
      await fs.mkdir(managed);
      const old = '{"previous":"keep intact"}';
      await fs.writeFile(path.join(managed, 'current.json'), old);
      const manager = new BackendManager(root, '', () => {}, () => scenario === 'busy-after-download' && downloading, fetcher);
      if (scenario === 'valid') {
        await manager.update(() => {});
        const pointer = JSON.parse(await fs.readFile(path.join(managed, 'current.json'), 'utf8'));
        expect(pointer.delivery).toBe('release');
        expect(pointer.recipeSha256).toBe(backendRecipeSha256);
        expect(manager.current.available).toBe(true);
        expect(manager.current.prerequisites.cargo).toBe(false);
        expect((await manager.checkUpdate()).updateAvailable).toBe(false);
        await manager.update(() => {}); // Reinstall identical bytes safely.
      } else {
        await expect(manager.update(() => {})).rejects.toThrow();
        expect(await fs.readFile(path.join(managed, 'current.json'), 'utf8')).toBe(old);
      }
      expect(manager.current.updating).toBe(false);
      expect((await fs.readdir(managed)).some(name => name.startsWith('.download-'))).toBe(false);
      expect(vi.mocked(run).mock.calls.some(([cmd]) => cmd.endsWith('/xodus-service'))).toBe(false);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('blocks installation before any download while a game/operation is active', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const manager = new BackendManager('/unused', '', () => {}, () => true, fetcher);
    await expect(manager.update(() => {})).rejects.toThrow('while authentication');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not fall back to compiling when no release is available', async () => {
    const fetcher = vi.fn(async () => new Response('[]')) as unknown as typeof fetch;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'backend-absent-test-'));
    try {
      const manager = new BackendManager(root, '', () => {}, () => false, fetcher);
      const status = await manager.checkUpdate();
      expect(status.releaseAvailable).toBe(false);
      expect(status.blockReason).toBe('No compatible Nexus backend release has been published yet.');
      await expect(manager.update(() => {})).rejects.toThrow('No compatible');
      await expect(fs.stat(path.join(root, 'xodus-backends/current.json'))).rejects.toThrow();
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });

  it('rejects wrong source/platform and traversal archive layouts', () => {
    expect(() => validateBackendManifest({ schema: 1, commit: 'a'.repeat(40) })).toThrow('pinned');
    expect(() => validateBackendArchive([`${backendPackageName}/../../outside`], ['-rw-r--r-- user/group 1 time outside'])).toThrow('Unsafe');
  });

  it('rejects foreign asset URLs rather than downloading executable code from them', async () => {
    const fetcher = (async () => new Response(JSON.stringify([{ tag_name: tag, assets: [
      { name: `${backendPackageName}.manifest.json`, browser_download_url: 'https://other.example/manifest' },
    ] }]))) as typeof fetch;
    await expect(discoverBackend(fetcher)).rejects.toThrow('Unexpected');
  });
});
