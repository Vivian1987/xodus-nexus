import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LauncherUpdater, launcherCandidate } from './launcher-update.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
function image(marker: number): Buffer {
  const bytes = Buffer.alloc(100, marker); Buffer.from('7f454c46', 'hex').copy(bytes);
  bytes[4] = 2; bytes[5] = 1; Buffer.from('414902', 'hex').copy(bytes, 8); bytes.writeUInt16LE(62, 18); return bytes;
}
function release(version = '0.2.3') {
  const name = `Xodus-Nexus-${version}-x86_64.AppImage`;
  return { tag_name: `v${version}`, assets: [
    { name, size: 100, browser_download_url: `https://github.com/domsvoboda/xodus-nexus/releases/download/v${version}/${name}` },
    { name: `${name}.sha512sum`, size: 200, browser_download_url: `https://github.com/domsvoboda/xodus-nexus/releases/download/v${version}/${name}.sha512sum` },
  ] };
}
async function fixture(bad = '') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-update-test-')); roots.push(root);
  const target = path.join(root, 'Launcher.AppImage'); await fs.writeFile(target, image(1), { mode: 0o700 });
  const next = bad === 'format' ? Buffer.alloc(100) : image(2);
  const r = release();
  const fetcher = (async (url: string | URL | Request) => {
    const text = String(url);
    if (text.includes('api.github')) return new Response(JSON.stringify([r]));
    if (text.endsWith('.sha512sum')) return new Response(`${bad === 'checksum' ? '0'.repeat(128) : createHash('sha512').update(next).digest('hex')}  ${r.assets[0].name}\n`);
    if (bad === 'network') throw new Error('Network interrupted');
    return new Response(next);
  }) as typeof fetch;
  const updater = new LauncherUpdater('0.2.2', target, root, () => {}, fetcher);
  await updater.initialize(); await updater.check(); return { root, target, updater, fetcher };
}
describe('AppImage updater', () => {
  it('ignores backend/runtime tags and prereleases; uses newest complete stable launcher', () => {
    expect(launcherCandidate([{ ...release('9.0.0'), tag_name: 'backend-v9.0.0' }, { ...release('8.0.0'), prerelease: true }, release('0.2.3'), release('0.2.4')], '0.2.2')?.version).toBe('0.2.4');
    expect(launcherCandidate([release()], '0.2.3')).toBeUndefined();
    const unsafe = release(); unsafe.assets[0].browser_download_url = 'https://evil.example/update';
    expect(launcherCandidate([unsafe], '0.2.2')).toBeUndefined();
  });
  it('atomically installs exact verified bytes and restores the previous launcher without touching settings', async () => {
    const { root, target, updater, fetcher } = await fixture();
    await fs.writeFile(path.join(root, 'settings.json'), 'KEEP');
    await updater.install(); expect(await fs.readFile(target)).toEqual(image(2));
    expect(updater.state.restartRequired).toBe(true); expect(updater.state.canRollback).toBe(true);
    const restarted = new LauncherUpdater('0.2.3', target, root, () => {}, fetcher); await restarted.initialize();
    expect(restarted.state.canRollback).toBe(true); await restarted.rollback();
    expect(await fs.readFile(target)).toEqual(image(1)); expect(await fs.readFile(path.join(root, 'settings.json'), 'utf8')).toBe('KEEP');
  });
  it.each(['checksum', 'network', 'format'])('preserves the installed image on %s failure and removes staging/lock', async bad => {
    const { root, target, updater } = await fixture(bad);
    await expect(updater.install()).rejects.toThrow(); expect(await fs.readFile(target)).toEqual(image(1));
    expect((await fs.readdir(root)).some(name => name.includes('nexus-update') || name.includes('nexus-backup'))).toBe(false);
    expect(updater.state.updating).toBe(false);
  });
  it('rejects shared-writable images and keeps manual release download available for development builds', async () => {
    const { root, target, fetcher } = await fixture(); await fs.chmod(target, 0o777);
    const updater = new LauncherUpdater('0.2.2', target, root, () => {}, fetcher); await updater.initialize(); await updater.check();
    expect(updater.state.canInstall).toBe(false); expect(updater.state.releaseUrl).toContain('/releases/tag/v0.2.3');
    await expect(updater.install()).rejects.toThrow('owned');
    const dev = new LauncherUpdater('0.2.2', undefined, root, () => {}, fetcher); await dev.initialize(); expect(dev.state.canInstall).toBe(false);
  });
  it('ignores malformed release rows and duplicate assets while retaining original Nexus names', () => {
    const duplicate = release('0.2.5'); duplicate.assets.push(duplicate.assets[0]);
    const malformed = { ...release('0.2.6'), assets: {} };
    expect(launcherCandidate([null, 1, {}, malformed, duplicate, release('0.2.4')] as never, '0.2.2')?.version).toBe('0.2.4');
  });
  it.each(['metadata-size', 'metadata-utf8', 'api-redirect', 'checksum-size'])('keeps the installed image intact on bounded transport failure: %s', async scenario => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-update-bounds-')); roots.push(root);
    const target = path.join(root, 'Launcher.AppImage'); await fs.writeFile(target, image(1), { mode: 0o700 });
    const fetcher = (async (input: string | URL | Request) => {
      if (String(input).includes('api.github')) {
        if (scenario === 'metadata-size') return new Response('[]', { headers: { 'content-length': '2000001' } });
        if (scenario === 'metadata-utf8') return new Response(new Uint8Array([0xc3, 0x28]));
        if (scenario === 'api-redirect') return new Response(null, { status: 302, headers: { location: 'https://example.test/releases' } });
        return new Response(JSON.stringify([release()]));
      }
      if (String(input).endsWith('.sha512sum')) return new Response(' '.repeat(4097));
      throw Error('An unverified executable must never be downloaded.');
    }) as typeof fetch;
    const updater = new LauncherUpdater('0.2.2', target, root, () => {}, fetcher); await updater.initialize(); await updater.check();
    if (scenario === 'checksum-size') await expect(updater.install()).rejects.toThrow('download limit');
    else { expect(updater.state.error).toBeTruthy(); await expect(updater.install()).rejects.toThrow('Check for a newer'); }
    expect(await fs.readFile(target)).toEqual(image(1));
    expect(await fs.readdir(root)).toEqual(['Launcher.AppImage']); expect(updater.state.updating).toBeFalsy();
  });
});
