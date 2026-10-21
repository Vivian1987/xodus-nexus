import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopFeaturesSettings } from './DesktopFeaturesSettings';
import { NexusAudioSettings } from './NexusAudioSettings';
import type { DesktopSettingsStatus } from '../shared/types';

afterEach(() => vi.unstubAllGlobals());
const status: DesktopSettingsStatus = { canSetAutostart: true, fullscreenExperience: false, fullscreenExperienceSource: 'none' };
const callbacks = () => ({ onChange: vi.fn(), onOpenGameBar: vi.fn(), onEnterXboxMode: vi.fn() });
it('defaults startup and tray options off without triggering desktop changes or entry actions', () => {
  const actions = callbacks(), html = renderToStaticMarkup(<DesktopFeaturesSettings settings={{}} status={status} {...actions} />);
  expect(html.match(/type="checkbox"/g)).toHaveLength(3); expect(html).not.toContain('checked=""');
  expect(html).toContain('Open Game Bar'); expect(html).toContain('Enter Xbox mode');
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  expect(html).not.toMatch(/Connected|service is running|controller connected/);
});
it('shows saved preferences and availability reasons without claiming a visible tray or active service', () => {
  const html = renderToStaticMarkup(<DesktopFeaturesSettings settings={{ launchOnLogin: true, launchInBackground: true, minimizeToTray: true }}
    status={{ ...status, canSetAutostart: false, autostartReason: 'Managed by this session.', trayAvailable: false, gameBarServiceEnabled: true }} {...callbacks()} />);
  expect(html.match(/checked=""/g)).toHaveLength(3); expect(html).toContain('Managed by this session.'); expect(html).toContain('Closing the window will quit Nexus.');
  expect(html).toContain('does not verify that it is running');
});
it('reports the observed controller listener separately from a detected gaming desktop', () => {
  const html = renderToStaticMarkup(<DesktopFeaturesSettings settings={{}} status={{ ...status, fullscreenExperience: true, gameBarController: { status: 'listening', devices: 2 } }} {...callbacks()} />);
  expect(html).toContain('Gaming desktop session detected.'); expect(html).toContain('2 eligible device(s).');
  expect(html).not.toContain('Connected');
});
it('localizes optional desktop controls and local voice settings', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'el' });
  const html = renderToStaticMarkup(<DesktopFeaturesSettings settings={{}} status={status} {...callbacks()} />);
  expect(html).toContain('Λειτουργίες επιφάνειας εργασίας'); expect(html).toContain('Είσοδος σε λειτουργία Xbox');
  expect(renderToStaticMarkup(<NexusAudioSettings />)).toContain('Η φωνητική συνομιλία ομάδας Xbox δεν είναι διαθέσιμη.');
});
it('mounts only local microphone controls and requests no microphone access during render', () => {
  const request = vi.fn(); vi.stubGlobal('window', { launcher: { requestVoiceCapture: request } });
  const html = renderToStaticMarkup(<NexusAudioSettings />);
  expect(request).not.toHaveBeenCalled(); expect(html).toContain('Local microphone test'); expect(html).toContain('Start test');
  expect(html).toContain('Xbox party voice chat is not available.'); expect(html).not.toContain('original-settings');
});
