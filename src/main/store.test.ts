import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectGameDirectory, StateStore } from './store.js';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeEacGame(targetHeader: Buffer, eacDirectory = 'EasyAntiCheat') {
  const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-game-'));
  created.push(directory);
  await mkdir(path.join(directory, eacDirectory), { recursive: true });
  await mkdir(path.join(directory, 'Game', 'Binaries'), { recursive: true });
  await writeFile(path.join(directory, 'MicrosoftGame.config'), '<Game><ExecutableList><Executable Name="start_protected_game.exe" /></ExecutableList><StoreId>TEST123</StoreId></Game>');
  await writeFile(path.join(directory, '.xodus-streaming.msixvc'), 'container');
  await writeFile(path.join(directory, 'start_protected_game.exe'), 'encrypted launcher');
  await writeFile(path.join(directory, eacDirectory, 'Settings.json'), JSON.stringify({ executable: 'Game\\Binaries\\Game.exe' }));
  await writeFile(path.join(directory, 'Game', 'Binaries', 'Game.exe'), targetHeader);
  return directory;
}

describe('inspectGameDirectory anti-cheat support', () => {
  it('detects an encrypted EAC chain without declaring online play unsupported', async () => {
    const game = await inspectGameDirectory(await makeEacGame(Buffer.from([0x01, 0x02, 0x03])));
    expect(game.installState).toBe('ready');
    expect(game.executable).toBe('start_protected_game.exe');
    expect(game.antiCheat).toEqual({
      provider: 'Easy Anti-Cheat',
      executable: 'Game\\Binaries\\Game.exe',
      encryptedTarget: true,
    });
    expect(game).not.toHaveProperty('launchSupport');
  });

  it('keeps the manifest launcher even when the EAC target is an ordinary PE file', async () => {
    const game = await inspectGameDirectory(await makeEacGame(Buffer.from('MZ executable')));
    expect(game.executable).toBe('start_protected_game.exe');
    expect(game.antiCheat?.encryptedTarget).toBe(false);
  });

  it('detects the EasyAntiCheat_EOS metadata layout', async () => {
    const game = await inspectGameDirectory(await makeEacGame(Buffer.from('MZ executable'), 'EasyAntiCheat_EOS'));
    expect(game.antiCheat?.provider).toBe('Easy Anti-Cheat');
    expect(game.executable).toBe('start_protected_game.exe');
  });

  it('does not show an EAC warning without EAC metadata', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-no-eac-'));
    created.push(directory);
    await writeFile(path.join(directory, 'MicrosoftGame.config'), '<Game><ExecutableList><Executable Name="Game.exe" /></ExecutableList></Game>');
    await writeFile(path.join(directory, '.xodus-streaming.msixvc'), 'container');
    await writeFile(path.join(directory, 'Game.exe'), 'MZ executable');
    const game = await inspectGameDirectory(directory);
    expect(game.antiCheat).toBeUndefined();
    expect(game).not.toHaveProperty('launchBlockReason');
  });
});

describe('inspectGameDirectory prerequisites', () => {
  it('detects a declared VC14 dependency with an encrypted redistributable', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-vc-game-'));
    created.push(directory);
    await mkdir(path.join(directory, 'Engine', 'Extras', 'Redist', 'en-us'), { recursive: true });
    await writeFile(path.join(directory, 'MicrosoftGame.config'), '<Game><ExecutableList><Executable Name="Game.exe" /></ExecutableList><KnownDependency Name="VC14" /></Game>');
    await writeFile(path.join(directory, 'Game.exe'), 'encrypted executable');
    await writeFile(path.join(directory, '.xodus-streaming.msixvc'), 'container');
    await writeFile(path.join(directory, 'Engine', 'Extras', 'Redist', 'en-us', 'vc_redist.x64.exe'), Buffer.from([0, 1, 2]));
    expect((await inspectGameDirectory(directory)).vcRedistEncrypted).toBe(true);
  });
});

describe('new profile defaults', () => {
  it('discards legacy EAC-free route fields without losing the installation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-legacy-'));
    created.push(directory);
    await writeFile(path.join(directory, 'launcher-state.json'), JSON.stringify({ games: [{
      id: 'game', title: 'Any title', path: '/package', executable: 'Launcher.exe',
      launchSupport: 'offline-only-eac', launchBlockReason: 'Old warning', installState: 'ready',
    }] }));
    const store = new StateStore(directory);
    await store.load();
    expect(store.games[0].executable).toBe('Launcher.exe');
    expect(store.games[0]).not.toHaveProperty('launchSupport');
    expect(store.games[0]).not.toHaveProperty('launchBlockReason');
  });
  it('does not assume a particular disk or Xodus checkout', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-settings-'));
    created.push(directory);
    const store = new StateStore(directory);
    await store.load();
    expect(store.settings.installRoot).toContain(path.join('Games', 'Xodus Nexus'));
    expect(store.settings.installRoot).not.toContain('/mnt/data2');
    expect(store.settings.externalXodusRoot).toBe('');
    expect(store.settings.verboseLogs).toBe(false);
  });
});

describe('install queue history', () => {
  it('removes only finished entries and never deletes install files', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-queue-'));
    created.push(directory);
    const store = new StateStore(directory);
    await store.load();
    const destination = path.join(directory, 'game');
    await mkdir(destination);
    await writeFile(path.join(destination, 'keep.txt'), 'game data');
    const base = { title: 'Game', productId: 'TEST', destination, progress: null, phase: '', log: [], startedAt: new Date().toISOString() };
    await store.addDownload({ ...base, id: 'running', status: 'running' });
    await store.addDownload({ ...base, id: 'failed', status: 'failed' });
    await expect(store.removeDownload('running')).rejects.toThrow('Stop the installation');
    await store.removeDownload('failed');
    expect(store.downloads.map((task) => task.id)).toEqual(['running']);
    await store.clearFinishedDownloads();
    expect(store.downloads.map((task) => task.id)).toEqual(['running']);
    expect(await readFile(path.join(destination, 'keep.txt'), 'utf8')).toBe('game data');
  });
});

describe('inspectGameDirectory artwork', () => {
  it('reads a case-variant MicrosoftGame.Config and its cover', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-art-case-'));
    created.push(directory);
    await writeFile(path.join(directory, 'MicrosoftGame.Config'), '<Game><ShellVisuals DefaultDisplayName="Forza Horizon 6" Square150x150Logo="Logo.png" /><ExecutableList><Executable Name="Game.exe" /></ExecutableList></Game>');
    await writeFile(path.join(directory, '.xodus-streaming.msixvc'), 'container');
    await writeFile(path.join(directory, 'Game.exe'), 'MZ executable');
    await writeFile(path.join(directory, 'Logo.png'), 'PNGDATA');
    const game = await inspectGameDirectory(directory);
    expect(game.title).toBe('Forza Horizon 6');
    expect(game.coverDataUrl).toBe('data:image/png;base64,UE5HREFUQQ==');
  });

  it('falls back to the appxmanifest visual elements for the cover', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-art-appx-'));
    created.push(directory);
    await writeFile(path.join(directory, 'MicrosoftGame.config'), '<Game><ExecutableList><Executable Name="Game.exe" /></ExecutableList></Game>');
    await writeFile(path.join(directory, 'appxmanifest.xml'), '<Package><Applications><Application Id="App" Executable="Game.exe"><uap:VisualElements DisplayName="Forza Horizon 6" Square44x44Logo="Small.png" Square150x150Logo="Logo.png" /></Application></Applications></Package>');
    await writeFile(path.join(directory, '.xodus-streaming.msixvc'), 'container');
    await writeFile(path.join(directory, 'Game.exe'), 'MZ executable');
    await writeFile(path.join(directory, 'Logo.png'), 'PNGDATA');
    const game = await inspectGameDirectory(directory);
    expect(game.coverDataUrl).toBe('data:image/png;base64,UE5HREFUQQ==');
  });
});
