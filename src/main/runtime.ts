import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RuntimeStatus } from '../shared/types.js';
import { run } from './process.js';
import { fetchNexusRelease, releaseText } from './release-fetch.js';
import { runtimeAssetUrl, runtimeCandidate, runtimeReleasesUrl, type NexusRuntimeArtifact } from './runtime-package.js';

const REPOSITORY = 'xodus-gaming/Proton';
const BRANCH = 'xodus/bleeding-edge';
const REPOSITORY_URL = 'https://github.com/xodus-gaming/Proton.git';

interface RuntimePointer {
  name: string;
  winePath: string;
  commit: string;
  installedAt: string;
}

interface ArtifactInfo {
  runId: number;
  commit: string;
  name: string;
  checksumName: string;
  expiresAt: string;
}

// Release directories carry simple, user-facing version names; patch
// provenance lives in current.json and the release notes, not in the path.
// Upstream Proton describe style: <wine>-<yyyymmdd>-g<sha> (e.g.
// 11.0-20261011-g3fd4ae10), so the version says which Wine it is.
export function canonicalSnapshotName(commit: string): string {
  return `xodus-proton-${commit.slice(0, 8)}`;
}

export function nexusReleaseName(archiveAssetName: string): string {
  return archiveAssetName.replace(/-x86_64\.tar\.xz$/, '');
}

export function previewBaseRelease(name: string): string | null {
  const match = name.match(/^(proton-xodus-[A-Za-z0-9._-]+)-xgamesave-pr28-[0-9a-f]{10}(?:-bridge-v1(?:-userstate-v1(?:-userguest-v1)?)?)?(?:-locale-v1)?$/);
  return match?.[1] ?? null;
}

export class RuntimeManager {
  private status: RuntimeStatus;
  private emitLog: (scope: string, line: string) => void;
  private isOperationActive: () => boolean;
  private latestArtifact?: ArtifactInfo;
  private nexusArtifact?: NexusRuntimeArtifact;
  private readonly fetcher: typeof fetch;

  constructor(runtimeRoot: string, emitLog: (scope: string, line: string) => void, isOperationActive: () => boolean, fetcher: typeof fetch = fetch) {
    this.emitLog = emitLog;
    this.isOperationActive = isOperationActive;
    this.fetcher = fetcher;
    this.status = {
      installed: false,
      checking: false,
      updating: false,
      runtimeRoot,
      artifactAvailable: false,
      prerequisites: { gh: false, authenticated: false, tar: false, sha512sum: false },
    };
  }

  get current(): RuntimeStatus { return structuredClone(this.status); }
  setRoot(root: string): void { this.status.runtimeRoot = root; }

  private async commandOk(command: string, args: string[]): Promise<boolean> {
    try { return (await run(command, args, { maxOutput: 30_000 })).code === 0; } catch { return false; }
  }

  private pointerFile(): string { return path.join(this.status.runtimeRoot, 'current.json'); }

  private async readPointer(): Promise<RuntimePointer | null> {
    try { return JSON.parse(await fs.readFile(this.pointerFile(), 'utf8')) as RuntimePointer; } catch { return null; }
  }

  private async validateWine(winePath: string): Promise<boolean> {
    try {
      await fs.access(winePath, constants.X_OK);
      const result = await run(winePath, ['--version'], { maxOutput: 30_000 });
      return result.code === 0 && /wine/i.test(result.output);
    } catch { return false; }
  }

  async refresh(): Promise<RuntimeStatus> {
    const [gh, authenticated, tar, sha512sum] = await Promise.all([
      this.commandOk('gh', ['--version']),
      this.commandOk('gh', ['auth', 'status', '--hostname', 'github.com']),
      this.commandOk('tar', ['--version']),
      this.commandOk('sha512sum', ['--version']),
    ]);
    this.status.prerequisites = { gh, authenticated, tar, sha512sum };
    const pointer = await this.readPointer();
    if (pointer && await this.validateWine(pointer.winePath)) {
      Object.assign(this.status, {
        installed: true,
        name: pointer.name,
        winePath: pointer.winePath,
        commit: pointer.commit,
        error: undefined,
      });
    } else {
      Object.assign(this.status, { installed: false, name: undefined, winePath: undefined, commit: undefined });
    }
    return this.current;
  }

  private async discoverArtifact(): Promise<ArtifactInfo> {
    const remote = await run('git', ['ls-remote', REPOSITORY_URL, `refs/heads/${BRANCH}`], { maxOutput: 30_000 });
    if (remote.code !== 0) throw new Error('Could not resolve the Xodus Proton branch HEAD.');
    const upstreamCommit = remote.output.trim().split(/\s+/)[0];
    this.status.upstreamCommit = upstreamCommit;

    const runs = await run('gh', [
      'api', '--method', 'GET', `repos/${REPOSITORY}/actions/runs`,
      '-f', `branch=${BRANCH}`, '-f', 'status=success', '-f', 'per_page=20',
    ], { maxOutput: 2_000_000 });
    if (runs.code !== 0) throw new Error('GitHub Actions runs are unavailable. Is gh authenticated?');
    const parsedRuns = JSON.parse(runs.output) as { workflow_runs?: Array<{ id: number; name: string; head_sha: string }> };
    const matchingRun = parsedRuns.workflow_runs?.find((entry) => entry.name === 'Snapshot' && entry.head_sha === upstreamCommit)
      ?? parsedRuns.workflow_runs?.find((entry) => entry.name === 'Snapshot');
    if (!matchingRun) throw new Error('No successful Xodus Proton snapshot was found.');

    const artifactsResult = await run('gh', ['api', `repos/${REPOSITORY}/actions/runs/${matchingRun.id}/artifacts`], { maxOutput: 2_000_000 });
    if (artifactsResult.code !== 0) throw new Error('Could not load Xodus Proton snapshot artifacts.');
    const parsedArtifacts = JSON.parse(artifactsResult.output) as { artifacts?: Array<{ name: string; expired: boolean; expires_at: string }> };
    const archive = parsedArtifacts.artifacts?.find((entry) => !entry.expired && entry.name.endsWith('-x86_64.tar.xz'));
    const checksum = parsedArtifacts.artifacts?.find((entry) => !entry.expired && entry.name.endsWith('-x86_64.sha512sum'));
    if (!archive || !checksum) throw new Error('The x86_64 snapshot is missing or has expired.');
    return {
      runId: matchingRun.id,
      commit: matchingRun.head_sha,
      name: archive.name,
      checksumName: checksum.name,
      expiresAt: archive.expires_at,
    };
  }

  async check(): Promise<RuntimeStatus> {
    this.status.checking = true;
    this.status.error = undefined;
    try {
      if (!this.status.prerequisites.gh || !this.status.prerequisites.authenticated) {
        await this.refresh();
      }
      if (!this.status.prerequisites.gh) throw new Error('GitHub CLI (gh) is missing.');
      if (!this.status.prerequisites.authenticated) throw new Error('GitHub CLI is not authenticated; run gh auth login.');
      this.latestArtifact = await this.discoverArtifact();
      Object.assign(this.status, {
        artifactAvailable: true,
        artifactName: this.latestArtifact.name,
        artifactExpiresAt: this.latestArtifact.expiresAt,
      });
    } catch (error) {
      this.latestArtifact = undefined;
      this.status.artifactAvailable = false;
      this.status.error = (error as Error).message;
    } finally { this.status.checking = false; }
    return this.current;
  }

  private setPhase(phase: string, onStatus: () => void): void {
    this.status.phase = phase;
    this.emitLog('runtime', phase);
    onStatus();
  }

  async install(onStatus: () => void): Promise<string> {
    if (this.isOperationActive()) throw new Error('The runtime cannot be changed while a Xodus operation is active.');
    if (!this.latestArtifact) await this.check();
    const artifact = this.latestArtifact;
    if (!artifact) throw new Error(this.status.error ?? 'The current snapshot is unavailable.');
    if (!this.status.prerequisites.tar || !this.status.prerequisites.sha512sum) throw new Error('tar or sha512sum is missing.');

    this.status.updating = true;
    this.status.error = undefined;
    onStatus();
    const staging = path.join(this.status.runtimeRoot, `.staging-${randomUUID()}`);
    const downloads = path.join(staging, 'downloads');
    try {
      await fs.mkdir(downloads, { recursive: true });
      this.setPhase('Downloading the official x86_64 snapshot from GitHub Actions…', onStatus);
      let result = await run('gh', ['run', 'download', String(artifact.runId), '--repo', REPOSITORY, '--name', artifact.name, '--dir', downloads], {
        onLine: (line) => this.emitLog('runtime', line), maxOutput: 1_000_000,
      });
      if (result.code !== 0) throw new Error(`Runtime download failed (gh code ${result.code}).`);
      result = await run('gh', ['run', 'download', String(artifact.runId), '--repo', REPOSITORY, '--name', artifact.checksumName, '--dir', downloads], {
        onLine: (line) => this.emitLog('runtime', line), maxOutput: 100_000,
      });
      if (result.code !== 0) throw new Error('Checksum download failed.');

      this.setPhase('Verifying the SHA-512 checksum…', onStatus);
      result = await run('sha512sum', ['-c', artifact.checksumName], { cwd: downloads, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('Snapshot SHA-512 verification failed.');

      return await this.activateArchive(downloads, artifact.name, artifact.commit, onStatus, canonicalSnapshotName(artifact.commit));
    } catch (error) {
      this.status.error = (error as Error).message;
      throw error;
    } finally {
      this.status.updating = false;
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      onStatus();
    }
  }

  // Shared tail of both install paths: verify the archive structure, extract,
  // validate Wine and atomically switch the active runtime pointer. The
  // release directory uses the simple canonical name (releaseName); what the
  // archive calls its top-level folder is only provenance, kept in current.json.
  private async activateArchive(downloads: string, archiveName: string, commit: string, onStatus: () => void, releaseName: string): Promise<string> {
    const staging = path.join(this.status.runtimeRoot, `.staging-${randomUUID()}`);
    const extracted = path.join(staging, 'extracted');
    const archivePath = path.join(downloads, archiveName);
    try {
      // Only tar's stdout contains paths. Loader/overlay warnings on stderr
      // must not become archive members, even when tar itself exits successfully.
      const listing = await run('tar', ['-tJf', archivePath], { maxOutput: 20_000_000, stdoutOnly: true });
      if (listing.code !== 0) throw new Error('The runtime is not a valid tar.xz archive.');
      const entries = listing.output.split('\n').filter(Boolean);
      if (entries.length === 0 || entries.some((entry) => path.isAbsolute(entry) || entry.split('/').includes('..'))) {
        throw new Error('The archive contains unsafe paths.');
      }
      const top = entries[0].split('/')[0];
      if (!/^(proton-xodus-|xodus-nexus-runtime-)/.test(top) || entries.some((entry) => entry.split('/')[0] !== top)) {
        throw new Error('Unexpected Xodus Proton runtime structure.');
      }

      this.setPhase('Extracting approximately 1.4 GB of runtime files…', onStatus);
      await fs.mkdir(extracted, { recursive: true });
      let result = await run('tar', ['-xJf', archivePath, '-C', extracted], { onLine: (line) => this.emitLog('runtime', line), maxOutput: 1_000_000 });
      if (result.code !== 0) throw new Error('Runtime extraction failed.');
      const candidateRoot = path.join(extracted, top);
      const candidateWine = path.join(candidateRoot, 'files', 'bin', 'wine');
      if (!await this.validateWine(candidateWine)) throw new Error('The downloaded Wine failed --version validation.');
      if (this.isOperationActive()) throw new Error('Another operation started during installation; the runtime was not activated.');

      const releases = path.join(this.status.runtimeRoot, 'releases');
      const releaseRoot = path.join(releases, releaseName);
      await fs.mkdir(releases, { recursive: true });
      try {
        await fs.access(releaseRoot);
      } catch {
        await fs.rename(candidateRoot, releaseRoot);
      }
      const winePath = path.join(releaseRoot, 'files', 'bin', 'wine');
      if (!await this.validateWine(winePath)) throw new Error('The activated runtime is not executable.');
      const pointer: RuntimePointer = { name: releaseName, winePath, commit, installedAt: new Date().toISOString() };
      await fs.mkdir(this.status.runtimeRoot, { recursive: true });
      const pointerTmp = `${this.pointerFile()}.tmp`;
      await fs.writeFile(pointerTmp, JSON.stringify(pointer, null, 2), { mode: 0o600 });
      await fs.rename(pointerTmp, this.pointerFile());
      Object.assign(this.status, { installed: true, name: releaseName, winePath, commit, phase: 'Runtime is ready.', error: undefined });
      this.emitLog('runtime', `Active Wine: ${winePath}`);
      return winePath;
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  // The Nexus runtime is the official Proton snapshot with our
  // xgameruntime compatibility patches, published as a release asset. It is
  // a plain HTTPS download; no GitHub CLI authentication is needed. Launcher
  // AppImage releases share the same repository, so the newest release
  // carrying a runtime archive wins, not the overall latest release.
  async checkNexus(): Promise<RuntimeStatus> {
    this.status.nexusChecking = true;
    this.status.nexusError = undefined;
    try {
      const response = await fetchNexusRelease(this.fetcher, runtimeReleasesUrl, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error('The Xodus Nexus release list could not be read.');
      this.nexusArtifact = runtimeCandidate(JSON.parse(await releaseText(response, 2_000_000)));
      Object.assign(this.status, { nexusAvailable: true, nexusName: this.nexusArtifact.name, nexusVersion: this.nexusArtifact.version, nexusError: undefined });
    } catch (error) {
      this.nexusArtifact = undefined;
      Object.assign(this.status, { nexusAvailable: false, nexusName: undefined, nexusVersion: undefined, nexusError: (error as Error).message });
    } finally {
      this.status.nexusChecking = false;
    }
    return this.current;
  }

  private async downloadFile(url: string, target: string, limit: number): Promise<void> {
    const response = await fetchNexusRelease(this.fetcher, url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error(`Download failed with HTTP ${response.status}.`);
    const reader = response.body.getReader();
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      const declared = response.headers.get('content-length');
      if (declared && /^\d+$/.test(declared) && Number(declared) > limit) throw new Error('Runtime download exceeds the size limit.');
      file = await fs.open(target, 'wx', 0o600);
      let size = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > limit) throw new Error('Runtime download exceeds the size limit.');
        await file.writeFile(chunk.value);
      }
    } finally { await file?.close(); await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }

  async installNexus(onStatus: () => void): Promise<string> {
    if (this.isOperationActive()) throw new Error('The runtime cannot be changed while a Xodus operation is active.');
    if (!this.nexusArtifact) await this.checkNexus();
    const artifact = this.nexusArtifact;
    if (!artifact) throw new Error(this.status.nexusError ?? 'No Nexus runtime is available.');
    if (!this.status.prerequisites.tar || !this.status.prerequisites.sha512sum) throw new Error('tar or sha512sum is missing.');
    const base = `xodus-nexus-runtime-${artifact.version.slice('runtime-'.length)}`;
    if (artifact.name !== `${base}-x86_64.tar.xz` || artifact.checksumName !== `${base}-x86_64.sha512sum`) throw new Error('The runtime tag does not match its archive.');
    const archiveUrl = runtimeAssetUrl(artifact.version, artifact.name, artifact.url);
    const checksumUrl = runtimeAssetUrl(artifact.version, artifact.checksumName, artifact.checksumUrl);

    this.status.updating = true;
    this.status.error = undefined;
    onStatus();
    const staging = path.join(this.status.runtimeRoot, `.staging-${randomUUID()}`);
    const downloads = path.join(staging, 'downloads');
    try {
      await fs.mkdir(downloads, { recursive: true });
      this.setPhase(`Downloading the Nexus runtime ${artifact.version}…`, onStatus);
      await this.downloadFile(archiveUrl, path.join(downloads, artifact.name), 4 * 1024 ** 3);
      this.setPhase('Verifying the SHA-512 checksum…', onStatus);
      await this.downloadFile(checksumUrl, path.join(downloads, artifact.checksumName), 4096);
      const checksum = (await fs.readFile(path.join(downloads, artifact.checksumName), 'utf8')).trim().match(/^([a-f0-9]{128})[ \t]+\*?([^\r\n]+)$/i);
      if (!checksum || checksum[2] !== artifact.name) throw new Error('The SHA-512 file does not identify this Nexus runtime archive.');
      const result = await run('sha512sum', ['-c', artifact.checksumName], { cwd: downloads, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('Nexus runtime SHA-512 verification failed.');

      return await this.activateArchive(downloads, artifact.name, artifact.version, onStatus, nexusReleaseName(artifact.name));
    } catch (error) {
      this.status.error = (error as Error).message;
      throw error;
    } finally {
      this.status.updating = false;
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      onStatus();
    }
  }

  async rollbackCloudSavePreview(onStatus: () => void): Promise<string> {
    if (this.isOperationActive()) throw new Error('The runtime cannot be changed while a Xodus operation is active.');
    const current = await this.readPointer();
    const baseName = current ? previewBaseRelease(current.name) : null;
    if (!current || !baseName) throw new Error('No cloud-save preview is active.');
    const winePath = path.join(this.status.runtimeRoot, 'releases', baseName, 'files', 'bin', 'wine');
    if (!await this.validateWine(winePath)) throw new Error('The previous runtime is missing or failed validation. The preview remains active.');
    this.status.updating = true;
    onStatus();
    try {
      const pointer: RuntimePointer = { ...current, name: baseName, winePath, installedAt: new Date().toISOString() };
      const temporary = `${this.pointerFile()}.tmp-${randomUUID()}`;
      await fs.writeFile(temporary, JSON.stringify(pointer, null, 2), { mode: 0o600 });
      await fs.rename(temporary, this.pointerFile());
      Object.assign(this.status, { name: baseName, winePath, phase: 'Previous runtime restored.', error: undefined });
      this.emitLog('runtime', `Restored Wine: ${winePath}`);
      return winePath;
    } finally {
      this.status.updating = false;
      onStatus();
    }
  }
}
