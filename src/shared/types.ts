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
  version?: string;
  delivery?: 'release' | 'local';
  releaseAvailable?: boolean;
  releaseVersion?: string;
  phase?: string;
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
  // Prebuilt runtime with the Nexus xgameruntime patches, published on the
  // Xodus Nexus GitHub releases. Preferred over the official snapshot.
  nexusAvailable?: boolean;
  nexusName?: string;
  nexusVersion?: string;
  nexusChecking?: boolean;
  nexusError?: string;
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
  coverUrl?: string; // Store artwork from the Microsoft display catalog, used when the installation ships no local logo.
  installState: 'ready' | 'incomplete' | 'imported';
  installMessage?: string;
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
  coverUrl?: string; // Store box art for the queued product, for the queue list.
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
  firstRunCompleted?: boolean;
}

export interface LauncherUpdate {
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  checking: boolean;
  checkedAt?: string;
}

export interface AppSnapshot {
  backend: BackendStatus;
  runtime: RuntimeStatus;
  games: Game[];
  downloads: DownloadTask[];
  settings: Settings;
  auth: AuthStatus;
  launcherUpdate?: LauncherUpdate;
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
  rebuildBackend(): Promise<void>;
  refreshRuntime(): Promise<RuntimeStatus>;
  checkRuntimeUpdate(): Promise<RuntimeStatus>;
  checkNexusRuntime(): Promise<RuntimeStatus>;
  installRuntime(): Promise<void>;
  installNexusRuntime(): Promise<void>;
  rollbackRuntimePreview(): Promise<void>;
  refreshAccount(): Promise<AuthStatus>;
  checkLauncherUpdate(): Promise<LauncherUpdate | undefined>;
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
  isDemoTour(): boolean;
}
