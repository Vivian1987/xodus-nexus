import { expect, it } from 'vitest';
import { launcherExecutablePath } from './launcher-executable.js';

it('uses the actual Nexus packaged wrapper and preserves development or portable entry points', () => {
  expect(launcherExecutablePath('/install/Xodus Nexus/xodus-nexus.bin', true)).toBe('/install/Xodus Nexus/xodus-nexus');
  expect(launcherExecutablePath('/install/Xodus Nexus/xodus-nexus', true)).toBe('/install/Xodus Nexus/xodus-nexus');
  expect(launcherExecutablePath('/portable/Xodus-Nexus.AppImage', true)).toBe('/portable/Xodus-Nexus.AppImage');
  expect(launcherExecutablePath('/development/xodus-nexus.bin', false)).toBe('/development/xodus-nexus.bin');
  expect(launcherExecutablePath('/development/electron', false)).toBe('/development/electron');
  expect(launcherExecutablePath('/install/another-launcher.bin', true)).toBe('/install/another-launcher.bin');
});
