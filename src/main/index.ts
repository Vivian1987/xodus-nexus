import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { constants, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { AppSnapshot, AuthStatus, DownloadTask, Game, GameLaunchOptions, GameOperation, InstallRequest, LauncherUpdate, Settings } from '../shared/types.js';
import { downloadFailure, isNewerVersion, progressBytesFromLine, progressFromLine, safeProductId } from '../shared/utils.js';
import { demoDownloads, demoGames, demoLaunchOptions, demoLocales, demoSnapshot } from '../shared/demo-data.js';
import { BackendManager, LINUX_RUN_PATCH } from './backend.js';
import { run, spawnTracked } from './process.js';
import { inspectGameDirectory, StateStore } from './store.js';
import { RuntimeManager } from './runtime.js';
import { prepareProtonRunner, syncPrefixUserLocale, syncUnrealCultureGameIni } from './proton.js';
import { CatalogService } from './catalog.js';
import { cloudSaveRuntime, selectedWinePath, startXodusService, unbridgedCloudSaveRuntime, type XodusServiceSession } from './xodus-service.js';
import { GameLogReducer, gameLoggingEnvironment, gameWindowEnvironment } from './game-log.js';
import { downloadVerifiedVcRedist, installedVcRuntimeVersion, VC_REDIST_VERSION, versionAtLeast } from './vc-runtime.js';
import { validateGameTrashTarget } from './game-removal.js';
import { spawnGameProcess, type GameProcess } from './game-process.js';
import { gameLocaleEnvironment, manifestLocales, manifestTitleId, supportedGameLocale } from './game-locale.js';
import { antiCheatEnvironment } from './anti-cheat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;
let store: StateStore;
let backend: BackendManager;
let runtime: RuntimeManager;
const operations = new Map<string, ChildProcessWithoutNullStreams>();
const gameProcesses = new Map<string, GameProcess>();
const cancelledDownloads = new Set<string>();
const serviceSessions = new Map<string, XodusServiceSession>();
const preparationControllers = new Map<string, AbortController>();
let gameOperation: GameOperation | undefined;
let gameRemovalInProgress = false;
let shutdownStarted = false;
let authState: AppSnapshot['auth'] = {
  running: false,
  stored: null,
  note: 'Checking the Xodus system keychain for a stored Microsoft account…',
};
const catalog = new CatalogService();
const demoMode = process.env.XODUS_DEMO === '1';
const demoCoverUrls = new Map<string, string>();
const RELEASES_API = 'https://api.github.com/repos/domsvoboda/xodus-nexus/releases/latest';
const RELEASES_PAGE = 'https://github.com/domsvoboda/xodus-nexus/releases/latest';
let launcherUpdate: LauncherUpdate = { currentVersion: app.getVersion(), checking: false };
let snapshotTimer: ReturnType<typeof setTimeout> | undefined;

function snapshot(): AppSnapshot {
  if (demoMode) return demoSnapshot(demoCoverUrls);
  return {
    backend: backend.current,
    runtime: runtime.current,
    games: structuredClone(store.games),
    downloads: structuredClone(store.downloads),
    settings: structuredClone(store.settings),
    auth: structuredClone(authState),
    launcherUpdate: structuredClone(launcherUpdate),
    gameOperation: gameOperation ? structuredClone(gameOperation) : undefined,
  };
}

// Checks the public GitHub release list; the launcher never downloads or
// replaces itself, it only tells the user a newer AppImage exists.
async function checkLauncherUpdate(): Promise<void> {
  launcherUpdate = { ...launcherUpdate, checking: true };
  emitSnapshot();
  try {
    const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) });
    const release = response.ok ? await response.json() as { tag_name?: unknown } : undefined;
    const tag = typeof release?.tag_name === 'string' && release.tag_name.trim() ? release.tag_name.trim() : undefined;
    const newer = tag ? isNewerVersion(tag, app.getVersion()) : false;
    launcherUpdate = {
      currentVersion: app.getVersion(),
      latestVersion: newer && tag ? tag : undefined,
      releaseUrl: newer ? RELEASES_PAGE : undefined,
      checking: false,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    launcherUpdate = { ...launcherUpdate, checking: false, checkedAt: new Date().toISOString() };
  }
}

function emitSnapshot(): void {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = undefined;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('snapshot', snapshot());
}

function scheduleSnapshot(): void {
  if (!snapshotTimer) snapshotTimer = setTimeout(emitSnapshot, 250);
}

function emitLog(scope: string, line: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation-log', { scope, line });
}

function requireBackend(command: keyof typeof backend.current.capabilities): string {
  const status = backend.current;
  if (!status.available || !status.binaryPath) throw new Error('The Xodus backend is unavailable.');
  if (typeof status.capabilities[command] === 'boolean' && !status.capabilities[command]) {
    throw new Error(`The active Xodus backend does not support the ${String(command)} command.`);
  }
  return status.binaryPath;
}

function ensureIdle(): void {
  if (gameRemovalInProgress) throw new Error('A game is being removed. Wait for it to finish.');
  if (operations.size > 0 || (gameOperation && ['preparing', 'running', 'stopping'].includes(gameOperation.status))) {
    throw new Error('Another Xodus operation is active. Wait for it to finish or stop it first.');
  }
  if (backend.current.updating) throw new Error('The backend is being built.');
  if (runtime.current.updating) throw new Error('Xodus Runtime is being installed.');
}

async function syncManagedWinePath(): Promise<void> {
  const selected = selectedWinePath(store.settings.winePath, store.settings.runtimeRoot, runtime.current.winePath);
  if (selected && selected !== store.settings.winePath) await store.setSettings({ winePath: selected });
}

async function refreshAccount(emit = true): Promise<AuthStatus> {
  const status = backend.current;
  if (!status.available || !status.binaryPath) {
    authState = { ...authState, stored: null, username: undefined, note: 'Account status is unavailable because the Xodus backend is offline.' };
  } else if (!status.capabilities.account) {
    authState = {
      ...authState,
      stored: null,
      username: undefined,
      note: status.source === 'external'
        ? 'This external Xodus build can sign in, but it cannot report the stored account. Build the managed backend to enable the read-only account status.'
        : 'This managed backend predates read-only account status. Rebuild it from Settings.',
    };
  } else {
    const result = await run(status.binaryPath, ['account', '--json'], { maxOutput: 20_000 });
    if (result.code !== 0) {
      authState = { ...authState, stored: null, username: undefined, note: 'Xodus could not read its system-keychain account record.' };
    } else {
      try {
        const line = result.output.split('\n').map((entry) => entry.trim()).reverse().find((entry) => entry.startsWith('{'));
        const account = JSON.parse(line ?? '') as { stored?: unknown; username?: unknown };
        if (account.stored === true && typeof account.username === 'string' && account.username.trim()) {
          authState = {
            ...authState,
            stored: true,
            username: account.username.trim(),
            note: runtime?.current.name?.includes('-xgamesave-pr28-')
              ? 'Credentials are stored by Xodus. The experimental PR #28 runtime can try in-game Xbox sign-in and two-way cloud save sync; this account status alone does not verify either.'
              : 'Credentials are stored by Xodus in the system keychain. This does not mean in-game Xbox platform sign-in is implemented.',
          };
        } else if (account.stored === false) {
          authState = { ...authState, stored: false, username: undefined, note: 'No Microsoft account is stored by Xodus.' };
        } else {
          throw new Error('unexpected account response');
        }
      } catch {
        authState = { ...authState, stored: null, username: undefined, note: 'Xodus returned an unreadable account-status response.' };
      }
    }
  }
  if (emit) emitSnapshot();
  return structuredClone(authState);
}

async function runAuth(command: 'login' | 'logout'): Promise<void> {
  ensureIdle();
  const binary = requireBackend(command);
  const id = `auth-${randomUUID()}`;
  authState = { ...authState, running: true, lastResult: undefined };
  emitSnapshot();
  const tracked = spawnTracked(binary, [command], { onLine: (line) => emitLog('auth', line) });
  operations.set(id, tracked.child);
  try {
    const result = await tracked.result;
    if (result.code === 0) await refreshAccount(false);
    authState = {
      ...authState,
      running: false,
      lastAction: command,
      lastResult: result.code === 0 ? 'success' : 'failed',
    };
    if (result.code !== 0) throw new Error(`xodus-cli ${command} exited with code ${result.code}.`);
  } finally {
    operations.delete(id);
    authState.running = false;
    emitSnapshot();
  }
}

async function startInstall(request: InstallRequest, updateGame?: Game): Promise<string> {
  ensureIdle();
  const binary = requireBackend('streaming');
  const productId = safeProductId(request.productId);
  const destination = path.resolve(request.destination.trim());
  if (!path.isAbsolute(destination)) throw new Error('The destination must be an absolute path.');
  if (updateGame) {
    const actual = await fs.realpath(destination);
    if (actual !== await fs.realpath(updateGame.path)) throw new Error('Update destination differs from the installed game.');
    if (await backend.externalDownloadRunning()) throw new Error('Another Xodus download is running. Wait before updating this game.');
    const processes = await run('ps', ['-eo', 'args='], { maxOutput: 2_000_000 });
    if (processes.code !== 0) throw new Error('Could not verify that the game is closed. Update was not started.');
    const executable = updateGame.executable ? path.basename(updateGame.executable).toLowerCase() : '';
    if (processes.output.split('\n').some((line) => {
      const command = line.toLowerCase();
      return (/xodus-cli\s+run\s/.test(command) || /(?:wine|proton)/.test(command) &&
        (command.includes(actual.toLowerCase()) || executable.length > 0 && command.includes(executable)));
    })) throw new Error('A game process is active. Close the game before updating files in place.');
  } else await fs.mkdir(destination, { recursive: true });
  const id = randomUUID();
  const task: DownloadTask = {
    id,
    kind: updateGame ? 'update' : 'install',
    gameId: updateGame?.id,
    title: request.title.trim() || productId,
    productId,
    destination,
    status: 'running',
    progress: null,
    phase: updateGame ? 'Checking installed files with Xodus…' : 'Starting Xodus streaming…',
    log: [],
    startedAt: new Date().toISOString(),
  };
  await store.addDownload(task);
  emitSnapshot();
  // Show the game's Store box art in the queue while it downloads.
  void catalog.posters([productId], currentMarket()).then(async (posters) => {
    const coverUrl = posters.get(productId);
    if (!coverUrl) return;
    await store.updateDownload(id, { coverUrl });
    emitSnapshot();
  }, () => { /* Covers are optional. */ });

  const args = ['streaming', productId, destination, '--parallel', String(store.settings.parallelDownloads)];
  if (store.settings.market) args.push('--market', store.settings.market);
  let largestTotal = 0;
  let lastLoggedPercent = -1;
  const tracked = spawnTracked(binary, args, {
    terminal: true,
    onLine: (line) => {
      const bytes = progressBytesFromLine(line);
      // indicatif emits one bar per file and a separate aggregate bar. Do not
      // let a small file's 100% overwrite the whole game's progress.
      if (bytes) {
        const aggregate = /^\s*(?:Initializing|Downloading(?: ntfs\.\.\.)?)\s+\d/i.test(line);
        if (aggregate || (largestTotal === 0 && bytes.total > 0)) {
          if (aggregate) largestTotal = Math.max(largestTotal, bytes.total);
          else if (bytes.total < largestTotal) return;
          largestTotal = bytes.total;
          task.downloadedBytes = bytes.current;
          task.totalBytes = bytes.total;
          task.progress = Math.min(100, (bytes.current / bytes.total) * 100);
          task.transferRate = line.match(/[\d.]+\s*(?:KiB|MiB|GiB|TiB|B)\/s/i)?.[0];
          task.phase = 'Downloading and extracting game files';
          const percent = Math.floor(task.progress);
          if (percent !== lastLoggedPercent) {
            task.log.push(`${percent}% · ${line.trim().slice(0, 180)}`);
            lastLoggedPercent = percent;
          }
        }
      } else {
        const progress = progressFromLine(line);
        if (progress !== null && largestTotal === 0) task.progress = progress;
        task.phase = line.length > 160 ? `${line.slice(0, 157)}…` : line;
        task.log.push(line);
      }
      task.log = task.log.slice(-300);
      scheduleSnapshot();
    },
    maxOutput: 8_000_000,
  });
  operations.set(id, tracked.child);
  void tracked.result.then(async (result) => {
    operations.delete(id);
    const cancelled = cancelledDownloads.delete(id);
    task.exitCode = result.code;
    task.finishedAt = new Date().toISOString();
    task.status = cancelled || result.code === 130 ? 'cancelled' : result.code === 0 ? 'complete' : 'failed';
    task.progress = task.status === 'complete' ? 100 : task.progress;
    task.phase = task.status === 'complete' ? updateGame ? 'Update complete' : 'Installation complete' : task.status === 'cancelled' ? 'Cancelled by user' : `Xodus exited with code ${result.code}`;
    if (task.status === 'failed') task.error = downloadFailure(task.log, result.code);
    await store.updateDownload(id, task);
    if (task.status === 'complete') {
      try {
        const inspected = await inspectGameDirectory(destination);
        if (updateGame) await store.patchGame(updateGame.id, { installState: inspected.installState, installMessage: inspected.installMessage, antiCheat: inspected.antiCheat, vcRedistEncrypted: inspected.vcRedistEncrypted, coverDataUrl: inspected.coverDataUrl, storeId: inspected.storeId ?? updateGame.storeId });
        else await store.upsertGame(inspected);
      } catch { /* Some packages do not expose metadata yet. */ }
    }
    emitSnapshot();
  }).catch(async (error) => {
    operations.delete(id);
    const cancelled = cancelledDownloads.delete(id);
    task.status = cancelled ? 'cancelled' : 'failed';
    task.error = cancelled ? undefined : (error as Error).message;
    task.phase = cancelled ? 'Cancelled by user' : 'The process could not be started';
    task.finishedAt = new Date().toISOString();
    await store.updateDownload(id, task);
    emitSnapshot();
  });
  return id;
}

async function importGame(input?: string): Promise<Game | null> {
  let directory = input;
  if (!directory) {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'], defaultPath: store.settings.installRoot });
    if (result.canceled) return null;
    directory = result.filePaths[0];
  }
  const game = await inspectGameDirectory(path.resolve(directory));
  if (!game.coverDataUrl && game.storeId) {
    const posters = await catalog.posters([game.storeId], currentMarket());
    game.coverUrl = posters.get(game.storeId);
  }
  await store.upsertGame(game);
  emitSnapshot();
  return game;
}

async function gameLaunchOptions(id: string): Promise<GameLaunchOptions> {
  const game = store.games.find((entry) => entry.id === id);
  if (!game) throw new Error('Game not found.');
  const wine = selectedWinePath(store.settings.winePath, store.settings.runtimeRoot, runtime.current.winePath);
  if (!wine) return { cloudSaves: false, cloudReason: 'Select Xodus Runtime in Settings.', vcInstall: false, vcReason: 'Select Xodus Runtime in Settings.' };
  const wineAvailable = await fs.access(wine, constants.X_OK).then(() => true, () => false);
  if (!wineAvailable) return { cloudSaves: false, cloudReason: 'The selected Wine binary is unavailable.', vcInstall: false, vcReason: 'The selected Wine binary is unavailable.' };
  const protonRoot = path.resolve(path.dirname(wine), '..', '..');
  const protonAvailable = await Promise.all([
    fs.access(path.join(protonRoot, 'proton'), constants.X_OK).then(() => true, () => false),
    fs.access(path.join(protonRoot, 'files', 'share', 'default_pfx'), constants.R_OK).then(() => true, () => false),
  ]).then((values) => values.every(Boolean));
  const previewRuntime = await cloudSaveRuntime(wine);
  const servicePath = backend.current.binaryPath ? path.join(path.dirname(backend.current.binaryPath), 'xodus-service') : '';
  const serviceAvailable = Boolean(servicePath) && await fs.access(servicePath, constants.X_OK).then(() => true, () => false);
  return {
    cloudSaves: previewRuntime && serviceAvailable,
    cloudReason: !previewRuntime ? 'The selected Wine runtime does not include the cloud-save preview.' : !serviceAvailable ? 'This Xodus backend has no xodus-service.' : undefined,
    vcInstall: protonAvailable,
    vcReason: protonAvailable ? undefined : 'VC++ installation requires a full Xodus Proton distribution.',
  };
}

async function gameLocales(game: Game): Promise<string[]> {
  const xml = await fs.readFile(path.join(game.path, 'MicrosoftGame.config'), 'utf8').catch(() => '');
  return manifestLocales(xml);
}

async function gameTitleId(game: Game): Promise<string | undefined> {
  const xml = await fs.readFile(path.join(game.path, 'MicrosoftGame.config'), 'utf8').catch(() => '');
  return manifestTitleId(xml);
}

async function launchGame(id: string): Promise<void> {
  ensureIdle();
  const game = store.games.find((entry) => entry.id === id);
  if (!game) throw new Error('Game not found.');
  const inspected = await inspectGameDirectory(game.path);
  await store.patchGame(id, {
    installState: inspected.installState,
    installMessage: inspected.installMessage,
    launchSupport: inspected.launchSupport,
    launchBlockReason: inspected.launchBlockReason,
    antiCheat: inspected.antiCheat,
    vcRedistEncrypted: inspected.vcRedistEncrypted,
    coverDataUrl: inspected.coverDataUrl,
    storeId: inspected.storeId ?? game.storeId,
  });
  emitSnapshot();
  const binary = requireBackend('run');
  if (inspected.installState !== 'ready') throw new Error(inspected.installMessage ?? 'The installation is not ready for Xodus run.');
  const locale = supportedGameLocale(game.locale ?? '', await gameLocales(game));
  const titleId = await gameTitleId(game);
  const wine = selectedWinePath(store.settings.winePath, store.settings.runtimeRoot, runtime.current.winePath);
  const offlineLaunch = inspected.launchSupport === 'offline-only-eac';
  if (!wine) throw new Error('Select a Wine/Xodus Proton binary in Settings.');
  try { await fs.access(wine, constants.X_OK); }
  catch { throw new Error(`The selected Wine runtime is unavailable: ${wine}. Select or reinstall Xodus Runtime in Settings.`); }
  const cloudRuntime = await cloudSaveRuntime(wine);
  if (await unbridgedCloudSaveRuntime(wine)) {
    throw new Error('The active runtime has cloud saves without the required service bridge. Update the active runtime in Settings.');
  }
  const args = ['run', game.path, wine];
  const executable = offlineLaunch ? inspected.antiCheat?.executable : game.executable;
  if (offlineLaunch && !executable) throw new Error('No target game executable for offline launch was found in EasyAntiCheat/Settings.json.');
  if (executable) args.push('--exe', executable);
  if (offlineLaunch) {
    if (backend.current.linuxRunPatch !== LINUX_RUN_PATCH) {
      throw new Error('Offline launch requires the current managed Linux-run backend. Rebuild the backend in Settings.');
    }
    args.push('--materialize-exe');
  }
  if (inspected.vcRedistEncrypted) {
    if (backend.current.linuxRunPatch !== LINUX_RUN_PATCH) {
      throw new Error('This encrypted launch chain requires the current managed Xodus backend. Update the backend in Settings.');
    }
    args.push('--materialize-chain');
  }
  if (store.settings.market) args.push('--market', store.settings.market);
  const operationId = `game-${id}`;
  const dataRoot = path.dirname(store.settings.runtimeRoot);
  const logDirectory = path.join(dataRoot, 'logs');
  const logPath = path.join(logDirectory, `${id}-latest.log`);
  await fs.mkdir(logDirectory, { recursive: true });
  const launchLog = createWriteStream(logPath, { flags: 'w', encoding: 'utf8' });
  launchLog.on('error', (error) => console.error(`Unable to write launch log ${logPath}:`, error));
  const writeLaunchLog = (line: string) => launchLog.write(`[${new Date().toISOString()}] ${line}\n`);
  gameOperation = {
    id: operationId,
    gameId: id,
    title: game.title,
    kind: 'launch',
    status: 'preparing',
    phase: 'Preparing Proton and Xodus…',
    log: [],
    logPath,
    startedAt: new Date().toISOString(),
  };
  const appendGameLog = (line: string) => {
    writeLaunchLog(line);
    if (!gameOperation || gameOperation.id !== operationId) return;
    gameOperation.log.push(line);
    if (gameOperation.log.length > 250) gameOperation.log.splice(0, gameOperation.log.length - 250);
    gameOperation.phase = line.length > 180 ? `${line.slice(0, 177)}…` : line;
    scheduleSnapshot();
  };
  const verboseLogs = process.env.XODUS_NEXUS_VERBOSE_LOGS === '1' || store.settings.verboseLogs;
  const gameLog = new GameLogReducer(appendGameLog, verboseLogs);
  const addGameLog = (line: string) => gameLog.push(line);
  writeLaunchLog(`Game: ${game.title}`);
  writeLaunchLog(`Mode: ${offlineLaunch ? 'EAC-free' : 'standard'}; cloud saves: ${cloudRuntime ? 'enabled' : 'not available in active runtime'}; verbose logs: ${verboseLogs ? 'on' : 'off'}`);
  writeLaunchLog(`Backend: ${binary}`);
  writeLaunchLog(`Wine: ${wine}`);
  emitSnapshot();
  let serviceSession: XodusServiceSession | undefined;
  try {
    if (offlineLaunch) {
      addGameLog(`Offline launch without anti-cheat: ${executable}`);
      addGameLog('The EOS Anti-Cheat Null Client is active for this launch only.');
      addGameLog('Xodus will create a temporary mirrored view using the original executable name; the game installation remains unchanged.');
    }
    const legacyPrefixRoot = path.join(dataRoot, 'prefixes', game.id);
    const compatibilityDataPath = path.join(dataRoot, 'compatdata', game.id);
    const steamRoot = path.join(app.getPath('home'), '.steam', 'root');
    const protonRunner = await prepareProtonRunner(wine, compatibilityDataPath, steamRoot);
    const wineCommand = protonRunner?.command ?? wine;
    args[2] = wineCommand;
    if (inspected.vcRedistEncrypted) {
      if (!protonRunner) throw new Error('This encrypted VC++ prerequisite requires a Proton prefix. Select Xodus Runtime in Settings.');
      const installed = await installedVcRuntimeVersion(path.join(compatibilityDataPath, 'pfx'));
      if (!installed || !versionAtLeast(installed, VC_REDIST_VERSION)) {
        throw new Error(`VC++ runtime ${installed ?? 'not found'} is too old for this encrypted installer. Use Install VC++ in Library, then press Play.`);
      }
      addGameLog(`VC++ runtime ${installed} verified; launching the original package executable from a temporary decrypted launch view.`);
    }
    const environment = antiCheatEnvironment(gameLocaleEnvironment(gameWindowEnvironment(gameLoggingEnvironment(protonRunner
      ? { ...process.env }
      : { ...process.env, WINEPREFIX: legacyPrefixRoot, WINEARCH: 'win64' }, verboseLogs)), locale), offlineLaunch);
    if (locale) {
      addGameLog(`Selected package language: ${locale}.`);
      await syncPrefixUserLocale(wineCommand, protonRunner ? path.join(compatibilityDataPath, 'pfx') : legacyPrefixRoot, locale, environment, addGameLog);
    }
    await syncUnrealCultureGameIni(protonRunner ? path.join(compatibilityDataPath, 'pfx') : legacyPrefixRoot, game.path, titleId, locale, addGameLog);
    if (cloudRuntime) {
      serviceSession = await startXodusService(binary, app.getPath('userData'), addGameLog);
      serviceSessions.set(operationId, serviceSession);
      environment.XODUS_SOCKET = serviceSession.socketPath;
      environment.XODUS_BRIDGE_PORT = String(serviceSession.bridgePort);
      environment.XODUS_BRIDGE_KEY = serviceSession.bridgeKey;
      environment.XODUS_SAVE_SYNC = 'auto';
      addGameLog('Xbox cloud save preview is enabled. Saves may download from and upload to the account cloud.');
    }
    if (protonRunner) addGameLog(`Proton prefix: ${protonRunner.compatibilityDataPath}/pfx`);
    else await fs.mkdir(legacyPrefixRoot, { recursive: true });
    const tracked = await spawnGameProcess(binary, args, {
      cwd: game.path,
      env: environment,
      onLine: addGameLog,
      maxOutput: 8_000_000,
    });
    operations.set(operationId, tracked.child);
    gameProcesses.set(operationId, tracked);
    gameOperation.status = 'running';
    gameOperation.phase = 'Xodus is running; waiting for the game window…';
    emitSnapshot();
    void tracked.result.then((result) => {
      addGameLog(`The Xodus process exited with code ${result.code}.`);
      if (!gameOperation || gameOperation.id !== operationId) return;
      gameOperation.finishedAt = new Date().toISOString();
      if (result.code === 0) {
        gameOperation.status = 'complete';
        gameOperation.phase = 'The game has exited.';
      } else {
        const detail = result.output.split('\n').map((line) => line.trim()).filter(Boolean).slice(-6).join(' | ');
        gameOperation.status = 'failed';
        gameOperation.error = `Xodus run exited with code ${result.code}${detail ? `: ${detail.slice(0, 900)}` : '.'}`;
        gameOperation.phase = gameOperation.error;
      }
    }).catch((error) => {
      addGameLog(`Process error: ${(error as Error).message}`);
      if (!gameOperation || gameOperation.id !== operationId) return;
      gameOperation.status = 'failed';
      gameOperation.error = (error as Error).message;
      gameOperation.phase = gameOperation.error;
      gameOperation.finishedAt = new Date().toISOString();
    }).finally(async () => {
      operations.delete(operationId);
      gameProcesses.delete(operationId);
      if (serviceSession) {
        await serviceSession.stop().catch((error) => addGameLog(`Account service cleanup failed: ${(error as Error).message}`));
        serviceSessions.delete(operationId);
      }
      gameLog.flush();
      launchLog.end();
      await tracked.cleanup().catch((error) => console.error('Game service cleanup failed:', error));
      emitSnapshot();
    });
  } catch (error) {
    if (serviceSession) {
      await serviceSession.stop().catch(() => undefined);
      serviceSessions.delete(operationId);
    }
    writeLaunchLog(`Preparation error: ${(error as Error).message}`);
    gameLog.flush();
    launchLog.end();
    if (gameOperation?.id === operationId) gameOperation = undefined;
    emitSnapshot();
    throw error;
  }
}

async function installGameVcRuntime(id: string): Promise<void> {
  ensureIdle();
  const game = store.games.find((entry) => entry.id === id);
  if (!game) throw new Error('Game not found.');
  const inspected = await inspectGameDirectory(game.path);
  if (inspected.installState !== 'ready') throw new Error(inspected.installMessage ?? 'The game installation is not ready.');
  const wine = selectedWinePath(store.settings.winePath, store.settings.runtimeRoot, runtime.current.winePath);
  if (!wine) throw new Error('Select Xodus Runtime in Settings first.');
  await fs.access(wine, constants.X_OK);

  const operationId = `vc-${id}`;
  const dataRoot = path.dirname(store.settings.runtimeRoot);
  const logDirectory = path.join(dataRoot, 'logs');
  await fs.mkdir(logDirectory, { recursive: true });
  const logPath = path.join(logDirectory, `${id}-vc-runtime.log`);
  const log = createWriteStream(logPath, { flags: 'w', encoding: 'utf8' });
  log.on('error', (error) => console.error(`Unable to write VC++ log ${logPath}:`, error));
  gameOperation = {
    id: operationId,
    gameId: id,
    title: game.title,
    kind: 'prerequisite',
    status: 'preparing',
    phase: 'Preparing the Proton prefix…',
    log: [],
    logPath,
    startedAt: new Date().toISOString(),
  };
  const addLine = (line: string) => {
    log.write(`[${new Date().toISOString()}] ${line}\n`);
    if (gameOperation?.id !== operationId) return;
    gameOperation.log.push(line);
    if (gameOperation.log.length > 250) gameOperation.log.splice(0, gameOperation.log.length - 250);
    gameOperation.phase = line.length > 180 ? `${line.slice(0, 177)}…` : line;
    scheduleSnapshot();
  };
  emitSnapshot();
  const controller = new AbortController();
  preparationControllers.set(operationId, controller);
  try {
    const compatibilityDataPath = path.join(dataRoot, 'compatdata', game.id);
    const protonRunner = await prepareProtonRunner(wine, compatibilityDataPath, path.join(app.getPath('home'), '.steam', 'root'));
    if (!protonRunner) throw new Error('VC++ installation requires Xodus Proton, not a standalone Wine binary.');
    const prefix = path.join(compatibilityDataPath, 'pfx');
    const previous = await installedVcRuntimeVersion(prefix);
    if (previous && versionAtLeast(previous, VC_REDIST_VERSION)) {
      addLine(`VC++ ${previous} is already installed. No changes needed.`);
    } else {
      addLine(`Current VC++ runtime: ${previous ?? 'not found'}. Downloading Microsoft VC++ ${VC_REDIST_VERSION}.`);
      let lastProgress = -1;
      const installer = await downloadVerifiedVcRedist(path.join(dataRoot, 'prerequisites'), (downloaded, total) => {
        const percent = total ? Math.floor(downloaded * 100 / total) : -1;
        if (percent === lastProgress || (percent >= 0 && percent < lastProgress + 5 && percent !== 100)) return;
        lastProgress = percent;
        if (gameOperation?.id === operationId) {
          gameOperation.phase = total ? `Downloading Microsoft VC++: ${percent}%` : `Downloading Microsoft VC++: ${(downloaded / 1024 / 1024).toFixed(1)} MiB`;
          scheduleSnapshot();
        }
      }, controller.signal);
      if (controller.signal.aborted) throw new Error('VC++ installation was cancelled.');
      preparationControllers.delete(operationId);
      addLine('Microsoft installer SHA-256 verified. Installing into this game’s Proton prefix…');
      const tracked = spawnTracked(protonRunner.command, [installer, '/install', '/quiet', '/norestart'], {
        env: gameLoggingEnvironment({ ...process.env }),
        onLine: addLine,
        maxOutput: 1_000_000,
      });
      operations.set(operationId, tracked.child);
      if (gameOperation?.id === operationId) gameOperation.status = 'running';
      emitSnapshot();
      const result = await tracked.result;
      operations.delete(operationId);
      const installed = await installedVcRuntimeVersion(prefix);
      if (!installed || !versionAtLeast(installed, VC_REDIST_VERSION)) {
        throw new Error(`Microsoft VC++ installer exited with code ${result.code}, but required version ${VC_REDIST_VERSION} was not registered (found ${installed ?? 'none'}).`);
      }
      addLine(`Microsoft VC++ ${installed} installed in this game’s Proton prefix.`);
    }
    if (gameOperation?.id === operationId) {
      gameOperation.status = 'complete';
      gameOperation.phase = 'VC++ is ready. Press Play.';
      gameOperation.finishedAt = new Date().toISOString();
    }
  } catch (error) {
    if (gameOperation?.id === operationId) {
      gameOperation.status = 'failed';
      gameOperation.error = (error as Error).message;
      gameOperation.phase = gameOperation.error;
      gameOperation.finishedAt = new Date().toISOString();
    }
    throw error;
  } finally {
    preparationControllers.delete(operationId);
    operations.delete(operationId);
    log.end();
    emitSnapshot();
  }
}

function currentMarket(): string {
  const configured = store.settings.market;
  return configured.toLowerCase() === 'neutral' ? app.getLocaleCountryCode() || 'US' : configured;
}

// Library covers for games whose installation ships no local artwork:
// the same public display catalog that enriches Store results provides the
// published poster by the game's real Store Product ID.
async function enrichLibraryCovers(): Promise<void> {
  const missing = store.games.filter((game) => game.storeId && !game.coverDataUrl && !game.coverUrl);
  if (missing.length === 0) return;
  const posters = await catalog.posters(missing.map((game) => game.storeId!), currentMarket());
  for (const game of missing) {
    const coverUrl = posters.get(game.storeId!);
    if (coverUrl) await store.patchGame(game.id, { coverUrl });
  }
}

async function loadDemoCovers(): Promise<void> {
  const ids = [...new Set([
    ...demoGames.flatMap((game) => (game.storeId ? [game.storeId] : [])),
    ...demoDownloads.flatMap((task) => (task.productId ? [task.productId] : [])),
  ])];
  for (const [id, url] of await catalog.posters(ids, demoSnapshot().settings.market)) demoCoverUrls.set(id, url);
}

// XODUS_DEMO=1 serves sample state without touching the real backend,
// runtime, account or installed games. Store pages deliberately keep using
// the live Microsoft Store catalog so demo screenshots show real data.
function registerDemoIpc(catalogMarket: () => string): void {
  ipcMain.handle('get-snapshot', () => snapshot());
  ipcMain.handle('backend-refresh', () => snapshot().backend);
  ipcMain.handle('backend-check-update', () => snapshot().backend);
  ipcMain.handle('backend-update', () => {});
  ipcMain.handle('runtime-refresh', () => snapshot().runtime);
  ipcMain.handle('runtime-check-update', () => snapshot().runtime);
  ipcMain.handle('runtime-check-nexus', () => snapshot().runtime);
  ipcMain.handle('runtime-install', () => {});
  ipcMain.handle('runtime-install-nexus', () => {});
  ipcMain.handle('runtime-rollback-preview', () => {});
  ipcMain.handle('account-refresh', () => snapshot().auth);
  ipcMain.handle('check-launcher-update', () => snapshot().launcherUpdate);
  ipcMain.handle('login', () => {});
  ipcMain.handle('logout', () => {});
  ipcMain.handle('catalog-search', (_event, query: string, cursor?: string) => catalog.search(query, catalogMarket(), cursor));
  ipcMain.handle('catalog-featured', () => catalog.featured(catalogMarket()));
  ipcMain.handle('start-install', () => 'demo-download');
  ipcMain.handle('update-installed-game', (_event, id: string) => id);
  ipcMain.handle('cancel-download', () => {});
  ipcMain.handle('remove-download', () => {});
  ipcMain.handle('clear-finished-downloads', () => {});
  ipcMain.handle('import-game', () => null);
  ipcMain.handle('game-locales', () => demoLocales);
  ipcMain.handle('update-game', (_event, id: string, patch: Partial<Game>) => {
    const game = demoGames.find((entry) => entry.id === id) ?? demoGames[0];
    return { ...game, ...patch };
  });
  ipcMain.handle('remove-game', () => {});
  ipcMain.handle('game-launch-options', () => demoLaunchOptions);
  ipcMain.handle('launch-game', () => {});
  ipcMain.handle('install-game-vc-runtime', () => {});
  ipcMain.handle('cancel-game', () => {});
  ipcMain.handle('update-settings', (_event, patch: Partial<Settings>) => ({ ...demoSnapshot().settings, ...patch }));
  ipcMain.handle('choose-directory', () => null);
  ipcMain.handle('choose-file', () => null);
  ipcMain.handle('open-path', () => {});
}

function registerIpc(): void {
  const catalogMarket = currentMarket;
  if (demoMode) {
    registerDemoIpc(catalogMarket);
    return;
  }
  ipcMain.handle('get-snapshot', () => snapshot());
  ipcMain.handle('backend-refresh', async () => { const value = await backend.refresh(); await refreshAccount(false); emitSnapshot(); return value; });
  ipcMain.handle('backend-check-update', async () => { const value = await backend.checkUpdate(); emitSnapshot(); return value; });
  ipcMain.handle('backend-update', async () => { await backend.update(emitSnapshot); await refreshAccount(); });
  ipcMain.handle('runtime-refresh', async () => { const value = await runtime.refresh(); await syncManagedWinePath(); await refreshAccount(false); emitSnapshot(); return value; });
  ipcMain.handle('runtime-check-update', async () => { const value = await runtime.check(); emitSnapshot(); return value; });
  ipcMain.handle('runtime-check-nexus', async () => { const value = await runtime.checkNexus(); emitSnapshot(); return value; });
  ipcMain.handle('runtime-install', async () => {
    ensureIdle();
    const winePath = await runtime.install(emitSnapshot);
    await store.setSettings({ winePath });
    await refreshAccount(false);
    emitSnapshot();
  });
  ipcMain.handle('runtime-install-nexus', async () => {
    ensureIdle();
    const winePath = await runtime.installNexus(emitSnapshot);
    await store.setSettings({ winePath });
    await refreshAccount(false);
    emitSnapshot();
  });
  ipcMain.handle('runtime-rollback-preview', async () => {
    ensureIdle();
    const winePath = await runtime.rollbackCloudSavePreview(emitSnapshot);
    await store.setSettings({ winePath });
    await refreshAccount(false);
    emitSnapshot();
  });
  ipcMain.handle('account-refresh', () => refreshAccount());
  ipcMain.handle('check-launcher-update', async () => { await checkLauncherUpdate(); emitSnapshot(); return snapshot().launcherUpdate; });
  ipcMain.handle('login', () => runAuth('login'));
  ipcMain.handle('logout', () => runAuth('logout'));
  ipcMain.handle('catalog-search', (_event, query: string, cursor?: string) => {
    return catalog.search(query, catalogMarket(), cursor);
  });
  ipcMain.handle('catalog-featured', () => catalog.featured(catalogMarket()));
  ipcMain.handle('start-install', (_event, request: InstallRequest) => startInstall(request));
  ipcMain.handle('update-installed-game', async (_event, id: string) => {
    const game = store.games.find((entry) => entry.id === id);
    if (!game) throw new Error('Game not found.');
    if (!game.storeId || game.installState !== 'ready') throw new Error('This game has no verified Store ID or complete installation to update.');
    return startInstall({ productId: game.storeId, title: game.title, destination: game.path }, game);
  });
  ipcMain.handle('cancel-download', async (_event, id: string) => {
    const child = operations.get(id);
    if (!child) throw new Error('The download is no longer running.');
    cancelledDownloads.add(id);
    child.kill('SIGINT');
  });
  ipcMain.handle('remove-download', async (_event, id: string) => { await store.removeDownload(id); emitSnapshot(); });
  ipcMain.handle('clear-finished-downloads', async () => { await store.clearFinishedDownloads(); emitSnapshot(); });
  ipcMain.handle('import-game', (_event, input?: string) => importGame(input));
  ipcMain.handle('game-locales', async (_event, id: string) => {
    const game = store.games.find((entry) => entry.id === id);
    if (!game) throw new Error('Game not found.');
    return gameLocales(game);
  });
  ipcMain.handle('update-game', async (_event, id: string, patch: Partial<Game>) => {
    const allowed: Partial<Game> = {};
    for (const key of ['title', 'executable', 'launchArgs'] as const) if (typeof patch[key] === 'string') allowed[key] = patch[key];
    if (typeof patch.locale === 'string') {
      const game = store.games.find((entry) => entry.id === id);
      if (!game) throw new Error('Game not found.');
      allowed.locale = supportedGameLocale(patch.locale, await gameLocales(game)) ?? '';
    }
    const game = await store.patchGame(id, allowed);
    emitSnapshot();
    return game;
  });
  ipcMain.handle('remove-game', async (_event, id: string, mode: 'library' | 'trash-files') => {
    if (mode !== 'library' && mode !== 'trash-files') throw new Error('Invalid removal option.');
    ensureIdle();
    if (store.downloads.some((task) => task.status === 'queued' || task.status === 'running')) {
      throw new Error('Wait for active installations before removing a game.');
    }
    const game = store.games.find((entry) => entry.id === id);
    if (!game) throw new Error('Game not found.');
    gameRemovalInProgress = true;
    try {
      if (mode === 'trash-files') {
        const protectedPaths = [os.homedir(), app.getPath('userData'), store.settings.installRoot, store.settings.runtimeRoot, store.settings.externalXodusRoot, __dirname].filter(Boolean);
        const target = await validateGameTrashTarget(game, store.games.filter((entry) => entry.id !== id), protectedPaths);
        await shell.trashItem(target);
      }
      await store.removeGame(id);
      emitSnapshot();
    } finally {
      gameRemovalInProgress = false;
    }
  });
  ipcMain.handle('game-launch-options', (_event, id: string) => gameLaunchOptions(id));
  ipcMain.handle('launch-game', (_event, id: string) => launchGame(id));
  ipcMain.handle('install-game-vc-runtime', (_event, id: string) => installGameVcRuntime(id));
  ipcMain.handle('cancel-game', async () => {
    if (!gameOperation || !['preparing', 'running', 'stopping'].includes(gameOperation.status)) throw new Error('No game launch is currently active.');
    const child = operations.get(gameOperation.id);
    const gameProcess = gameProcesses.get(gameOperation.id);
    const controller = preparationControllers.get(gameOperation.id);
    if (!child && !controller) throw new Error('Xodus is still preparing; try stopping again in a moment.');
    if (child && gameOperation.kind === 'prerequisite') throw new Error('VC++ installation is running. Wait for it to finish; interrupting it could damage the Proton prefix.');
    gameOperation.status = 'stopping';
    gameOperation.phase = child ? 'Stopping Xodus and Wine…' : 'Cancelling prerequisite download…';
    controller?.abort();
    if (child && gameProcess) {
      const operationId = gameOperation.id;
      try { await gameProcess.stop(); }
      catch (error) { gameOperation.status = 'running'; emitSnapshot(); throw error; }
      const forceTimer = setTimeout(() => {
        if (gameProcesses.get(operationId) === gameProcess) void gameProcess.forceStop().catch((error) => console.error('Could not force-stop game:', error));
      }, 8_000);
      forceTimer.unref();
    } else if (child) {
      child.kill('SIGINT');
    }
    emitSnapshot();
  });
  ipcMain.handle('update-settings', async (_event, patch: Partial<Settings>) => {
    const allowed: Partial<Settings> = {};
    if (typeof patch.installRoot === 'string') allowed.installRoot = path.resolve(patch.installRoot);
    if (typeof patch.market === 'string' && /^[A-Za-z-]{2,20}$/.test(patch.market)) allowed.market = patch.market;
    if (typeof patch.parallelDownloads === 'number') allowed.parallelDownloads = Math.max(1, Math.min(16, Math.round(patch.parallelDownloads)));
    if (typeof patch.winePath === 'string') allowed.winePath = patch.winePath;
    if (typeof patch.externalXodusRoot === 'string') allowed.externalXodusRoot = path.resolve(patch.externalXodusRoot);
    if (typeof patch.runtimeRoot === 'string') allowed.runtimeRoot = path.resolve(patch.runtimeRoot);
    if (typeof patch.verboseLogs === 'boolean') allowed.verboseLogs = patch.verboseLogs;
    if (typeof patch.firstRunCompleted === 'boolean') allowed.firstRunCompleted = patch.firstRunCompleted;
    const settings = await store.setSettings(allowed);
    backend.setExternalRoot(settings.externalXodusRoot);
    runtime.setRoot(settings.runtimeRoot);
    await backend.refresh();
    await refreshAccount(false);
    await runtime.refresh();
    emitSnapshot();
    return settings;
  });
  ipcMain.handle('choose-directory', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory', 'createDirectory'], defaultPath });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('choose-file', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], defaultPath });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('open-path', async (_event, target: string) => {
    await fs.access(target);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  });
}

async function createWindow(): Promise<void> {
  const smokeScreenshot = process.env.XODUS_NEXUS_SMOKE_SCREENSHOT;
  const smokeStoreQuery = process.env.XODUS_NEXUS_SMOKE_STORE_QUERY;
  const smokeStore = process.env.XODUS_NEXUS_SMOKE_STORE === '1' || Boolean(smokeStoreQuery);
  const demoCaptureDir = process.env.XODUS_DEMO_CAPTURE_DIR;
  if (demoCaptureDir && !demoMode) throw new Error('Demo capture requires XODUS_DEMO=1; real account data must not be captured.');
  const hiddenCapture = Boolean(smokeScreenshot || demoCaptureDir);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 680,
    backgroundColor: '#080a0c',
    title: 'Xodus Nexus',
    icon: fileURLToPath(new URL('../../assets/icon.png', import.meta.url)),
    autoHideMenuBar: true,
    show: !hiddenCapture,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: hiddenCapture,
    },
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description) => console.error('Renderer load failed', code, description));
  mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('Renderer process exited', details.reason));
  if (smokeScreenshot) mainWindow.webContents.on('console-message', (_event, level, message) => console.error(`Renderer console [${level}]`, message));
  if (!hiddenCapture) mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}${smokeStore ? '#store' : ''}`);
  else await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), smokeStore ? { hash: 'store' } : undefined);
  if (demoCaptureDir) {
    // Demo screenshot capture: with XODUS_DEMO=1 and XODUS_DEMO_TOUR=1 the
    // renderer cycles pages every 7s; grab one shot per page just before
    // each switch, offscreen, without real account data. Store artwork/catalog
    // are fetched live; the library and queue are explicitly sample fixtures.
    await fs.mkdir(demoCaptureDir, { recursive: true });
    const pages = ['home', 'library', 'store', 'downloads', 'settings'];
    for (let index = 0; index < pages.length; index++) {
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 6000 : 7000));
      const image = await mainWindow.webContents.capturePage();
      await fs.writeFile(path.join(demoCaptureDir, `demo-${pages[index]}.png`), image.toPNG());
    }
    app.quit();
    return;
  }
  if (smokeScreenshot) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (smokeStoreQuery) {
      await mainWindow.webContents.executeJavaScript(`(() => {
        const input = document.querySelector('.topbar .search-box input');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(smokeStoreQuery)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })), 50);
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else if (smokeStore) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    const renderedText = await mainWindow.webContents.executeJavaScript('document.body.innerText.slice(0, 500)');
    console.error('Smoke renderer text:', renderedText.replace(/\n/g, ' | '));
    const image = await mainWindow.webContents.capturePage();
    await fs.writeFile(smokeScreenshot, image.toPNG());
    app.quit();
  }
}

app.whenReady().then(async () => {
  store = new StateStore(app.getPath('userData'));
  await store.load();
  if (demoMode) {
    // Demo mode: no backend build, no runtime, no account access. Library
    // covers are fetched from the live Store; Store pages are live too.
    // Start the cover fetch before createWindow because a demo capture
    // keeps createWindow busy until the tour finishes.
    registerIpc();
    void loadDemoCovers().then(() => emitSnapshot(), () => { /* Covers are optional. */ });
    await createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
    return;
  }
  for (const game of [...store.games]) {
    try {
      const inspected = await inspectGameDirectory(game.path);
      await store.patchGame(game.id, {
        installState: inspected.installState,
        installMessage: inspected.installMessage,
        launchSupport: inspected.launchSupport,
        launchBlockReason: inspected.launchBlockReason,
        antiCheat: inspected.antiCheat,
        vcRedistEncrypted: inspected.vcRedistEncrypted,
        coverDataUrl: inspected.coverDataUrl,
        storeId: inspected.storeId ?? game.storeId,
      });
    } catch { /* Keep an unavailable imported entry visible. */ }
  }
  runtime = new RuntimeManager(store.settings.runtimeRoot, emitLog, () => operations.size > 0 || backend?.current.updating === true);
  backend = new BackendManager(app.getPath('userData'), store.settings.externalXodusRoot, emitLog, () => operations.size > 0 || runtime?.current.updating === true);
  await backend.refresh();
  await runtime.refresh();
  void runtime.checkNexus().then(() => emitSnapshot(), () => { /* Nexus runtime is optional. */ });
  await syncManagedWinePath();
  await refreshAccount(false);
  void enrichLibraryCovers().then(() => emitSnapshot(), () => { /* Covers are optional. */ });
  void checkLauncherUpdate().then(() => emitSnapshot());
  registerIpc();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
}).catch((error) => { console.error(error); app.quit(); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (shutdownStarted || (operations.size === 0 && serviceSessions.size === 0)) return;
  event.preventDefault();
  shutdownStarted = true;
  void (async () => {
    for (const [id, child] of operations) if (!gameProcesses.has(id)) child.kill('SIGINT');
    const runningGames = [...gameProcesses.values()];
    await Promise.all(runningGames.map((process) => process.stop().catch((error) => console.error('Could not stop game on exit:', error))));
    await Promise.race([
      Promise.all(runningGames.map((process) => process.result.catch(() => undefined))),
      new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
    ]);
    await Promise.all([...gameProcesses.values()].map((process) => process.forceStop().catch((error) => console.error('Could not force-stop game on exit:', error))));
    await Promise.all([...serviceSessions.values()].map((session) => session.stop().catch((error) => console.error('Account service cleanup failed on exit:', error))));
  })().catch((error) => console.error('Launcher shutdown cleanup failed:', error)).finally(() => app.quit());
});
