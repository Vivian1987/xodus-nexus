import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RuntimeStatus } from '../shared/types.js';
import { run } from './process.js';

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

export function previewBaseRelease(name: string): string | null {
  const match = name.match(/^(proton-xodus-[A-Za-z0-9._-]+)-xgamesave-pr28-[0-9a-f]{10}(?:-bridge-v1(?:-userstate-v1(?:-userguest-v1)?)?)?(?:-locale-v1)?$/);
  return match?.[1] ?? null;
}

export class RuntimeManager {
  private status: RuntimeStatus;
  private emitLog: (scope: string, line: string) => void;
  private isOperationActive: () => boolean;
  private latestArtifact?: ArtifactInfo;

  constructor(runtimeRoot: string, emitLog: (scope: string, line: string) => void, isOperationActive: () => boolean) {
    this.emitLog = emitLog;
    this.isOperationActive = isOperationActive;
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
    const extracted = path.join(staging, 'extracted');
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

      const archivePath = path.join(downloads, artifact.name);
      const listing = await run('tar', ['-tJf', archivePath], { maxOutput: 20_000_000 });
      if (listing.code !== 0) throw new Error('The snapshot is not a valid tar.xz archive.');
      const entries = listing.output.split('\n').filter(Boolean);
      if (entries.length === 0 || entries.some((entry) => path.isAbsolute(entry) || entry.split('/').includes('..'))) {
        throw new Error('The archive contains unsafe paths.');
      }
      const top = entries[0].split('/')[0];
      if (!top.startsWith('proton-xodus-') || entries.some((entry) => entry.split('/')[0] !== top)) {
        throw new Error('Unexpected Xodus Proton snapshot structure.');
      }

      this.setPhase('Extracting approximately 1.4 GB of runtime files…', onStatus);
      await fs.mkdir(extracted, { recursive: true });
      result = await run('tar', ['-xJf', archivePath, '-C', extracted], { onLine: (line) => this.emitLog('runtime', line), maxOutput: 1_000_000 });
      if (result.code !== 0) throw new Error('Runtime extraction failed.');
      const candidateRoot = path.join(extracted, top);
      const candidateWine = path.join(candidateRoot, 'files', 'bin', 'wine');
      if (!await this.validateWine(candidateWine)) throw new Error('The downloaded Wine failed --version validation.');
      if (this.isOperationActive()) throw new Error('Another operation started during installation; the runtime was not activated.');

      const releases = path.join(this.status.runtimeRoot, 'releases');
      const releaseRoot = path.join(releases, top);
      await fs.mkdir(releases, { recursive: true });
      try {
        await fs.access(releaseRoot);
      } catch {
        await fs.rename(candidateRoot, releaseRoot);
      }
      const winePath = path.join(releaseRoot, 'files', 'bin', 'wine');
      if (!await this.validateWine(winePath)) throw new Error('The activated runtime is not executable.');
      const pointer: RuntimePointer = { name: top, winePath, commit: artifact.commit, installedAt: new Date().toISOString() };
      await fs.mkdir(this.status.runtimeRoot, { recursive: true });
      const pointerTmp = `${this.pointerFile()}.tmp`;
      await fs.writeFile(pointerTmp, JSON.stringify(pointer, null, 2), { mode: 0o600 });
      await fs.rename(pointerTmp, this.pointerFile());
      Object.assign(this.status, { installed: true, name: top, winePath, commit: artifact.commit, phase: 'Runtime is ready.' });
      this.emitLog('runtime', `Active Wine: ${winePath}`);
      return winePath;
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
