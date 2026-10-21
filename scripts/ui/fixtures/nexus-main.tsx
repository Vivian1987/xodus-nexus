import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '/src/renderer/App.tsx';
import UpstreamApp from '/src/renderer/App.tsx?upstream-fixture';
import { demoSnapshot } from '/src/shared/demo-data.ts';
import '/src/renderer/styles.css';

// Actual default App trees with synthetic launcher APIs and no host preload.
localStorage.setItem('nexus.interface-language.v1', 'en');
const pad = { index: 0, id: 'synthetic-nexus-main-controller', mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
const sample = demoSnapshot(); sample.games = sample.games.slice(0, 2); sample.downloads = [];
sample.auth = { stored: false, running: false, note: 'Isolated fixture only.' };
sample.desktopSettings = { canSetAutostart: true, fullscreenExperience: false, fullscreenExperienceSource: 'none', gameBarController: { status: 'stopped', devices: 0 } };
const forbidden: string[] = [], closed = { open: false, phase: 'closed', canGoBack: false };
const unsupported = async (name: string) => { forbidden.push(name); throw Error(`Unexpected privileged fixture action: ${name}`); };
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => [], getSupportedConstraints: () => ({}),
  addEventListener: () => {}, removeEventListener: () => {}, getUserMedia: () => unsupported('physical microphone capture') } });
(window as any).launcher = {
  getSnapshot: async () => structuredClone(sample), onSnapshot: () => () => {}, isDemoTour: () => false,
  getGameLaunchOptions: async () => ({ cloudSaves: false, vcInstall: false }),
  getWindowFullscreen: async () => false, onWindowFullscreenChanged: () => () => {}, onXboxModeEntryRequested: () => () => {},
  getCloudGamingState: async () => ({ ...closed }), onCloudGamingState: () => () => {}, setCloudGamingObscured: async () => {},
  getRemotePlayState: async () => ({ ...closed }), onRemotePlayState: () => () => {}, setRemotePlayObscured: async () => {},
  onOperationLog: () => () => {}, checkKeyring: async () => ({ state: 'unavailable', message: 'Synthetic fixture; host wallet is not accessed.' }), onKeyringStatus: () => () => {},
  getLibraryProviders: async () => [], getXboxModeRestartStatus: async () => ({ available: false, reason: 'Synthetic fixture; no host restart capability.' }),
  getBatteryStatus: () => unsupported('power read before fullscreen'), openCloudGaming: () => unsupported('open cloud'), openRemotePlay: () => unsupported('open remote'),
  setWindowFullscreen: () => unsupported('set fullscreen'), prepareXboxModeRestart: () => unsupported('prepare restart'), restartIntoXboxMode: () => unsupported('restart'),
  updateSettings: () => unsupported('settings write'), launchGame: () => unsupported('game launch'), login: () => unsupported('login'),
};
const root = createRoot(document.getElementById('root')!);
const watermark = document.createElement('div'); watermark.textContent = 'ISOLATED UI COMPARISON · Synthetic snapshot · No account or host actions';
Object.assign(watermark.style, { position: 'fixed', bottom: '12px', right: '12px', zIndex: '9999', font: '13px sans-serif', padding: '10px', background: '#132331', color: '#def', pointerEvents: 'none' }); document.body.append(watermark);
root.render(<UpstreamApp />);
const checks: string[] = [], pause = () => new Promise(resolve => setTimeout(resolve, 120));
const check = (condition: unknown, label: string) => { if (!condition) throw Error(label); checks.push(label); };
const measure = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector); if (!node) throw Error(`Missing ${selector}`);
  const box = node.getBoundingClientRect(), style = getComputedStyle(node);
  return { x: box.x, y: box.y, width: box.width, height: box.height, background: style.backgroundColor, font: style.fontFamily };
};
const capture = async (name: string) => { if (typeof (window as any).__captureFixture === 'function') await (window as any).__captureFixture(name); };
(window as any).runNexusMainChecks = async () => {
  for (let count = 0; count < 30 && !document.querySelector('.home-page'); count++) await pause();
  const selectors = ['.app-shell', '.sidebar', '.account-summary', '.content-shell', '.topbar', '.search-box', '.top-status', '.home-page', '.spotlight', '.poster-row', '.quick-grid'];
  const baseline = Object.fromEntries(selectors.map(selector => [selector, measure(selector)]));
  const originalText = document.querySelector('.home-page')!.textContent;
  const originalHeader = document.querySelector('.topbar')!.innerHTML;
  check(Boolean(document.querySelector('.sidebar .nav-item.active')?.textContent?.includes('Home')), 'upstream default renders Home with the original sidebar selection');
  await capture('nexus-upstream-home');
  root.render(<App />); await pause(); await pause();
  check(Boolean(document.querySelector('.home-page')) && document.querySelector('.sidebar .nav-item.active')?.textContent?.includes('Home'), 'ported App still defaults to the original Nexus Home route');
  for (const selector of selectors) check(JSON.stringify(measure(selector)) === JSON.stringify(baseline[selector]), `${selector} preserves upstream default geometry, background and font`);
  check(document.querySelector('.home-page')!.textContent === originalText, 'default Home content and controls match upstream');
  check(document.querySelector('.topbar')!.innerHTML === originalHeader, 'ordinary desktop header markup matches upstream exactly');
  check(!document.querySelector('.nexus-mode-status,.guide-overlay,.remote-play-host,.cloud-gaming-host,[aria-modal="true"]'), 'optional fullscreen, Guide and streaming surfaces are absent on the default desktop');
  check(forbidden.length === 0, 'default mount requests no account action, game launch, power read, stream, fullscreen, restart or preference write');
  check(document.querySelectorAll('.sidebar nav .nav-item').length === 4, 'additional destinations are grouped under one ordinary More item');
  await capture('nexus-current-home');
  const more = () => document.querySelector<HTMLButtonElement>('.sidebar nav .nav-item:last-child')!;
  more().click(); await pause();
  check(document.querySelectorAll('#nexus-features [role="menuitem"]').length === 5, 'actual App More menu exposes its five additional destinations');
  document.querySelector<HTMLElement>('#nexus-features')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await pause();
  check(Boolean(document.querySelector('.home-page')) && !document.querySelector('#nexus-features'), 'Escape dismisses actual App More menu without changing the underlying route');
  for (const [route, selector] of [['profile', '.profile-page'], ['friends', '.xbox-social-panel'], ['cloud', '.cloud-gaming-page'], ['gamepass', '.gamepass-page'], ['collections', '.collections-page']]) {
    more().click(); await pause(); document.querySelector<HTMLButtonElement>(`[data-reference-menu-item="${route}"]`)!.click(); await pause();
    check(Boolean(document.querySelector(selector)), `actual App More menu renders the ${route} route`);
    check(!document.querySelector('#nexus-features'), `${route} selection dismisses its owning menu`);
  }
  check(forbidden.length === 0, 'browsing optional routes performs no login, stream, launch, power, restart or settings mutation');
  document.querySelector<HTMLButtonElement>('.sidebar-bottom .nav-item')!.click(); await pause(); await pause();
  check(Boolean(document.querySelector('.settings-page .nexus-library-providers')) && Boolean(document.querySelector('.nexus-preferences-settings')), 'actual Settings embeds provider capabilities and preference cards');
  check(Boolean(document.querySelector('.settings-card .nexus-audio-settings')) && !document.querySelector('.original-settings'), 'local voice controls sit inside a Nexus settings card');
  check(!document.querySelector('.local-voice-test [role="status"]')?.textContent?.includes('active') && forbidden.length === 0, 'actual Settings does not start microphone capture or apply desktop preferences on mount');
  const entry = [...document.querySelectorAll<HTMLButtonElement>('.desktop-features-settings button')].find(button => button.textContent?.includes('Enter Xbox mode'));
  check(Boolean(entry), 'actual Settings exposes the explicit optional mode entry action');
  entry!.scrollIntoView({ block: 'center' }); entry!.focus(); entry!.click(); await pause(); await pause();
  check(Boolean(document.querySelector('.xbox-mode-entry-dialog')) && document.activeElement?.getAttribute('data-xbox-mode-action') === 'remain', 'actual Settings opens the mode dialog with Remain on desktop focused');
  check(document.querySelector<HTMLButtonElement>('[data-xbox-mode-action="restart"]')?.disabled && forbidden.length === 0, 'actual mode dialog respects unavailable restart and dispatches no native operation on open');
  pad.buttons[1] = { pressed: true, value: 1 }; await pause(); pad.buttons[1] = { pressed: false, value: 0 }; await pause();
  check(!document.querySelector('.xbox-mode-entry-dialog') && Boolean(document.querySelector('.settings-page')), 'synthetic controller B uses the baseline App dispatcher to dismiss only the new modal');
  check(document.querySelector<HTMLElement>('.app-shell')?.inert === false && forbidden.length === 0, 'actual App modal cleanup restores launcher input without privileged work');
  check(document.activeElement === entry, 'actual App mode cancellation restores its exact Settings trigger');
  await capture('nexus-current-settings');
  return { checks, passed: checks.length, baseline, realNativeIpc: false, physicalControllerVerified: false, realXboxRequests: false, realSystemActions: false };
};
