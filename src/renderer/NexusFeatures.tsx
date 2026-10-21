import { useEffect, useRef, useState } from 'react';
import { Cloud, CircleUserRound, Gamepad2, Heart, MoreHorizontal, Users } from 'lucide-react';
import type { AppSnapshot, Page } from '../shared/types';
import { ReferenceMenu, type ReferenceMenuAnchor } from './ReferenceMenu';
import { GuideButtonFallback } from './guide-button';
import { NexusModeEntryDialog } from './NexusModeEntryDialog';
import { enterWindowFullscreen } from './guide-fullscreen';
import { RemotePlayHost } from './RemotePlayHost';
import { CloudGamingHost } from './CloudGaming';
import { StreamModals } from './StreamModals';

export const nexusFeaturePages: Page[] = ['gamepass', 'cloud', 'friends', 'profile', 'collections'];
export const nexusPages: Page[] = ['home', 'library', 'store', 'downloads', 'settings', ...nexusFeaturePages];

export function requestNexusModeEntry() { window.dispatchEvent(new Event('nexus-mode-entry')); }
export async function openNexusGuide() {
  if (!window.desktopGuide?.toggle) throw new Error('Game Bar is unavailable in this session.');
  await window.desktopGuide.toggle();
}

/** Additional destinations use an ordinary Nexus menu; Home, Library, Store,
 * account settings and their original layouts remain the default navigation. */
export function NexusFeatureMenu({ page, go }: { page: Page; go: (page: Page) => void }) {
  const [anchor, setAnchor] = useState<ReferenceMenuAnchor>();
  return <><button className={`nav-item ${nexusFeaturePages.includes(page) ? 'active' : ''}`} aria-expanded={Boolean(anchor)} aria-haspopup="menu" onClick={event => setAnchor(anchor ? undefined : {element: event.currentTarget})}><MoreHorizontal /><span>More</span></button>
    {anchor ? <ReferenceMenu id="nexus-features" label="Nexus features" anchor={anchor} onDismiss={() => setAnchor(undefined)} items={[
      {id:'gamepass',label:'Game Pass',icon:<Gamepad2 />,onSelect:()=>go('gamepass')},
      {id:'cloud',label:'Cloud gaming',icon:<Cloud />,onSelect:()=>go('cloud')},
      {id:'friends',label:'Friends and chat',icon:<Users />,onSelect:()=>go('friends')},
      {id:'profile',label:'View profile',icon:<CircleUserRound />,onSelect:()=>go('profile')},
      {id:'collections',label:'Play later and history',icon:<Heart />,onSelect:()=>go('collections')},
    ]} /> : null}</>;
}

export function observeXboxModeEntryRequests(surface: { fullscreenElement: object | null; hasFocus(): boolean },
  bridge: Pick<import('../shared/types').LauncherApi, 'onXboxModeEntryRequested' | 'getWindowFullscreen'> & Partial<Pick<import('../shared/types').LauncherApi, 'onWindowFullscreenChanged'>>,
  allowed: () => boolean, open: () => void) {
  let active = true, revision = 0, nativeFullscreen = false;
  const eligible = () => active && allowed() && surface.hasFocus() && !surface.fullscreenElement && !nativeFullscreen;
  const request = () => {
    const current = ++revision;
    if (!eligible() || !bridge.getWindowFullscreen) return;
    void bridge.getWindowFullscreen().then(fullscreen => {
      if (current === revision && fullscreen === false && eligible()) open();
    }).catch(() => { /* An unknown native mode cannot authorize this handoff. */ });
  };
  const native = bridge.onWindowFullscreenChanged?.(fullscreen => {nativeFullscreen = fullscreen === true; revision++;});
  const unsubscribe = bridge.onXboxModeEntryRequested?.(request);
  const stop = () => { active = false; revision++; unsubscribe?.(); native?.(); };
  return Object.assign(stop, {request});
}

/** Integrates optional native surfaces without replacing the Nexus desktop UI.
 * Opening a service, stream or reboot always requires its explicit action. */
export function NexusFeatureRuntime({ data, go, openGame, reportError }: {
  data: AppSnapshot; go: (page: Page) => void; openGame: (id: string) => void; reportError: (error: unknown) => void;
}) {
  const latest = useRef({data,go,openGame,reportError}); latest.current = {data,go,openGame,reportError};
  const [modeEntry, setModeEntry] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const show = () => { pending.current = true; setModeEntry(true); };
    const allowed = () => !pending.current && !document.querySelector('[aria-modal="true"]');
    const stop = observeXboxModeEntryRequests(document, window.launcher, allowed, show);
    const request = stop.request;
    window.addEventListener('nexus-mode-entry', request);
    const navigate = window.desktopGuide?.onNavigate(({page,gameId}) => {
      if (gameId) latest.current.openGame(gameId);
      else if (nexusPages.includes(page as Page)) latest.current.go(page as Page);
    });
    return () => {stop(); navigate?.(); window.removeEventListener('nexus-mode-entry', request);};
  }, []);
  useEffect(() => {
    const open = () => { void openNexusGuide().catch(error => latest.current.reportError(error)); };
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'g' && !event.repeat) {event.preventDefault(); open();}
    };
    const input = new GuideButtonFallback();
    const timer = window.setInterval(() => {
      const pressed = Array.from(navigator.getGamepads?.() ?? []).some(pad => pad?.buttons[16]?.pressed);
      if (input.poll(pressed, document.hasFocus(), !document.hidden, latest.current.data.desktopSettings?.gameBarController)) open();
    }, 100);
    window.addEventListener('keydown', key);
    return () => {window.clearInterval(timer); window.removeEventListener('keydown', key);};
  }, []);
  return <><RemotePlayHost /><CloudGamingHost /><StreamModals />{modeEntry ? <NexusModeEntryDialog startNow={async () => {await enterWindowFullscreen(document, window.launcher);}} close={() => {pending.current = false; setModeEntry(false);}} /> : null}</>;
}
