import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { BackendCapabilities, BackendStatus } from '../shared/types.js';
import { parseBackendHelp } from '../shared/utils.js';
import { run } from './process.js';

const REPOSITORY = 'https://github.com/xodus-gaming/xodus.git';
export const LINUX_RUN_PATCH = 'linux-run-v7 (#150 + launch chain + memfd paths + offline mirror + account status + streaming cache flush)';
const LINUX_RUN_RELEASE = 'linux-run-v7';
const EMPTY_CAPABILITIES: BackendCapabilities = {
  commands: [], account: false, login: false, logout: false, download: false, streaming: false, run: false,
};

interface ManagedPointer { commit: string; binaryPath: string; builtAt: string; linuxRunPatch?: string }

export class BackendManager {
  private status: BackendStatus;
  private readonly managedRoot: string;
  private readonly pointerFile: string;
  private emitLog: (scope: string, line: string) => void;
  private isOperationActive: () => boolean;

  constructor(
    userData: string,
    externalRoot: string,
    emitLog: (scope: string, line: string) => void,
    isOperationActive: () => boolean,
  ) {
    this.managedRoot = path.join(userData, 'xodus-backends');
    this.pointerFile = path.join(this.managedRoot, 'current.json');
    this.emitLog = emitLog;
    this.isOperationActive = isOperationActive;
    this.status = {
      available: false,
      source: 'none',
      updateAvailable: false,
      checking: false,
      updating: false,
      externalRoot,
      capabilities: EMPTY_CAPABILITIES,
      prerequisites: { git: false, cargo: false, rustc: false, protoc: false },
    };
  }

  get current(): BackendStatus { return structuredClone(this.status); }

  setExternalRoot(root: string): void { this.status.externalRoot = root; }

  private async commandExists(command: string): Promise<boolean> {
    try { return (await run(command, ['--version'], { maxOutput: 20_000 })).code === 0; } catch { return false; }
  }

  private async validate(binaryPath: string): Promise<BackendCapabilities | null> {
    try {
      await fs.access(binaryPath, constants.X_OK);
      const result = await run(binaryPath, ['--help'], { maxOutput: 100_000 });
      if (result.code !== 0) return null;
      const capabilities = parseBackendHelp(result.output);
      return capabilities.login && capabilities.streaming ? capabilities : null;
    } catch { return null; }
  }

  private async gitCommit(root: string): Promise<string | undefined> {
    try {
      const result = await run('git', ['-C', root, 'rev-parse', 'HEAD'], { maxOutput: 10_000 });
      return result.code === 0 ? result.output.trim() : undefined;
    } catch { return undefined; }
  }

  private async readPointer(): Promise<ManagedPointer | null> {
    try { return JSON.parse(await fs.readFile(this.pointerFile, 'utf8')) as ManagedPointer; } catch { return null; }
  }

  async refresh(): Promise<BackendStatus> {
    const [git, cargo, rustc, protoc] = await Promise.all([
      this.commandExists('git'), this.commandExists('cargo'), this.commandExists('rustc'), this.commandExists('protoc'),
    ]);
    this.status.prerequisites = { git, cargo, rustc, protoc };

    const pointer = await this.readPointer();
    if (pointer) {
      const capabilities = await this.validate(pointer.binaryPath);
      if (capabilities) {
        Object.assign(this.status, {
          available: true, source: 'managed', binaryPath: pointer.binaryPath,
          commit: pointer.commit, capabilities, blockReason: undefined,
          linuxRunPatch: pointer.linuxRunPatch,
        });
        return this.current;
      }
    }

    const externalBinary = path.join(this.status.externalRoot, 'target', 'release', 'xodus-cli');
    const capabilities = await this.validate(externalBinary);
    if (capabilities) {
      Object.assign(this.status, {
        available: true, source: 'external', binaryPath: externalBinary,
        commit: await this.gitCommit(this.status.externalRoot), capabilities, blockReason: undefined,
        linuxRunPatch: undefined,
      });
    } else {
      Object.assign(this.status, {
        available: false, source: 'none', binaryPath: undefined, commit: undefined,
        capabilities: EMPTY_CAPABILITIES,
        blockReason: 'No validated xodus-cli with login and streaming commands was found.',
      });
    }
    return this.current;
  }

  async externalDownloadRunning(): Promise<boolean> {
    try {
      const result = await run('ps', ['-eo', 'args='], { maxOutput: 2_000_000 });
      return result.output.split('\n').some((line) => {
        const lower = line.toLowerCase();
        return lower.includes('xodus-cli') && /\s(streaming|download)\s/.test(lower);
      });
    } catch { return false; }
  }

  private async assertUpdateAllowed(): Promise<void> {
    if (this.isOperationActive()) throw new Error('The backend cannot be updated while authentication, a download, or a game is active.');
    if (await this.externalDownloadRunning()) throw new Error('An external Xodus download is active. The update was blocked.');
  }

  async checkUpdate(): Promise<BackendStatus> {
    this.status.checking = true;
    try {
      const result = await run('git', ['ls-remote', REPOSITORY, 'refs/heads/main'], { maxOutput: 30_000 });
      if (result.code !== 0) throw new Error(result.output.trim() || 'GitHub is unavailable.');
      const upstreamCommit = result.output.trim().split(/\s+/)[0];
      this.status.upstreamCommit = upstreamCommit;
      this.status.updateAvailable = upstreamCommit !== this.status.commit
        || this.status.source !== 'managed'
        || this.status.linuxRunPatch !== LINUX_RUN_PATCH;
      this.status.blockReason = undefined;
    } catch (error) {
      this.status.blockReason = `Upstream check failed: ${(error as Error).message}`;
    } finally { this.status.checking = false; }
    return this.current;
  }

  async update(onStatus: () => void): Promise<void> {
    await this.assertUpdateAllowed();
    if (!this.status.prerequisites.git || !this.status.prerequisites.cargo || !this.status.prerequisites.rustc || !this.status.prerequisites.protoc) {
      throw new Error('Git, Cargo, Rust, or protoc is missing. Check the build dependencies in Settings.');
    }
    this.status.updating = true;
    this.status.blockReason = undefined;
    onStatus();
    await fs.mkdir(path.join(this.managedRoot, 'releases'), { recursive: true });
    const staging = path.join(this.managedRoot, `.staging-${randomUUID()}`);
    const log = (line: string) => this.emitLog('backend', line);
    try {
      log('Cloning the official xodus-gaming/xodus repository…');
      let result = await run('git', ['clone', '--depth', '1', '--branch', 'main', REPOSITORY, staging], { onLine: log });
      if (result.code !== 0) throw new Error(`git clone exited with code ${result.code}`);
      const commit = (await run('git', ['-C', staging, 'rev-parse', 'HEAD'])).output.trim();
      const patchAsset = fileURLToPath(new URL('../../assets/xodus-linux-run.patch', import.meta.url));
      const patchFile = path.join(staging, '.xodus-nexus-linux-run.patch');
      await fs.writeFile(patchFile, await fs.readFile(patchAsset));
      log(`Applying the validated Linux run patch ${LINUX_RUN_PATCH}…`);
      result = await run('git', ['-C', staging, 'apply', '--check', patchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The Linux run patch no longer matches upstream; the previous backend remains active.');
      result = await run('git', ['-C', staging, 'apply', patchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The Linux run patch could not be applied.');
      const mirrorPatchAsset = fileURLToPath(new URL('../../assets/xodus-offline-mirror.patch', import.meta.url));
      const mirrorPatchFile = path.join(staging, '.xodus-nexus-offline-mirror.patch');
      await fs.writeFile(mirrorPatchFile, await fs.readFile(mirrorPatchAsset));
      result = await run('git', ['-C', staging, 'apply', '--check', mirrorPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The offline mirror patch no longer matches upstream; the previous backend remains active.');
      result = await run('git', ['-C', staging, 'apply', mirrorPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The offline mirror patch could not be applied.');
      const accountPatchAsset = fileURLToPath(new URL('../../assets/xodus-account-status.patch', import.meta.url));
      const accountPatchFile = path.join(staging, '.xodus-nexus-account-status.patch');
      await fs.writeFile(accountPatchFile, await fs.readFile(accountPatchAsset));
      result = await run('git', ['-C', staging, 'apply', '--check', accountPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The account-status patch no longer matches upstream; the previous backend remains active.');
      result = await run('git', ['-C', staging, 'apply', accountPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The account-status patch could not be applied.');
      const cachePatchAsset = fileURLToPath(new URL('../../assets/xodus-streaming-cache-flush.patch', import.meta.url));
      const cachePatchFile = path.join(staging, '.xodus-nexus-streaming-cache-flush.patch');
      await fs.writeFile(cachePatchFile, await fs.readFile(cachePatchAsset));
      result = await run('git', ['-C', staging, 'apply', '--check', cachePatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The streaming-cache patch no longer matches upstream; the previous backend remains active.');
      result = await run('git', ['-C', staging, 'apply', cachePatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The streaming-cache patch could not be applied.');
      const chainPatchAsset = fileURLToPath(new URL('../../assets/xodus-launch-chain.patch', import.meta.url));
      const chainPatchFile = path.join(staging, '.xodus-nexus-launch-chain.patch');
      await fs.writeFile(chainPatchFile, await fs.readFile(chainPatchAsset));
      result = await run('git', ['-C', staging, 'apply', '--check', chainPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The launch-chain patch no longer matches upstream; the previous backend remains active.');
      result = await run('git', ['-C', staging, 'apply', chainPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The launch-chain patch could not be applied.');
      const memfdPatchAsset = fileURLToPath(new URL('../../assets/xodus-memfd-path.patch', import.meta.url));
      const memfdPatchFile = path.join(staging, '.xodus-nexus-memfd-path.patch');
      await fs.writeFile(memfdPatchFile, await fs.readFile(memfdPatchAsset));
      result = await run('git', ['-C', staging, 'apply', '--check', memfdPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The memfd-path patch no longer matches upstream; the previous backend remains active.');
      result = await run('git', ['-C', staging, 'apply', memfdPatchFile], { onLine: log, maxOutput: 100_000 });
      if (result.code !== 0) throw new Error('The memfd-path patch could not be applied.');
      const target = path.join(staging, 'target');
      log(`Building ${commit.slice(0, 10)} with Cargo…`);
      result = await run('cargo', ['build', '--release', '--workspace'], {
        cwd: staging,
        env: { ...process.env, CARGO_TARGET_DIR: target },
        onLine: log,
        maxOutput: 5_000_000,
      });
      if (result.code !== 0) throw new Error(`cargo build exited with code ${result.code}`);
      const builtCli = path.join(target, 'release', 'xodus-cli');
      const capabilities = await this.validate(builtCli);
      if (!capabilities?.login || !capabilities.streaming || !capabilities.account) throw new Error('The built backend failed command validation.');
      const runHelp = await run(builtCli, ['run', '--help'], { maxOutput: 100_000 });
      if (runHelp.code !== 0 || !runHelp.output.includes('--materialize-chain')) throw new Error('The built backend lacks launch-chain support.');
      await this.assertUpdateAllowed();

      const releaseDir = path.join(this.managedRoot, 'releases', `${commit}-${LINUX_RUN_RELEASE}`);
      await fs.mkdir(releaseDir, { recursive: true });
      const managedCli = path.join(releaseDir, 'xodus-cli');
      await fs.copyFile(builtCli, managedCli);
      await fs.chmod(managedCli, 0o755);
      const builtService = path.join(target, 'release', 'xodus-service');
      try {
        await fs.copyFile(builtService, path.join(releaseDir, 'xodus-service'));
        await fs.chmod(path.join(releaseDir, 'xodus-service'), 0o755);
      } catch { /* CLI is the required backend for v1. */ }
      await fs.writeFile(path.join(releaseDir, 'metadata.json'), JSON.stringify({ commit, builtAt: new Date().toISOString(), capabilities, linuxRunPatch: LINUX_RUN_PATCH }, null, 2));
      const pointer: ManagedPointer = { commit, binaryPath: managedCli, builtAt: new Date().toISOString(), linuxRunPatch: LINUX_RUN_PATCH };
      const pointerTmp = `${this.pointerFile}.tmp`;
      await fs.writeFile(pointerTmp, JSON.stringify(pointer, null, 2));
      await fs.rename(pointerTmp, this.pointerFile);
      Object.assign(this.status, {
        available: true, source: 'managed', binaryPath: managedCli, commit,
        upstreamCommit: commit, updateAvailable: false, capabilities, linuxRunPatch: LINUX_RUN_PATCH,
      });
      log('The new backend passed validation and was activated atomically. Older builds were preserved.');
    } catch (error) {
      this.status.blockReason = (error as Error).message;
      throw error;
    } finally {
      this.status.updating = false;
      await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      onStatus();
    }
  }
}
