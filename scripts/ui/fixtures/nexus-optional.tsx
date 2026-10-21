import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProfilePage } from '/src/renderer/ProfilePage.tsx';
import { ReferenceMenu, referenceMenuTrigger, type ReferenceMenuAnchor } from '/src/renderer/ReferenceMenu.tsx';
import { GamepadNavigation } from '/src/renderer/GuideNavigation.tsx';
import type { PadAction } from '/src/renderer/guide-navigation.ts';
import { HandheldCompatibilityDialog } from '/src/renderer/HandheldCompatibilityView.tsx';
import { NexusModeStatus } from '/src/renderer/NexusModeStatus.tsx';
import { demoSnapshot } from '/src/shared/demo-data.ts';
import '/src/renderer/styles.css';

// Only synthetic account data, power readings, native events and callbacks.
// No launcher preload, physical device, host fullscreen or account is accessed.
localStorage.setItem('nexus.interface-language.v1', 'en');
Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
let hidden = false;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => hidden ? 'hidden' : 'visible' });
Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
const nativeListeners = new Set<(action: PadAction) => void>();
let outerBacks = 0, selections = 0, profileRefreshes = 0, settings = 0, friends = 0, powerReads = 0;
let completeRefresh: (() => void) | undefined, initialFullscreen: ((value: boolean) => void) | undefined;
let fullscreenChanged: ((value: boolean) => void) | undefined, completePower: (() => void) | undefined, delayPower = false;
let power = { percentage: 42 as number | null, charging: false as boolean | null, externalPower: false as boolean | null };
const statusBridge = {
  getWindowFullscreen: () => new Promise<boolean>(resolve => { initialFullscreen = resolve; }),
  onWindowFullscreenChanged: (changed: (value: boolean) => void) => { fullscreenChanged = changed; return () => { fullscreenChanged = undefined; }; },
  getBatteryStatus: async () => { powerReads++; if (delayPower) await new Promise<void>(resolve => { completePower = resolve; }); return { ...power }; },
};
const originalSetInterval = window.setInterval.bind(window), originalClearInterval = window.clearInterval.bind(window), statusTimers = new Set<number>();
window.setInterval = ((callback: TimerHandler, delay: number, ...args: unknown[]) => { const id = originalSetInterval(callback, delay, ...args); if (delay === 30_000) statusTimers.add(id); return id; }) as typeof window.setInterval;
window.clearInterval = ((id: number) => { statusTimers.delete(id); originalClearInterval(id); }) as typeof window.clearInterval;
const auth = { ...demoSnapshot().auth, username: 'fixture@example.test', gamertag: 'FixturePlayer', subscription: undefined };
function Harness() {
  const [anchor, setAnchor] = useState<ReferenceMenuAnchor>(), [handheld, setHandheld] = useState(false);
  return <><main className="app-shell" style={{ display: 'block', overflow: 'auto' }}>
    <header style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><button type="button" className="secondary" data-fixture-menu-trigger data-gamepad-initial {...referenceMenuTrigger({ onOpen: setAnchor })} onClick={event => setAnchor({ element: event.currentTarget })}>Optional feature menu</button><NexusModeStatus bridge={statusBridge} /></header>
    <ProfilePage auth={auth} settings={() => settings++} friends={() => friends++} refresh={async () => { profileRefreshes++; await new Promise<void>(resolve => { completeRefresh = resolve; }); }} />
  </main>{anchor ? <ReferenceMenu id="fixture-menu" label="Optional feature menu" anchor={anchor} onDismiss={() => setAnchor(undefined)} items={[
    { id: 'unavailable', label: 'Unavailable fixture action', disabled: true, onSelect: () => { throw Error('Disabled action ran'); } },
    { id: 'handheld', label: 'Handheld information', onSelect: () => setHandheld(true) },
    { id: 'select', label: 'Synthetic selection', onSelect: () => selections++ },
    { id: 'hidden', label: 'Hidden fixture action', hidden: true, onSelect: () => { throw Error('Hidden action ran'); } },
  ]} /> : null}{handheld ? <HandheldCompatibilityDialog title="Fixture game" close={() => setHandheld(false)} /> : null}
    <GamepadNavigation activateOnFocus nativeControlsActive subscribeInput={callback => { nativeListeners.add(callback); return () => nativeListeners.delete(callback); }} back={() => outerBacks++} page={() => { throw Error('Optional dialog input must not change pages'); }} />
  </>;
}
const watermark = document.createElement('div'); watermark.textContent = 'ISOLATED FIXTURE · Synthetic profile / input / power · No host actions';
Object.assign(watermark.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: '9999', font: '13px sans-serif', padding: '10px', background: '#132331', color: '#def', pointerEvents: 'none' }); document.body.append(watermark);
createRoot(document.getElementById('root')!).render(<Harness />);
const checks: string[] = [], pause = () => new Promise(resolve => setTimeout(resolve, 100));
const check = (condition: unknown, label: string) => { if (!condition) throw Error(`${label}; focus=${document.activeElement?.outerHTML.slice(0, 200)}`); checks.push(label); };
const native = async (action: PadAction) => { for (const callback of nativeListeners) callback(action); await pause(); };
const focus = (selector: string) => { const node = document.querySelector<HTMLElement>(selector); if (!node) throw Error(selector); node.focus(); };
const capture = async (name: string) => { if (typeof (window as any).__captureFixture === 'function') await (window as any).__captureFixture(name); };
(window as any).runNexusOptionalChecks = async () => {
  await pause(); await pause();
  check(document.querySelector('.profile-page')?.textContent?.includes('FixturePlayer'), 'actual Nexus profile renders the synthetic identity');
  check(document.querySelector('.profile-page')?.textContent?.includes('Gamerscore is unavailable.'), 'missing Gamerscore is reported without an invented number');
  check(!document.querySelector('.profile-membership'), 'no membership badge appears without returned subscription data');
  check(!document.querySelector('.profile-gamerpic img'), 'missing gamerpic uses the public icon fallback');
  check(powerReads === 0 && statusTimers.size === 0 && !document.querySelector('.nexus-mode-status'), 'ordinary desktop mounts no power polling or fullscreen status');
  document.documentElement.dataset.xboxMode = 'true'; document.querySelector('.app-shell')!.classList.add('fullscreen'); await pause();
  check(powerReads === 0 && !document.querySelector('.nexus-mode-status'), 'renderer mode attributes and CSS classes do not prove fullscreen');
  focus('[data-fixture-menu-trigger]'); await native('options');
  check(Boolean(document.querySelector('[role="menu"]')) && document.activeElement?.getAttribute('data-reference-menu-item') === 'handheld', 'native X opens the actual menu and focuses its first enabled action');
  check(!document.querySelector('[data-reference-menu-item="hidden"]'), 'hidden menu action is absent');
  await native('down'); check(document.activeElement?.getAttribute('data-reference-menu-item') === 'select', 'D-pad moves between enabled menu items');
  await native('accept'); check(selections === 1 && !document.querySelector('[role="menu"]'), 'native A invokes one menu action and dismisses its owner');
  check(document.activeElement?.hasAttribute('data-fixture-menu-trigger'), 'menu selection restores its exact trigger');
  await native('options'); await native('back');
  check(!document.querySelector('[role="menu"]') && outerBacks === 0, 'native B dismisses only the active menu');
  await native('options'); await native('accept');
  check(Boolean(document.querySelector('.handheld-compatibility-dialog')) && !document.querySelector('[role="menu"]'), 'menu action closes the menu before opening the actual information dialog');
  check(document.querySelector<HTMLElement>('.app-shell')?.inert === true && document.activeElement?.hasAttribute('data-handheld-dismiss'), 'information dialog makes the launcher inert and focuses its safe dismiss action');
  check(document.querySelector('.handheld-compatibility-dialog')?.textContent?.includes('Linux / Proton compatibility has not been verified.'), 'handheld information clearly separates the Windows rating from Linux compatibility');
  await native('back'); check(!document.querySelector('.handheld-compatibility-dialog') && outerBacks === 0, 'controller B dismisses nested information without falling through to the page');
  check(document.querySelector<HTMLElement>('.app-shell')?.inert === false && document.activeElement?.hasAttribute('data-fixture-menu-trigger'), 'information dialog restores launcher interactivity and focus');
  focus('.profile-actions button:last-child'); const refreshButton = document.activeElement as HTMLButtonElement; await native('accept'); refreshButton.click(); await pause();
  check(profileRefreshes === 1 && Boolean(completeRefresh) && refreshButton.disabled, 'controller starts one profile refresh and the pending control rejects repeated activation');
  completeRefresh!(); await pause(); check(!document.querySelector('.profile-actions button:last-child:disabled'), 'profile refresh completion restores its control');
  focus('.profile-actions button:first-child'); await native('accept'); check(settings === 1, 'profile settings button invokes only its supplied route callback');
  focus('.profile-actions button:nth-child(2)'); await native('accept'); check(friends === 1, 'profile friends button invokes only its supplied route callback');
  fullscreenChanged!(true); await pause();
  check(Boolean(document.querySelector('.nexus-mode-status time')) && powerReads === 1 && statusTimers.size === 1, 'observed native fullscreen mounts the real clock and one bounded power poll');
  check(document.querySelector('.nexus-mode-battery')?.getAttribute('aria-label') === 'Battery 42%', 'power indicator uses the supplied native battery percentage');
  await capture('nexus-fullscreen-status');
  initialFullscreen!(false); await pause(); check(Boolean(document.querySelector('.nexus-mode-status')), 'new fullscreen event wins over an older asynchronous initial read');
  hidden = true; document.dispatchEvent(new Event('visibilitychange')); await pause(); check(powerReads === 1, 'hidden fullscreen UI does not poll power');
  hidden = false; power = { percentage: null, charging: null, externalPower: null }; document.dispatchEvent(new Event('visibilitychange')); await pause();
  check(!document.querySelector('.nexus-mode-battery') && Boolean(document.querySelector('.nexus-mode-status time')), 'unknown battery data renders no fabricated battery or AC icon');
  delayPower = true; document.dispatchEvent(new Event('visibilitychange')); await pause();
  fullscreenChanged!(false); await pause(); check(!document.querySelector('.nexus-mode-status') && statusTimers.size === 0, 'leaving observed fullscreen removes status and its polling timer');
  completePower!(); await pause(); check(!document.querySelector('.nexus-mode-status'), 'late battery completion cannot reopen fullscreen UI');
  delayPower = false; await capture('nexus-optional-profile');
  return { checks, passed: checks.length, profileRefreshes, selections, outerBacks, powerReads, realNativeIpc: false, physicalControllerVerified: false, realSystemActions: false };
};
