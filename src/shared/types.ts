export type Page = 'home' | 'store' | 'library' | 'downloads' | 'settings';

export interface BackendCapabilities {
  commands: string[];
  account: boolean;
  login: boolean;
  logout: boolean;
  download: boolean;
  streaming: boolean;
  run: boolean;
  version?: string;
}

export interface AuthStatus {
  running: boolean;
  stored: boolean | null;
  username?: string;
  lastResult?: 'success' | 'failed';
  lastAction?: 'login' | 'logout';
  note: string;
}

export interface BackendStatus {
  available: boolean;
  source: 'external' | 'managed' | 'none';
  binaryPath?: string;
  commit?: string;
  upstreamCommit?: string;
  updateAvailable: boolean;
  checking: boolean;
  updating: boolean;
  externalRoot: string;
  capabilities: BackendCapabilities;
  prerequisites: { git: boolean; cargo: boolean; rustc: boolean; protoc: boolean };
  blockReason?: string;
  linuxRunPatch?: string;
}

export interface RuntimeStatus {
  installed: boolean;
  checking: boolean;
  updating: boolean;
  runtimeRoot: string;
  name?: string;
  winePath?: string;
  commit?: string;
  upstreamCommit?: string;
  artifactName?: string;
  artifactExpiresAt?: string;
  artifactAvailable: boolean;
  prerequisites: { gh: boolean; authenticated: boolean; tar: boolean; sha512sum: boolean };
  phase?: string;
  error?: string;
}

export interface Game {
  id: string;
  title: string;
  path: string;
  storeId?: string;
  publisher?: string;
  executable?: string;
  winePath?: string; // Legacy saved field; ignored for launch. The runtime is global.
  launchArgs?: string;
  locale?: string;
  coverDataUrl?: string;
  installState: 'ready' | 'incomplete' | 'imported';
  installMessage?: string;
  launchSupport?: 'unknown' | 'offline-only-eac';
  launchBlockReason?: string;
  vcRedistEncrypted?: boolean;
  antiCheat?: {
    provider: 'Easy Anti-Cheat';
    executable?: string;
    encryptedTarget: boolean;
  };
  addedAt: string;
}

export interface GameLaunchOptions {
  cloudSaves: boolean;
  cloudReason?: string;
  vcInstall: boolean;
  vcReason?: string;
}

export interface DownloadTask {
  id: string;
  kind?: 'install' | 'update';
  gameId?: string;
  title: string;
  productId: string;
  destination: string;
  status: 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';
  progress: number | null;
  downloadedBytes?: number;
  totalBytes?: number;
  transferRate?: string;
  phase: string;
  log: string[];
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  error?: string;
}

export interface GameOperation {
  id: string;
  gameId: string;
  title: string;
  kind?: 'launch' | 'prerequisite';
  status: 'preparing' | 'running' | 'stopping' | 'complete' | 'failed';
  phase: string;
  log: string[];
  logPath?: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface Settings {
  installRoot: string;
  market: string;
  parallelDownloads: number;
  winePath: string;
  externalXodusRoot: string;
  runtimeRoot: string;
  verboseLogs: boolean;
}

export interface AppSnapshot {
  backend: BackendStatus;
  runtime: RuntimeStatus;
  games: Game[];
  downloads: DownloadTask[];
  settings: Settings;
  auth: AuthStatus;
  gameOperation?: GameOperation;
}

export interface InstallRequest {
  productId: string;
  title: string;
  destination: string;
}

export interface CatalogProduct {
  productId: string;
  installProductId?: string;
  title: string;
  description: string;
  publisher?: string;
  posterUrl?: string;
  heroUrl?: string;
  storeUrl?: string;
  categories: string[];
  purchasePrice?: string;
  includedWith?: string;
  releaseDate?: string;
  averageRating?: number;
  installability: 'supported' | 'unsupported' | 'unknown';
  packageFormat?: string;
  supportNote: string;
}

export interface CatalogSearchResult {
  query: string;
  market: string;
  products: CatalogProduct[];
  cursor?: string;
  hasMore: boolean;
  fetchedAt: string;
  source: 'Microsoft Store';
}

export interface LauncherApi {
  getSnapshot(): Promise<AppSnapshot>;
  refreshBackend(): Promise<BackendStatus>;
  checkBackendUpdate(): Promise<BackendStatus>;
  updateBackend(): Promise<void>;
  refreshRuntime(): Promise<RuntimeStatus>;
  checkRuntimeUpdate(): Promise<RuntimeStatus>;
  installRuntime(): Promise<void>;
  rollbackRuntimePreview(): Promise<void>;
  refreshAccount(): Promise<AuthStatus>;
  login(): Promise<void>;
  logout(): Promise<void>;
  searchCatalog(query: string, cursor?: string): Promise<CatalogSearchResult>;
  getFeaturedCatalog(): Promise<CatalogSearchResult>;
  startInstall(request: InstallRequest): Promise<string>;
  updateInstalledGame(id: string): Promise<string>;
  cancelDownload(id: string): Promise<void>;
  removeDownload(id: string): Promise<void>;
  clearFinishedDownloads(): Promise<void>;
  importGame(path?: string): Promise<Game | null>;
  updateGame(id: string, patch: Partial<Pick<Game, 'title' | 'executable' | 'launchArgs' | 'locale'>>): Promise<Game>;
  getGameLocales(id: string): Promise<string[]>;
  removeGame(id: string, mode: 'library' | 'trash-files'): Promise<void>;
  getGameLaunchOptions(id: string): Promise<GameLaunchOptions>;
  launchGame(id: string): Promise<void>;
  installGameVcRuntime(id: string): Promise<void>;
  cancelGame(): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  chooseDirectory(defaultPath?: string): Promise<string | null>;
  chooseFile(defaultPath?: string): Promise<string | null>;
  openPath(path: string): Promise<void>;
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
  onOperationLog(callback: (entry: { scope: string; line: string }) => void): () => void;
}
