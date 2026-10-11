import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { previewBaseRelease, RuntimeManager } from './runtime.js';

describe('previewBaseRelease', () => {
  it('extracts the preserved base release', () => {
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1-userstate-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1-userstate-v1-userguest-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-bridge-v1-userstate-v1-userguest-v1-locale-v1')).toBe('proton-xodus-test-offline-v2');
    expect(previewBaseRelease('proton-xodus-test-offline-v2-xgamesave-pr28-3fd4ae1091-locale-v1')).toBe('proton-xodus-test-offline-v2');
  });

  it('rejects unrelated and malformed release names', () => {
    expect(previewBaseRelease('proton-xodus-test-offline-v2')).toBeNull();
    expect(previewBaseRelease('../escape-xgamesave-pr28-3fd4ae1091')).toBeNull();
  });

  it('atomically switches a preview back to its validated base release', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xodus-runtime-test-'));
    const base = 'proton-xodus-test-offline-v2';
    const winePath = path.join(root, 'releases', base, 'files', 'bin', 'wine');
    try {
      await fs.mkdir(path.dirname(winePath), { recursive: true });
      await fs.writeFile(winePath, '#!/bin/sh\necho wine-test\n', { mode: 0o755 });
      await fs.writeFile(path.join(root, 'current.json'), JSON.stringify({
        name: `${base}-xgamesave-pr28-3fd4ae1091`, winePath: '/preview/wine', commit: 'abc', installedAt: 'before',
      }));
      const manager = new RuntimeManager(root, () => undefined, () => false);
      expect(await manager.rollbackCloudSavePreview(() => undefined)).toBe(winePath);
      const pointer = JSON.parse(await fs.readFile(path.join(root, 'current.json'), 'utf8')) as { name: string; winePath: string };
      expect(pointer.name).toBe(base);
      expect(pointer.winePath).toBe(winePath);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
