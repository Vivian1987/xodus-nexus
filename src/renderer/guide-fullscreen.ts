export interface NativeFullscreenBridge {
  getWindowFullscreen?(): Promise<boolean>;
  onWindowFullscreenChanged?(callback: (fullscreen: boolean) => void): () => void;
  setWindowFullscreen?(fullscreen: boolean): Promise<boolean>;
  getFullscreenExperience?(): Promise<{ available: boolean }>;
}
export type FullscreenDocument = Pick<Document, 'fullscreenElement' | 'addEventListener' | 'removeEventListener'> & {
  fullscreenEnabled?: boolean;
  documentElement: { requestFullscreen?: () => Promise<void> };
};
export interface WindowFullscreenState { documentFullscreen: boolean; nativeFullscreen: boolean }

export function shellIsFullscreen(sessionFullscreen: boolean, state: WindowFullscreenState): boolean {
  return sessionFullscreen || state.documentFullscreen || state.nativeFullscreen;
}

/** A native event supersedes an older asynchronous initial read. No click or
 * renderer attribute is treated as proof that fullscreen was entered. */
export function observeWindowFullscreen(document: FullscreenDocument, bridge: NativeFullscreenBridge | undefined, changed: (state: WindowFullscreenState) => void) {
  let active = true, revision = 0, nativeFullscreen = false;
  const emit = () => { if (active) changed({ documentFullscreen: Boolean(document.fullscreenElement), nativeFullscreen }); };
  const setNative = (value: boolean) => { if (active) { revision++; nativeFullscreen = value === true; emit(); } };
  const documentChanged = () => emit();
  document.addEventListener('fullscreenchange', documentChanged);
  const unsubscribe = bridge?.onWindowFullscreenChanged?.(setNative);
  const readRevision = revision;
  if (bridge?.getWindowFullscreen) void bridge.getWindowFullscreen().then(value => {
    if (active && revision === readRevision) { nativeFullscreen = value === true; emit(); }
  }).catch(() => { /* DOM and session state remain usable without a native read. */ });
  emit();
  return { revision: () => revision, setNative, stop() { active = false; document.removeEventListener('fullscreenchange', documentChanged); unsubscribe?.(); } };
}

export async function enterWindowFullscreen(document: FullscreenDocument, bridge?: NativeFullscreenBridge): Promise<'native' | 'document'> {
  if (bridge?.setWindowFullscreen) {
    if (await bridge.setWindowFullscreen(true) !== true) throw new Error('The fullscreen window could not be opened.');
    return 'native';
  }
  if (document.fullscreenEnabled === false || !document.documentElement.requestFullscreen) throw new Error('Fullscreen is unavailable in this window.');
  await document.documentElement.requestFullscreen();
  return 'document';
}

export function formatShellClock(now: Date, language: 'en' | 'el'): string {
  return now.toLocaleTimeString(language === 'el' ? 'el-GR' : undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/π\.μ\./g, 'πμ').replace(/μ\.μ\./g, 'μμ').replace(/[\u00a0\u202f]/g, ' ');
}
