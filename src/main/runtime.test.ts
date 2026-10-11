import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalSnapshotName, nexusReleaseName, previewBaseRelease, RuntimeManager } from './runtime.js';
import { run } from './process.js';

describe('previewBaseRelease', () => {
  it('derives release names from versions, commits and asset names', () => {
    expect(nexusReleaseName('xodus-nexus-runtime-11.0-20261011-g3fd4ae10-x86_64.tar.xz')).toBe('xodus-nexus-runtime-11.0-20261011-g3fd4ae10');
    expect(canonicalSnapshotName('3fd4ae1091339ef07d6f2d53fda8e15541f96ad3')).toBe('xodus-proton-3fd4ae10');
  });

  it('finds the published Nexus runtime release and its assets', async () => {
    // Launcher AppImage releases share the repository; a newer release without
    // runtime assets must not hide the runtime release.
    const fetcher = (async (input: URL | RequestInfo) => new Response(JSON.stringify([
      {
        tag_name: 'v0.5.25',
        assets: [{ name: 'Xodus-Nexus-0.5.25-x86_64.AppImage', browser_download_url: 'https://example.com/app.AppImage' }],
      },
      {
        tag_name: 'runtime-11.0-20261011-g3fd4ae10',
        assets: [
          { name: 'xodus-nexus-runtime-11.0-20261011-g3fd4ae10-x86_64.tar.xz', browser_download_url: 'https://example.com/xodus-nexus-runtime-11.0-20261011-g3fd4ae10-x86_64.tar.xz' },
          { name: 'xodus-nexus-runtime-11.0-20261011-g3fd4ae10-x86_64.sha512sum', browser_download_url: 'https://example.com/xodus-nexus-runtime-11.0-20261011-g3fd4ae10-x86_64.sha512sum' },
        ],
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const manager = new RuntimeManager('/tmp/unused', () => undefined, () => false, fetcher);
    const status = await manager.checkNexus();
    expect(status.nexusAvailable).toBe(true);
    expect(status.nexusVersion).toBe('runtime-11.0-20261011-g3fd4ae10');
    expect(status.nexusName).toBe('xodus-nexus-runtime-11.0-20261011-g3fd4ae10-x86_64.tar.xz');
  });

  it('reports no Nexus runtime when no release carries one', async () => {
    const fetcher = (async () => new Response(JSON.stringify([
      {
        tag_name: 'v0.5.24',
        assets: [{ name: 'Xodus-Nexus-0.5.24-x86_64.AppImage', browser_download_url: 'https://example.com/app.AppImage' }],
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const manager = new RuntimeManager('/tmp/unused', () => undefined, () => false, fetcher);
    const status = await manager.checkNexus();
    expect(status.nexusAvailable).toBe(false);
    expect(status.nexusError).toContain('No release with a Xodus Nexus runtime');
  });

  it('installs a downloaded Nexus runtime under its versioned release name', async () => {
    // Build a real tar.xz runtime archive with a fake wine binary, publish it
    // through the mocked release API, and run the full install path:
    // download, SHA-512 verification, extraction, canonical naming, pointer.
    const releaseName = 'xodus-nexus-runtime-11.0-20261011-g3fd4ae10';
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xodus-nexus-install-test-'));
    const build = path.join(root, 'build');
    const top = 'proton-xodus-bleeding-edge-11.0-20260803-3-g7c0b4354-x86_64';
    const wine = path.join(build, top, 'files', 'bin', 'wine');
    await fs.mkdir(path.dirname(wine), { recursive: true });
    await fs.writeFile(wine, '#!/bin/sh\necho wine-11.0-test\n', { mode: 0o755 });
    const packed = await run('tar', ['-cJf', path.join(build, `${releaseName}-x86_64.tar.xz`), '-C', build, top]);
    if (packed.code !== 0) throw new Error('The tar fixture could not be created.');
    const digest = createHash('sha512').update(await fs.readFile(path.join(build, `${releaseName}-x86_64.tar.xz`))).digest('hex');
    await fs.writeFile(path.join(build, `${releaseName}-x86_64.sha512sum`), `${digest}  ${releaseName}-x86_64.tar.xz\n`);
    const fetcher = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('/releases?')) {
        return new Response(JSON.stringify([{ tag_name: 'runtime-11.0-20261011-g3fd4ae10', assets: [
          { name: `${releaseName}-x86_64.tar.xz`, browser_download_url: `https://example.com/${releaseName}-x86_64.tar.xz` },
          { name: `${releaseName}-x86_64.sha512sum`, browser_download_url: `https://example.com/${releaseName}-x86_64.sha512sum` },
        ] }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const file = path.join(build, url.split('/').pop()!);
      return new Response(await fs.readFile(file), { status: 200 });
    }) as typeof fetch;
    const manager = new RuntimeManager(root, () => undefined, () => false, fetcher);
    try {
      await manager.refresh(); // detect tar and sha512sum prerequisites
      const winePath = await manager.installNexus(() => undefined);
      expect(winePath).toBe(path.join(root, 'releases', releaseName, 'files', 'bin', 'wine'));
      const pointer = JSON.parse(await fs.readFile(path.join(root, 'current.json'), 'utf8')) as { name: string; commit: string };
      expect(pointer.name).toBe(releaseName);
      expect(pointer.commit).toBe('runtime-11.0-20261011-g3fd4ae10');
      expect(manager.current.name).toBe(releaseName);
      expect(manager.current.installed).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('extracts the preserved base release', () => {
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1-userstate-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1-userstate-v1-userguest-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1-userstate-v1-userguest-v1-locale-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-locale-v1')).toBe('proton-xodus-test-offline-v2');
  });

  it('rejects unrelated and malformed release names', () => {
    expect(previewBaseRelease('proton-xodus-test-offline-v2')).toBeNull();
    expect(previewBaseRelease('../escape-xgamesave-pr28-3fd4ae1091')).toBeNull();
  });

  it('atomically switches a preview back to its validated base release', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xodus-runtime-test-'));
    const base = 'proton-xodus-test-offline-v2';
    const winePath = path.join(root, 'releases', base, 'files', 'bin', 'wine');
    try {
      await fs.mkdir(path.dirname(winePath), { recursive: true });
      await fs.writeFile(winePath, '#!/bin/sh\necho wine-test\n', { mode: 0o755 });
      await fs.writeFile(path.join(root, 'current.json'), JSON.stringify({
        name: `${base}-xgamesave-pr28-3fd4ae1091`, winePath: '/preview/wine', commit: 'abc', installedAt: 'before',
      }));
      const manager = new RuntimeManager(root, () => undefined, () => false);
      expect(await manager.rollbackCloudSavePreview(() => undefined)).toBe(winePath);
      const pointer = JSON.parse(await fs.readFile(path.join(root, 'current.json'), 'utf8')) as { name: string; winePath: string };
      expect(pointer.name).toBe(base);
      expect(pointer.winePath).toBe(winePath);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
