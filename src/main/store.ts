import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DownloadTask, Game, Settings } from '../shared/types.js';

interface PersistedState {
  games: Game[];
  downloads: DownloadTask[];
  settings: Settings;
}

const defaultDataRoot = path.join(os.homedir(), '.local', 'share', 'xodus-nexus');
const defaultSettings: Settings = {
  installRoot: path.join(os.homedir(), 'Games', 'Xodus Nexus'),
  market: 'neutral',
  parallelDownloads: 4,
  winePath: '',
  externalXodusRoot: '',
  runtimeRoot: path.join(defaultDataRoot, 'runtimes'),
  verboseLogs: false,
};

export class StateStore {
  private state: PersistedState = { games: [], downloads: [], settings: defaultSettings };
  private readonly file: string;

  constructor(userData: string) {
    this.file = path.join(userData, 'launcher-state.json');
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<PersistedState>;
      this.state = {
        games: Array.isArray(parsed.games) ? parsed.games : [],
        downloads: Array.isArray(parsed.downloads) ? parsed.downloads.slice(-30) : [],
        settings: Object.fromEntries(Object.entries({ ...defaultSettings, ...parsed.settings }).filter(([key]) => key !== 'separateGameProcess')) as unknown as Settings,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('State could not be loaded', error);
    }
  }

  get games(): Game[] { return this.state.games; }
  get downloads(): DownloadTask[] { return this.state.downloads; }
  get settings(): Settings { return this.state.settings; }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }

  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    this.state.settings = { ...this.state.settings, ...patch };
    await this.save();
    return this.state.settings;
  }

  async upsertGame(game: Game): Promise<Game> {
    const index = this.state.games.findIndex((entry) => entry.id === game.id || entry.path === game.path);
    if (index >= 0) this.state.games[index] = { ...this.state.games[index], ...game };
    else this.state.games.unshift(game);
    await this.save();
    return game;
  }

  async patchGame(id: string, patch: Partial<Game>): Promise<Game> {
    const game = this.state.games.find((entry) => entry.id === id);
    if (!game) throw new Error('Game not found.');
    Object.assign(game, patch);
    await this.save();
    return game;
  }

  async removeGame(id: string): Promise<void> {
    this.state.games = this.state.games.filter((entry) => entry.id !== id);
    await this.save();
  }

  async addDownload(task: DownloadTask): Promise<void> {
    this.state.downloads.unshift(task);
    this.state.downloads = this.state.downloads.slice(0, 30);
    await this.save();
  }

  async updateDownload(id: string, patch: Partial<DownloadTask>): Promise<void> {
    const task = this.state.downloads.find((entry) => entry.id === id);
    if (task) Object.assign(task, patch);
    await this.save();
  }

  async removeDownload(id: string): Promise<void> {
    const task = this.state.downloads.find((entry) => entry.id === id);
    if (!task) throw new Error('Queue entry not found.');
    if (task.status === 'running' || task.status === 'queued') throw new Error('Stop the installation before removing it from the queue.');
    this.state.downloads = this.state.downloads.filter((entry) => entry.id !== id);
    await this.save();
  }

  async clearFinishedDownloads(): Promise<void> {
    this.state.downloads = this.state.downloads.filter((entry) => entry.status === 'running' || entry.status === 'queued');
    await this.save();
  }
}

function attr(xml: string, element: string, attribute: string): string | undefined {
  // Windows manifests are case-insensitive and may carry a namespace prefix
  // (for example uap:VisualElements in appxmanifest.xml).
  const tag = xml.match(new RegExp(`<(?:[\\w.]+:)?${element}\\b[^>]*>`, 'i'))?.[0];
  return tag?.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, 'i'))?.[1];
}

function text(xml: string, element: string): string | undefined {
  return xml.match(new RegExp(`<${element}[^>]*>([^<]+)</${element}>`, 'i'))?.[1]?.trim();
}

async function readable(file: string): Promise<boolean> {
  try { await fs.access(file); return true; } catch { return false; }
}

async function beginsWithMz(file: string): Promise<boolean> {
  try {
    const handle = await fs.open(file, 'r');
    try {
      const header = Buffer.alloc(2);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return bytesRead === 2 && header[0] === 0x4d && header[1] === 0x5a;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

export async function inspectGameDirectory(directory: string): Promise<Game> {
  const canonical = await fs.realpath(directory);
  // GDK titles are authored on Windows, where the manifest name is
  // case-insensitive; some ship "MicrosoftGame.Config", which a case-sensitive
  // Linux filesystem does not find by the canonical name.
  const entries = await fs.readdir(canonical).catch(() => [] as string[]);
  const findEntry = (name: string) => entries.find((entry) => entry.toLowerCase() === name);
  const gameConfig = path.join(canonical, findEntry('microsoftgame.config') ?? 'MicrosoftGame.config');
  const appxManifest = path.join(canonical, findEntry('appxmanifest.xml') ?? 'appxmanifest.xml');
  const configXml = await fs.readFile(gameConfig, 'utf8').catch(() => '');
  const appxXml = await fs.readFile(appxManifest, 'utf8').catch(() => '');
  if (!configXml && !appxXml) {
    throw new Error('The selected directory does not contain MicrosoftGame.config or appxmanifest.xml.');
  }

  const title = attr(configXml, 'ShellVisuals', 'DefaultDisplayName')
    ?? text(appxXml, 'DisplayName')
    ?? path.basename(canonical);
  const executable = attr(configXml, 'Executable', 'Name')
    ?? attr(appxXml, 'Application', 'Executable');
  const storeId = text(configXml, 'StoreId');
  const publisher = attr(configXml, 'ShellVisuals', 'PublisherDisplayName')
    ?? text(appxXml, 'PublisherDisplayName');
  const finalContainer = path.join(canonical, '.xodus-streaming.msixvc');
  const temporaryContainer = path.join(canonical, '.xodus-streaming-tmp.msixvc');
  const hasFinal = await readable(finalContainer);
  const hasTemporary = await readable(temporaryContainer);
  const exeExists = executable ? await readable(path.join(canonical, executable.replace(/\\/g, path.sep))) : false;
  const vcRedistPath = path.join(canonical, 'Engine', 'Extras', 'Redist', 'en-us', 'vc_redist.x64.exe');
  const vcRedistEncrypted = /<KnownDependency\b[^>]*\bName=["']VC14["']/i.test(configXml)
    && await readable(vcRedistPath) && !await beginsWithMz(vcRedistPath);
  let antiCheat: Game['antiCheat'];
  let launchSupport: Game['launchSupport'] = 'unknown';
  let launchBlockReason: string | undefined;
  for (const eacDirectory of ['EasyAntiCheat', 'EasyAntiCheat_EOS']) {
    let settings: { executable?: unknown };
    try {
      settings = JSON.parse(await fs.readFile(path.join(canonical, eacDirectory, 'Settings.json'), 'utf8')) as { executable?: unknown };
    } catch { continue; }
    const eacExecutable = typeof settings.executable === 'string' && settings.executable.trim() ? settings.executable : undefined;
    const encryptedTarget = eacExecutable
      ? !await beginsWithMz(path.join(canonical, eacExecutable.replace(/\\/g, path.sep)))
      : false;
    antiCheat = { provider: 'Easy Anti-Cheat', executable: eacExecutable, encryptedTarget };
    if (hasFinal && eacExecutable) {
      launchSupport = 'offline-only-eac';
      launchBlockReason = 'Easy Anti-Cheat detected. Only offline play is supported.';
    }
    break;
  }

  let coverDataUrl: string | undefined;
  const coverRelative = attr(configXml, 'ShellVisuals', 'Square480x480Logo')
    ?? attr(configXml, 'ShellVisuals', 'Square150x150Logo')
    ?? attr(appxXml, 'VisualElements', 'Square150x150Logo')
    ?? attr(appxXml, 'VisualElements', 'Square44x44Logo');
  if (coverRelative) {
    const cover = path.join(canonical, coverRelative.replace(/\\/g, path.sep));
    try {
      const buffer = await fs.readFile(cover);
      if (buffer.length < 3_000_000) coverDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    } catch { /* Artwork is optional. */ }
  }

  const installState = hasFinal && exeExists ? 'ready' : hasTemporary ? 'incomplete' : 'imported';
  const installMessage = installState === 'incomplete'
    ? 'A temporary Xodus container was found; the download was not completed.'
    : installState === 'imported' && !hasFinal
      ? 'The .xodus-streaming.msixvc container is missing; Xodus run may not work.'
      : undefined;

  return {
    id: createHash('sha256').update(canonical).digest('hex').slice(0, 16),
    title,
    path: canonical,
    storeId,
    publisher,
    executable,
    coverDataUrl,
    installState,
    installMessage,
    launchSupport,
    launchBlockReason,
    vcRedistEncrypted,
    antiCheat,
    addedAt: new Date().toISOString(),
  };
}
