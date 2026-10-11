import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { managedUnrealCultureGameIni, prefixUserLocale, prepareProtonRunner, syncPrefixUserLocale, syncUnrealCultureGameIni } from './proton.js';

const created: string[] = [];
const execFile = promisify(execFileCallback);

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('prepareProtonRunner', () => {
  it('initializes Proton, then executes Wine directly with the Proton environment', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-proton-'));
    created.push(root);
    const wine = path.join(root, 'runtime', 'files', 'bin', 'wine');
    const proton = path.join(root, 'runtime', 'proton');
    await mkdir(path.dirname(wine), { recursive: true });
    await mkdir(path.join(root, 'runtime', 'files', 'share', 'default_pfx'), { recursive: true });
    await writeFile(wine, '#!/bin/sh\nprintf \'%s\\n\' "$WINEPREFIX" "$WINEDLLPATH" "$WINEDLLOVERRIDES" "$1"\n');
    await chmod(wine, 0o700);
    await writeFile(proton, '#!/bin/sh\nroot="$STEAM_COMPAT_DATA_PATH/pfx/drive_c/windows/system32"\nmkdir -p "$root"\ntouch "$root/libvkd3d-utils-1.dll" "$root/dxgi.dll" "$root/d3d12.dll"\n');
    await chmod(proton, 0o700);

    const compat = path.join(root, "compat game's data");
    const steam = path.join(root, "steam user's root");
    const result = await prepareProtonRunner(wine, compat, steam);
    expect(result?.command).toBe(path.join(compat, 'xodus-proton-wine'));
    const { stdout } = await execFile(result!.command, ['target path']);
    const lines = stdout.trim().split('\n');
    expect(lines[0]).toBe(path.join(compat, 'pfx'));
    expect(lines[1]).toContain('/files/lib/vkd3d:');
    expect(lines[2]).toContain('dxgi=n');
    expect(lines[3]).toBe('target path');
  });

  it('falls back when the selected Wine is not part of a Proton distribution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-wine-'));
    created.push(root);
    expect(await prepareProtonRunner(path.join(root, 'bin', 'wine'), path.join(root, 'compat'), path.join(root, 'steam'))).toBeUndefined();
  });

  it.each(['', '/explicit/eac'])('discovers the installed EAC bridge without overriding configuration (%s)', async (explicit) => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-eac-runner-'));
    created.push(root);
    const files = path.join(root, 'runtime/files');
    const wine = path.join(files, 'bin/wine');
    const steam = path.join(root, "Steam's library");
    const eac = path.join(steam, 'steamapps/common/Proton EasyAntiCheat Runtime');
    const compat = path.join(root, 'compat');
    const system32 = path.join(compat, 'pfx/drive_c/windows/system32');
    await mkdir(path.dirname(wine), { recursive: true });
    await mkdir(path.join(files, 'share/default_pfx'), { recursive: true });
    await mkdir(system32, { recursive: true });
    for (const dll of ['libvkd3d-utils-1.dll', 'dxgi.dll', 'd3d12.dll']) await writeFile(path.join(system32, dll), 'ready');
    await writeFile(wine, '#!/bin/sh\nprintf \'%s\\n\' "$PROTON_EAC_RUNTIME"\n');
    await chmod(wine, 0o700);
    await writeFile(path.join(files, '../proton'), '#!/bin/sh\nexit 0\n');
    await chmod(path.join(files, '../proton'), 0o700);
    await mkdir(path.join(eac, 'v2/lib64'), { recursive: true });
    for (const name of ['easyanticheat_x64.dll', 'easyanticheat_x64.so']) await writeFile(path.join(eac, 'v2/lib64', name), 'fixture');
    const runner = await prepareProtonRunner(wine, compat, steam);
    const { stdout } = await execFile(runner!.command, [], { env: { ...process.env, PROTON_EAC_RUNTIME: explicit } });
    expect(stdout.trim()).toBe(explicit || eac);
  });

  it.each([0, 23])('waits for launcher descendants and preserves launcher exit %s', async (launcherExit) => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-proton-descendants-'));
    created.push(root);
    const files = path.join(root, "runtime's directory", 'files');
    const wine = path.join(files, 'bin', 'wine');
    const server = path.join(files, 'bin', 'wineserver');
    const compat = path.join(root, 'compat');
    await mkdir(path.dirname(wine), { recursive: true });
    await mkdir(path.join(files, 'share', 'default_pfx'), { recursive: true });
    const system32 = path.join(compat, 'pfx', 'drive_c', 'windows', 'system32');
    await mkdir(system32, { recursive: true });
    for (const dll of ['libvkd3d-utils-1.dll', 'dxgi.dll', 'd3d12.dll']) await writeFile(path.join(system32, dll), 'ready');
    await writeFile(path.join(files, '..', 'proton'), '#!/bin/sh\nexit 0\n');
    await chmod(path.join(files, '..', 'proton'), 0o700);
    await writeFile(wine, `#!/bin/sh\nprintf 'launcher exited\\n' >> "$RECORD"\nexit ${launcherExit}\n`);
    await writeFile(server, '#!/bin/sh\n[ "$1" = "-w" ] || exit 91\n[ "$WINEPREFIX" = "$EXPECTED_PREFIX" ] || exit 92\nprintf \'descendant still running\\n\' >> "$RECORD"\nsleep 0.1\nprintf \'descendant finished\\n\' >> "$RECORD"\n');
    await chmod(wine, 0o700);
    await chmod(server, 0o700);
    const record = path.join(root, 'lifecycle');
    const runner = await prepareProtonRunner(wine, compat, path.join(root, 'steam'));
    let code = 0;
    try {
      await execFile(runner!.command, ['launcher.exe'], { env: { ...process.env, RECORD: record, EXPECTED_PREFIX: path.join(compat, 'pfx') } });
    } catch (error) { code = (error as { code: number }).code; }
    expect(code).toBe(launcherExit);
    expect((await readFile(record, 'utf8')).trim().split('\n')).toEqual(['launcher exited', 'descendant still running', 'descendant finished']);
  });

  it.each([false, true])('keeps media libraries coherent (host SDK: %s) without inheriting editor libraries', async (hostLibraries) => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-proton-media-'));
    created.push(root);
    const runtime = path.join(root, "runtime's files");
    const files = path.join(runtime, 'files');
    const wine = path.join(files, 'bin', 'wine');
    const compat = path.join(root, 'compat');
    await mkdir(path.dirname(wine), { recursive: true });
    await mkdir(path.join(files, 'share', 'default_pfx'), { recursive: true });
    const system32 = path.join(compat, 'pfx', 'drive_c', 'windows', 'system32');
    await mkdir(system32, { recursive: true });
    for (const dll of ['libvkd3d-utils-1.dll', 'dxgi.dll', 'd3d12.dll']) await writeFile(path.join(system32, dll), 'ready');
    await writeFile(wine, '#!/bin/sh\nprintf \'%s\\n\' "$LD_LIBRARY_PATH" "$GST_PLUGIN_SYSTEM_PATH_1_0" "$GST_PLUGIN_PATH_1_0" "$WINE_GST_REGISTRY_DIR" "$MEDIACONV_BLANK_VIDEO_FILE" "$MEDIACONV_BLANK_AUDIO_FILE"\n');
    await chmod(wine, 0o700);
    await writeFile(path.join(runtime, 'proton'), '#!/bin/sh\nexit 0\n');
    await chmod(path.join(runtime, 'proton'), 0o700);
    if (hostLibraries) await writeFile(path.join(runtime, 'XODUS_NEXUS_PATCH.json'), JSON.stringify({ features: ['wine-host-libraries-v1'] }));
    const runner = await prepareProtonRunner(wine, compat, path.join(root, 'steam'));
    const { stdout } = await execFile(runner!.command, [], { env: { ...process.env, LD_LIBRARY_PATH: '/editor/foreign-libraries', GST_PLUGIN_PATH_1_0: '/editor/foreign-plugins' } });
    const values = stdout.split('\n');
    expect(values[0]).not.toContain('/editor');
    expect(values[0].startsWith('/usr/lib:')).toBe(hostLibraries);
    expect(values[1]).toBe(hostLibraries ? '/usr/lib/gstreamer-1.0' : ['x86_64-linux-gnu', 'aarch64-linux-gnu', 'i386-linux-gnu'].map((arch) => path.join(files, 'lib', arch, 'gstreamer-1.0')).join(':'));
    expect(values[2]).toBe('');
    expect(values[3]).toBe(path.join(compat, 'gstreamer-1.0'));
    expect(values[4]).toBe(path.join(files, 'share', 'media', 'blank.mkv'));
    expect(values[5]).toBe(path.join(files, 'share', 'media', 'blank.ptna'));
  });

  it('rebases existing prefix symlinks when the selected Proton runtime changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-proton-rebase-'));
    created.push(root);
    const previousRuntime = path.join(root, 'releases', 'previous');
    const currentRuntime = path.join(root, 'releases', 'current');
    const wine = path.join(currentRuntime, 'files', 'bin', 'wine');
    const proton = path.join(currentRuntime, 'proton');
    const previousDll = path.join(previousRuntime, 'files', 'lib', 'wine', 'x86_64-windows', 'xgameruntime.dll');
    const currentDll = path.join(currentRuntime, 'files', 'lib', 'wine', 'x86_64-windows', 'xgameruntime.dll');
    const compat = path.join(root, 'compat');
    const system32 = path.join(compat, 'pfx', 'drive_c', 'windows', 'system32');
    const prefixDll = path.join(system32, 'xgameruntime.dll');

    await mkdir(path.dirname(wine), { recursive: true });
    await mkdir(path.join(currentRuntime, 'files', 'share', 'default_pfx'), { recursive: true });
    await mkdir(path.dirname(previousDll), { recursive: true });
    await mkdir(path.dirname(currentDll), { recursive: true });
    await mkdir(system32, { recursive: true });
    await writeFile(wine, '#!/bin/sh\nexit 0\n');
    await chmod(wine, 0o700);
    await writeFile(proton, '#!/bin/sh\nexit 0\n');
    await chmod(proton, 0o700);
    await writeFile(previousDll, 'old');
    await writeFile(currentDll, 'new');
    await symlink(previousDll, prefixDll);
    for (const dll of ['libvkd3d-utils-1.dll', 'dxgi.dll', 'd3d12.dll']) {
      await writeFile(path.join(system32, dll), 'ready');
    }

    await prepareProtonRunner(wine, compat, path.join(root, 'steam'));
    expect(await readlink(prefixDll)).toBe(currentDll);
  });
});

describe('syncPrefixUserLocale', () => {
  it('reads the pinned prefix locale and deletes the registry key when it differs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-locale-'));
    created.push(root);
    const prefix = path.join(root, 'pfx');
    await mkdir(prefix, { recursive: true });
    await writeFile(path.join(prefix, 'user.reg'), 'WINE REGISTRY Version 2\n\n[Control Panel\\\\International] 1\n"LocaleName"="en-US"\n');
    const wine = path.join(root, 'wine');
    const record = path.join(root, 'reg-calls');
    await writeFile(wine, '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$RECORD"\nexit 0\n');
    await chmod(wine, 0o700);

    expect(await prefixUserLocale(prefix)).toBe('en-US');
    const lines: string[] = [];
    await syncPrefixUserLocale(wine, prefix, 'cs-CZ', { RECORD: record }, (line) => lines.push(line));
    const calls = (await readFile(record, 'utf8')).trim().split('\n');
    expect(calls).toEqual(['reg', 'delete', 'HKCU\\Control Panel\\International', '/f']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('en-US');
    expect(lines[0]).toContain('cs-CZ');
  });

  it('keeps a matching locale and ignores base-language-only selections', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-locale-skip-'));
    created.push(root);
    const prefix = path.join(root, 'pfx');
    await mkdir(prefix, { recursive: true });
    await writeFile(path.join(prefix, 'user.reg'), 'WINE REGISTRY Version 2\n\n[Control Panel\\\\International] 1\n"LocaleName"="cs-CZ"\n');
    const wine = path.join(root, 'wine');
    const record = path.join(root, 'reg-calls');
    await writeFile(wine, '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$RECORD"\nexit 0\n');
    await chmod(wine, 0o700);

    const lines: string[] = [];
    await syncPrefixUserLocale(wine, prefix, 'cs-CZ', { RECORD: record }, (line) => lines.push(line));
    await syncPrefixUserLocale(wine, prefix, 'cs', { RECORD: record }, (line) => lines.push(line));
    await expect(readFile(record, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(lines).toHaveLength(0);
  });

  it('reports a failed registry update without throwing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'xodus-nexus-locale-fail-'));
    created.push(root);
    const prefix = path.join(root, 'pfx');
    await mkdir(prefix, { recursive: true });
    await writeFile(path.join(prefix, 'user.reg'), 'WINE REGISTRY Version 2\n\n[Control Panel\\\\International] 1\n"LocaleName"="en-US"\n');
    const wine = path.join(root, 'wine');
    await writeFile(wine, '#!/bin/sh\nexit 1\n');
    await chmod(wine, 0o700);

    const lines: string[] = [];
    await syncPrefixUserLocale(wine, prefix, 'cs-CZ', {}, (line) => lines.push(line));
    expect(lines.some((line) => line.includes('could not be updated'))).toBe(true);
  });
});

describe('syncUnrealCultureGameIni', () => {
  async function makePrefix(name: string, options: { unreal?: boolean } = {}): Promise<{ prefix: string; configDirectory: string; install: string }> {
    const root = await mkdtemp(path.join(tmpdir(), `xodus-nexus-gameini-${name}-`));
    created.push(root);
    const configDirectory = path.join(root, 'pfx', 'drive_c', 'users', 'steamuser', 'AppData', 'Local', 'Microsoft', 'Gears of War E-Day', 'WinGDK', '6BE41AB5', 'Saved', 'Config', 'WinGDK');
    await mkdir(configDirectory, { recursive: true });
    const install = path.join(root, 'install');
    await mkdir(install, { recursive: true });
    if (options.unreal !== false) await mkdir(path.join(install, 'Engine'), { recursive: true });
    return { prefix: path.join(root, 'pfx'), configDirectory, install };
  }

  it('pins the culture with an ownership marker in a read-only Game.ini and preserves unrelated sections', async () => {
    const { prefix, configDirectory, install } = await makePrefix('write');
    const gameIni = path.join(configDirectory, 'Game.ini');
    await writeFile(gameIni, '[/Script/AkAudio.AkSettings]\r\nUnrealCultureToWwiseCulture=(("en","English(US)"))\r\n');
    const lines: string[] = [];
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', 'cs-CZ', (line) => lines.push(line));
    const content = await readFile(gameIni, 'utf8');
    expect(content).toContain('Culture=cs-CZ');
    expect(content).toContain('[Internationalization]');
    expect(content).toContain('UnrealCultureToWwiseCulture');
    expect((await stat(gameIni)).mode & 0o222).toBe(0);
    expect(lines.join('\n')).toContain('Pinned the Unreal text language');
  });

  it('keeps an already pinned culture and replaces a stale one, then removes the pin when no language is selected', async () => {
    const { prefix, configDirectory, install } = await makePrefix('update');
    const gameIni = path.join(configDirectory, 'Game.ini');
    const lines: string[] = [];
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', 'cs-CZ', (line) => lines.push(line));
    const pinned = await readFile(gameIni, 'utf8');
    expect(pinned).toContain('Culture=cs-CZ');

    lines.length = 0;
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', 'cs-CZ', (line) => lines.push(line));
    expect(lines).toHaveLength(0);
    expect(await readFile(gameIni, 'utf8')).toBe(pinned);

    lines.length = 0;
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', 'de-DE', (line) => lines.push(line));
    const replaced = await readFile(gameIni, 'utf8');
    expect(replaced).toContain('Culture=de-DE');
    expect(replaced).not.toContain('cs-CZ');

    lines.length = 0;
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', undefined, (line) => lines.push(line));
    const removed = await readFile(gameIni, 'utf8');
    expect(removed).not.toContain('Culture=');
    expect(removed).not.toContain('[Internationalization]');
    expect(lines.join('\n')).toContain('Removed the pinned Unreal text language');
  });

  it('never touches a manually authored culture line', async () => {
    const { prefix, configDirectory, install } = await makePrefix('manual');
    const gameIni = path.join(configDirectory, 'Game.ini');
    const manual = '[Internationalization]\r\nCulture=fr-FR\r\n';
    await writeFile(gameIni, manual);
    await chmod(gameIni, 0o644);
    const lines: string[] = [];
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', 'cs-CZ', (line) => lines.push(line));
    expect(await readFile(gameIni, 'utf8')).toBe(manual);
    expect((await stat(gameIni)).mode & 0o222).not.toBe(0);
    expect(lines.join('\n')).toContain('manually configured');
  });

  it('does nothing without a title id, for non-Unreal installs, or without a config directory', async () => {
    const { prefix, install } = await makePrefix('skip', { unreal: false });
    const lines: string[] = [];
    await syncUnrealCultureGameIni(prefix, install, undefined, 'cs-CZ', (line) => lines.push(line));
    await syncUnrealCultureGameIni(prefix, install, '6BE41AB5', 'cs-CZ', (line) => lines.push(line));
    await syncUnrealCultureGameIni(prefix, path.join(prefix, 'missing'), '6BE41AB5', 'cs-CZ', (line) => lines.push(line));
    expect(lines).toHaveLength(0);
  });
});

describe('managedUnrealCultureGameIni', () => {
  it('appends a marker-owned section and removes only the owned lines', () => {
    const created = managedUnrealCultureGameIni('', 'cs-CZ');
    expect(created.content).toBe('[Internationalization]\r\n; Xodus Nexus game language\r\nCulture=cs-CZ\r\n');
    expect(created.managed).toBe(true);

    const removed = managedUnrealCultureGameIni(created.content!, undefined);
    expect(removed.content).not.toBeNull();
    expect(removed.content).not.toContain('Culture');
    expect(removed.content).not.toContain('Xodus Nexus');

    const untouched = managedUnrealCultureGameIni('[Internationalization]\r\nCulture=en\r\n', 'cs-CZ');
    expect(untouched.content).toBeNull();
    expect(untouched.manual).toBe(true);
  });
});
