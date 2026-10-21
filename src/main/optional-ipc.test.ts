import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Run the production optional IPC routes against isolated ports. Never import
// Electron, invoke a desktop service, open an account, or request a web page.
const source = ts.createSourceFile('index.ts', readFileSync('src/main/index.ts', 'utf8'), ts.ScriptTarget.ES2022, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'registerIpc');
if (!declaration) throw Error('Production IPC registration was not found.');
const executable = ts.transpileModule(ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function fixture() {
  const handlers = new Map<string, (...args: any[]) => any>();
  const host = vi.fn(() => { throw Error('A demo route reached a host operation.'); });
  const contents = { id: 1, mainFrame: {} };
  const context = vm.createContext({
    ipcMain: { handle: (name: string, callback: (...args: any[]) => any) => handlers.set(name, callback) },
    mainWindow: { webContents: contents, isFocused: () => true, isFullScreen: () => false },
    desktopGuide: { webContents: undefined, hide: vi.fn() }, demoMode: true,
    fullscreenExperience: { current: { available: false, active: false, source: 'none' }, refresh: host, setWindow: host },
    xboxModeRestart: { status: host, prepare: host, restart: host }, XboxModeEntryHandoff: class {},
    voiceCapture: { request: host, release: vi.fn() }, guideSystem: { readState: host, execute: host, openSettings: host },
    guidePower: { prepare: host, consume: host }, validGuidePowerAction: host, unavailableGuideSystem: (reason: string) => ({ reason }),
    guideMixer: { state: host, control: host }, guidePerformance: { sample: host }, guideGallery: host,
    spotify: { state: host, control: host }, guideAudio: host, scanLibraryProviders: host,
    batteryPercentage: host, batteryPowerStatus: host,
    cloudGaming: { state: { open: false, phase: 'closed' }, open: host, control: host, destroy: host },
    remotePlay: { state: { open: false, phase: 'closed' }, open: host, control: host, destroy: host },
    registerDemoIpc: vi.fn(), currentMarket: () => 'US', shutdownStarted: false,
  });
  vm.runInContext(executable + '\nregisterIpc();', context);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  return { host, invoke: (name: string, ...args: unknown[]) => Promise.resolve().then(() => handlers.get(name)!(event, ...args)) };
}

describe('production optional IPC demo admission', () => {
  it('rejects modifying desktop, capture, power and streaming requests before their host ports', async () => {
    const f = fixture();
    for (const [name, ...args] of [
      ['window-fullscreen-set', true], ['fullscreen-experience-set', true],
      ['xbox-mode-restart-status'], ['xbox-mode-restart-prepare'], ['xbox-mode-restart', 'token'],
      ['voice-capture-request'], ['guide-power-prepare', 'reboot'], ['guide-system-settings', 'network'],
      ['guide-mixer-control', {}], ['guide-gallery-open', 'id'], ['guide-gallery-delete', 'id'],
      ['guide-spotify-control', {}], ['guide-capture'], ['cloud-gaming-open'], ['cloud-gaming-control', 'home'],
      ['remote-play-open'], ['remote-play-control', 'home'], ['desktop-guide-xbox-mode-entry'],
    ]) await expect(f.invoke(name as string, ...args)).rejects.toThrow(/demo mode|controlled from the launcher/);
    expect(f.host).not.toHaveBeenCalled();
  });
  it('returns unavailable or unknown demo facts without probing the host', async () => {
    const f = fixture();
    expect(await f.invoke('fullscreen-experience-get')).toMatchObject({ available: false, active: false });
    expect(await f.invoke('guide-system-get')).toMatchObject({ reason: expect.any(String) });
    expect(await f.invoke('guide-system-execute', { type: 'power', action: 'reboot' })).toMatchObject({ ok: false });
    expect(await f.invoke('guide-mixer-get')).toMatchObject({ status: 'unsupported' });
    expect(await f.invoke('guide-performance-get')).toMatchObject({ status: 'unavailable' });
    expect(await f.invoke('guide-gallery-get')).toMatchObject({ status: 'unavailable' });
    expect(await f.invoke('guide-spotify-get')).toMatchObject({ status: 'unsupported' });
    expect(await f.invoke('guide-audio-get')).toMatchObject({ available: false });
    expect(await f.invoke('guide-audio-set', { volume: 50 })).toMatchObject({ available: false });
    expect(await f.invoke('library-providers')).toEqual([]);
    expect(await f.invoke('battery-percentage')).toBeNull();
    expect(await f.invoke('battery-status')).toEqual({ percentage: null, charging: null, externalPower: null });
    expect(f.host).not.toHaveBeenCalled();
  });
});
