import { expect, it } from 'vitest';
import { installationReadiness } from './installation-state';
import { demoSnapshot } from './demo-data';
import type { DownloadTask } from './types';
const game = demoSnapshot().games[0];
const task: DownloadTask = { id: 'job', kind: 'install', title: game.title, productId: game.storeId!, destination: game.path,
  status: 'running', progress: 100, phase: 'Finalizing', log: [], startedAt: '2026-10-20' };
it('does not equate complete transport progress or a matching title with launch readiness', () => {
  expect(installationReadiness(task, [game]).ready).toBe(false);
  expect(installationReadiness({ ...task, status: 'complete' }, []).ready).toBe(false);
  expect(installationReadiness({ ...task, status: 'complete' }, [{ ...game, storeId: 'different' }]).ready).toBe(false);
  expect(installationReadiness({ ...task, status: 'complete' }, [{ ...game, path: '/different-install' }]).ready).toBe(false);
});
it('requires the exact saved game identity and a verified ready installation', () => {
  const done = { ...task, status: 'complete' as const, gameId: game.id };
  expect(installationReadiness(done, [{ ...game, installState: 'ready' }])).toEqual({ ready: true, label: 'Ready to play' });
  for (const installState of ['incomplete', 'imported'] as const) expect(installationReadiness(done, [{ ...game, installState }]).ready).toBe(false);
  expect(installationReadiness({ ...done, gameId: 'other' }, [game]).ready).toBe(false);
  expect(installationReadiness({ ...done, kind: 'content' }, [game])).toEqual({ ready: false, label: 'Content download complete' });
});
it.each(['failed', 'cancelled', 'paused', 'queued', 'running'] as const)('keeps %s distinct from a completed ready installation', status => {
  expect(installationReadiness({ ...task, status }, [game]).ready).toBe(false);
});
