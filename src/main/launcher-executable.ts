import path from 'node:path';

/** Future launch entries must preserve Nexus's packaged font/preload wrapper.
 * Prefer a persistent APPIMAGE path separately when one is available. */
export function launcherExecutablePath(executable: string, packaged: boolean): string {
  return packaged && path.basename(executable) === 'xodus-nexus.bin'
    ? path.join(path.dirname(executable), 'xodus-nexus') : executable;
}
