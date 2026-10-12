import { contextBridge, ipcRenderer } from 'electron';
import type { Game, InstallRequest, LauncherApi, Settings } from '../shared/types.js';

// Demo fixtures live in the main process (src/shared/demo-data.ts) and are
// served over these same IPC channels when XODUS_DEMO=1, so the sandboxed
// preload stays a thin passthrough. Store pages always use the live
// Microsoft Store catalog. No real credentials, tokens or account data.
const api: LauncherApi = {
  getSnapshot: () => ipcRenderer.invoke('get-snapshot'),
  refreshBackend: () => ipcRenderer.invoke('backend-refresh'),
  checkBackendUpdate: () => ipcRenderer.invoke('backend-check-update'),
  updateBackend: () => ipcRenderer.invoke('backend-update'),
  rebuildBackend: () => ipcRenderer.invoke('backend-rebuild'),
  refreshRuntime: () => ipcRenderer.invoke('runtime-refresh'),
  checkRuntimeUpdate: () => ipcRenderer.invoke('runtime-check-update'),
  checkNexusRuntime: () => ipcRenderer.invoke('runtime-check-nexus'),
  installRuntime: () => ipcRenderer.invoke('runtime-install'),
  installNexusRuntime: () => ipcRenderer.invoke('runtime-install-nexus'),
  rollbackRuntimePreview: () => ipcRenderer.invoke('runtime-rollback-preview'),
  refreshAccount: () => ipcRenderer.invoke('account-refresh'),
  checkLauncherUpdate: () => ipcRenderer.invoke('check-launcher-update'),
  login: () => ipcRenderer.invoke('login'),
  logout: () => ipcRenderer.invoke('logout'),
  searchCatalog: (query: string, cursor?: string) => ipcRenderer.invoke('catalog-search', query, cursor),
  getFeaturedCatalog: () => ipcRenderer.invoke('catalog-featured'),
  startInstall: (request: InstallRequest) => ipcRenderer.invoke('start-install', request),
  updateInstalledGame: (id: string) => ipcRenderer.invoke('update-installed-game', id),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  removeDownload: (id: string) => ipcRenderer.invoke('remove-download', id),
  clearFinishedDownloads: () => ipcRenderer.invoke('clear-finished-downloads'),
  importGame: (path?: string) => ipcRenderer.invoke('import-game', path),
  updateGame: (id: string, patch: Partial<Pick<Game, 'title' | 'executable' | 'launchArgs' | 'locale'>>) => ipcRenderer.invoke('update-game', id, patch),
  getGameLocales: (id: string) => ipcRenderer.invoke('game-locales', id),
  removeGame: (id: string, mode: 'library' | 'trash-files') => ipcRenderer.invoke('remove-game', id, mode),
  getGameLaunchOptions: (id: string) => ipcRenderer.invoke('game-launch-options', id),
  launchGame: (id: string) => ipcRenderer.invoke('launch-game', id),
  installGameVcRuntime: (id: string) => ipcRenderer.invoke('install-game-vc-runtime', id),
  cancelGame: () => ipcRenderer.invoke('cancel-game'),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('update-settings', patch),
  chooseDirectory: (defaultPath?: string) => ipcRenderer.invoke('choose-directory', defaultPath),
  chooseFile: (defaultPath?: string) => ipcRenderer.invoke('choose-file', defaultPath),
  openPath: (target: string) => ipcRenderer.invoke('open-path', target),
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on('snapshot', listener);
    return () => ipcRenderer.removeListener('snapshot', listener);
  },
  onOperationLog: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on('operation-log', listener);
    return () => ipcRenderer.removeListener('operation-log', listener);
  },
  isDemoTour: () => process.env.XODUS_DEMO_TOUR === '1',
};

contextBridge.exposeInMainWorld('launcher', api);
