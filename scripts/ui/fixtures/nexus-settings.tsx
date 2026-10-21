import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NexusLibraryProvidersSettings } from '/src/renderer/NexusLibraryProvidersSettings.tsx';
import { NexusPreferencesSettings, type NexusPreferencePatch } from '/src/renderer/NexusPreferencesSettings.tsx';
import type { LibraryProviderStatus } from '/src/shared/library-providers.ts';
import '/src/renderer/styles.css';

// Renderer state only. Scans, external links, import and persistence are synthetic.
localStorage.setItem('nexus.interface-language.v1', 'en');
const scans: { resolve(value: LibraryProviderStatus[]): void; reject(): void }[] = [];
const reader = () => new Promise<LibraryProviderStatus[]>((resolve, reject) => scans.push({ resolve, reject: () => reject(Error('Synthetic scan failure')) }));
const nextReader = () => reader();
const writes: { patch: NexusPreferencePatch; resolve(): void; reject(): void }[] = [];
const opened: string[] = [];
let imports = 0, finishImport: (() => void) | undefined;
function Harness() {
  const [preferences, setPreferences] = useState<NexusPreferencePatch>({}), [readerVersion, setReaderVersion] = useState(0);
  return <main className="app-shell" style={{ display: 'block', overflow: 'auto', padding: 28 }}><h1 style={{ marginTop: 0 }}>Nexus optional settings fixture</h1>
    <button data-replace-reader className="secondary" onClick={() => setReaderVersion(value => value + 1)}>Replace synthetic scan source</button>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 20, alignItems: 'start', marginTop: 16 }}>
      <NexusLibraryProvidersSettings getProviders={readerVersion ? nextReader : reader} onImportGame={async () => { imports++; await new Promise<void>(resolve => { finishImport = resolve; }); }} onOpenProviderSite={async url => { opened.push(url); }} />
      <NexusPreferencesSettings settings={preferences} onChange={patch => new Promise<void>((resolve, reject) => writes.push({ patch, resolve: () => { setPreferences(current => ({ ...current, ...patch })); resolve(); }, reject: () => reject(Error('Synthetic save failure')) }))} />
    </div>
  </main>;
}
const watermark = document.createElement('div'); watermark.textContent = 'ISOLATED FIXTURE · Synthetic scans / settings · No account or host changes';
Object.assign(watermark.style, { position: 'fixed', bottom: '12px', right: '12px', zIndex: '9999', font: '13px sans-serif', padding: '10px', background: '#132331', color: '#def', pointerEvents: 'none' }); document.body.append(watermark);
createRoot(document.getElementById('root')!).render(<Harness />);
const checks: string[] = [], pause = () => new Promise(resolve => setTimeout(resolve, 100));
const check = (condition: unknown, label: string) => { if (!condition) throw Error(label); checks.push(label); };
const scan = () => document.querySelector<HTMLButtonElement>('.nexus-library-providers .button-row button:first-child')!;
const preference = (index: number) => document.querySelectorAll<HTMLInputElement>('.nexus-preferences-settings input')[index];
const speed = () => document.querySelector<HTMLSelectElement>('.nexus-preferences-settings select')!;
(window as any).runNexusSettingsChecks = async () => {
  await pause(); await pause();
  check(scans.length === 1 && scan().disabled, 'mount starts one synthetic desktop-entry read and disables repeated scan activation');
  scan().click(); await pause(); check(scans.length === 1, 'pending scan rejects repeated activation');
  check(!preference(0).checked && !preference(1).checked && speed().value === 'bytes' && writes.length === 0, 'notifications and shortcuts start off with byte display and no persistence calls');
  scans[0].resolve([{ id: 'steam', installed: true }, { id: 'epic', installed: false }]); await pause();
  check(document.querySelector('[data-library-provider="steam"]')?.getAttribute('data-provider-registration') === 'found', 'explicit Steam registration renders desktop entry found');
  check(document.querySelector('[data-library-provider="epic"]')?.getAttribute('data-provider-registration') === 'absent', 'explicit negative scan renders no desktop entry found');
  check(document.querySelector('[data-library-provider="gog"]')?.getAttribute('data-provider-registration') === 'unknown', 'missing provider remains unknown rather than absent');
  check(document.querySelector('.nexus-library-providers')?.textContent?.includes('does not check sign-in, connect accounts, import game libraries'), 'capability explanation separates metadata from account or library access');
  scan().click(); await pause(); check(scans.length === 2 && document.querySelectorAll('[data-provider-registration="unknown"]').length === 6, 'refresh discards prior detection while the new scan is pending');
  document.querySelector<HTMLButtonElement>('[data-replace-reader]')!.click(); await pause(); check(scans.length === 3, 'a new scan source gets a fresh request');
  scans[1].resolve([{ id: 'steam', installed: false }]); await pause(); check(scan().disabled && document.querySelector('[data-library-provider="steam"]')?.getAttribute('data-provider-registration') === 'unknown', 'late response from an old scan source cannot replace the new pending scan');
  scans[2].resolve([{ id: 'steam', installed: true }]); await pause(); check(document.querySelector('[data-library-provider="steam"]')?.getAttribute('data-provider-registration') === 'found', 'current scan source supplies the displayed capability');
  scan().click(); await pause(); scans[3].reject(); await pause(); check(Boolean(document.querySelector('.nexus-library-providers [role="alert"]')) && document.querySelectorAll('[data-provider-registration="unknown"]').length === 6, 'failed scan displays retry and leaves all registrations unknown');
  scan().click(); await pause(); scans[4].resolve([{ id: 'steam', installed: false }]); await pause(); check(!document.querySelector('.nexus-library-providers [role="alert"]'), 'successful retry clears the scan failure');
  document.querySelector<HTMLButtonElement>('[data-library-provider="steam"] button')!.click(); await pause(); check(opened.length === 1 && opened[0] === 'https://store.steampowered.com/about/', 'provider Website invokes only the canonical supplied site action');
  const importButton = document.querySelector<HTMLButtonElement>('.nexus-library-providers .button-row button:last-child')!; importButton.click(); importButton.click(); await pause(); check(imports === 1 && importButton.disabled, 'manual game import runs only after an explicit serialized button action'); finishImport!(); await pause();
  preference(0).click(); preference(0).click(); await pause(); check(writes.length === 1 && writes[0].patch.downloadNotifications === true && preference(0).disabled, 'notification change submits one explicit boolean and serializes persistence');
  writes[0].resolve(); await pause(); check(preference(0).checked && !preference(0).disabled, 'notification control reflects authoritative saved state');
  speed().value = 'bits'; speed().dispatchEvent(new Event('change', { bubbles: true })); await pause(); check(writes[1].patch.downloadSpeedUnit === 'bits' && Object.keys(writes[1].patch).length === 1, 'rate display selection submits only the display unit');
  writes[1].reject(); await pause(); check(speed().value === 'bytes' && Boolean(document.querySelector('.nexus-preferences-settings [role="alert"]')), 'failed preference save retains authoritative values and an inline retry error');
  speed().value = 'bits'; speed().dispatchEvent(new Event('change', { bubbles: true })); await pause(); writes[2].resolve(); await pause(); check(speed().value === 'bits' && !document.querySelector('.nexus-preferences-settings [role="alert"]'), 'successful preference retry displays the normalized value');
  const language = document.querySelectorAll<HTMLSelectElement>('.nexus-preferences-settings select')[1]; language.value = 'el'; language.dispatchEvent(new Event('change', { bubbles: true })); await pause();
  check(document.documentElement.lang === 'el' && localStorage.getItem('nexus.interface-language.v1') === 'el' && writes.length === 3, 'optional-panel language changes locally without changing game locale or persisting unrelated settings');
  check(document.querySelector('.nexus-library-providers')?.textContent?.includes('Αυτόματη εισαγωγή βιβλιοθήκης: μη διαθέσιμη'), 'provider capability limits update with optional-panel language');
  if (typeof (window as any).__captureFixture === 'function') await (window as any).__captureFixture('nexus-provider-preferences');
  return { checks, passed: checks.length, scans: scans.length, writes: writes.length, realHostScan: false, realPersistence: false, realSystemActions: false };
};
