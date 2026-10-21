import { describe, expect, it } from 'vitest';
import { demoSnapshot } from '../shared/demo-data';
import { collectionGames, createLaunchHistoryRecorder, libraryCollectionKey, readLibraryCollections, togglePlayLater } from './library-collections';

function fixture() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const data = demoSnapshot(); data.auth = { stored: true, running: false, username: 'one@example.test', note: '' };
  data.games = [{ ...data.games[0], id: 'known' }];
  data.gameOperation = { id: 'launch-1', gameId: 'known', kind: 'launch', status: 'preparing', title: 'Known', phase: '', log: [], startedAt: new Date(1000).toISOString() };
  return { values, storage, data, key: libraryCollectionKey(data.auth)! };
}
describe('account-scoped local collections', () => {
  it('uses credential identity, never display names or a signed-out fallback', () => {
    const f = fixture();
    expect(libraryCollectionKey({ ...f.data.auth, gamertag: 'Changed' })).toBe(f.key);
    expect(libraryCollectionKey({ ...f.data.auth, username: 'two@example.test' })).not.toBe(f.key);
    for (const patch of [{ stored: false }, { stored: null }, { running: true }, { username: undefined }, { username: ' ' }])
      expect(libraryCollectionKey({ ...f.data.auth, ...patch })).toBeUndefined();
  });
  it('toggles only the selected account and reports storage failure', () => {
    const f = fixture(), other = libraryCollectionKey({ ...f.data.auth, username: 'two@example.test' })!;
    expect(togglePlayLater(f.key, 'known', f.storage)).toBe(true);
    expect(readLibraryCollections(f.key, f.storage).later).toEqual(['known']);
    expect(readLibraryCollections(other, f.storage).later).toEqual([]);
    expect(togglePlayLater(f.key, 'known', f.storage)).toBe(true);
    expect(readLibraryCollections(f.key, f.storage).later).toEqual([]);
    expect(togglePlayLater(undefined, 'known', f.storage)).toBe(false);
    expect(togglePlayLater(f.key, '', f.storage)).toBe(false);
    expect(togglePlayLater(f.key, 'known', { getItem: () => null, setItem: () => { throw Error('full'); } })).toBe(false);
  });
  it('ignores corrupt storage, invalid IDs, impossible dates and deleted games without mutating the library', () => {
    const f = fixture(); f.values.set(f.key, 'broken'); expect(readLibraryCollections(f.key, f.storage)).toEqual({ later: [], history: {} });
    f.values.set(f.key, JSON.stringify({ later: ['known', 'known', '', 'deleted', 'bad\nid'], history: { known: 1500, deleted: 1600, future: 3000, negative: -1 } }));
    const saved = readLibraryCollections(f.key, f.storage, 2000);
    expect(saved).toEqual({ later: ['known', 'deleted'], history: { known: 1500, deleted: 1600 } });
    expect(collectionGames(f.data.games, saved, 'later').map(game => game.id)).toEqual(['known']);
    expect(collectionGames(f.data.games, saved, 'history', 2000).map(game => game.id)).toEqual(['known']);
    expect(f.data.games).toHaveLength(1);
  });
  it('sorts history by real launch times, never installation time or library order', () => {
    const f = fixture(), games = ['a', 'b', 'c'].map((id, i) => ({ ...f.data.games[0], id, addedAt: new Date(9000 - i).toISOString() }));
    expect(collectionGames(games, { later: [], history: {} }, 'history')).toEqual([]);
    expect(collectionGames(games, { later: [], history: { a: 100, b: 300, c: 200, deleted: 900 } }, 'history', 1000).map(game => game.id)).toEqual(['b', 'c', 'a']);
  });
});
describe('observed running game launch history', () => {
  it('records once on running, preserves Play later and survives duplicate snapshots/remounts', () => {
    const f = fixture(); togglePlayLater(f.key, 'known', f.storage);
    let now = 2000; const observe = createLaunchHistoryRecorder({ storage: f.storage, now: () => now });
    expect(observe(f.data)).toBe(false); expect(readLibraryCollections(f.key, f.storage).history).toEqual({});
    f.data.gameOperation!.status = 'running'; expect(observe(f.data)).toBe(true);
    now = 3000; expect(observe(f.data)).toBe(false);
    expect(createLaunchHistoryRecorder({ storage: f.storage, now: () => now })(f.data)).toBe(false);
    expect(readLibraryCollections(f.key, f.storage, now)).toEqual({ later: ['known'], history: { known: 2000 } });
  });
  it('does not record prerequisites, clicks/preparation, installed status, completion-only or unknown IDs', () => {
    const f = fixture(), observe = createLaunchHistoryRecorder({ storage: f.storage, now: () => 2000 });
    for (const patch of [{ kind: 'prerequisite', status: 'running' }, { kind: undefined, status: 'running' }, { status: 'complete' }, { status: 'failed' }, { status: 'preparing' }, { status: 'running', gameId: 'deleted' }]) {
      const data = { ...f.data, gameOperation: { ...f.data.gameOperation!, ...patch } } as typeof f.data;
      expect(observe(data)).toBe(false);
    }
    expect(f.values.size).toBe(0);
  });
  it('permanently cancels attribution after an account transition during the same launch', () => {
    const f = fixture(), observe = createLaunchHistoryRecorder({ storage: f.storage, now: () => 2000 });
    observe(f.data); f.data.auth = { ...f.data.auth, username: 'two@example.test' }; f.data.gameOperation!.status = 'running';
    expect(observe(f.data)).toBe(false); f.data.auth = { ...f.data.auth, username: 'one@example.test' };
    expect(observe(f.data)).toBe(false); expect(f.values.size).toBe(0);
  });
  it('does not assign a launch first seen without a stable account to a later sign-in', () => {
    const f = fixture(), observe = createLaunchHistoryRecorder({ storage: f.storage, now: () => 2000 });
    f.data.auth.running = true; observe(f.data); f.data.auth.running = false; f.data.gameOperation!.status = 'running';
    expect(observe(f.data)).toBe(false); expect(f.values.size).toBe(0);
  });
  it('rejects future/non-date launch metadata and records a later distinct launch', () => {
    const f = fixture(), observe = createLaunchHistoryRecorder({ storage: f.storage, now: () => 5000 }); f.data.gameOperation!.status = 'running';
    f.data.gameOperation!.startedAt = 'not-a-date'; expect(observe(f.data)).toBe(false);
    f.data.gameOperation!.startedAt = new Date(6000).toISOString(); expect(observe(f.data)).toBe(false);
    f.data.gameOperation!.startedAt = new Date(1000).toISOString(); expect(observe(f.data)).toBe(true);
    f.data.gameOperation = { ...f.data.gameOperation!, id: 'launch-2', startedAt: new Date(5000).toISOString() };
    expect(createLaunchHistoryRecorder({ storage: f.storage, now: () => 6000 })(f.data)).toBe(false);
    // A launch at the same millisecond is already represented; after a newer
    // start, its running state advances the per-game timestamp once.
    f.data.gameOperation.startedAt = new Date(5500).toISOString();
    expect(createLaunchHistoryRecorder({ storage: f.storage, now: () => 6000 })(f.data)).toBe(true);
    expect(readLibraryCollections(f.key, f.storage, 6000).history.known).toBe(6000);
  });
});
