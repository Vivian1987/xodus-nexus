import type { AppSnapshot, Game } from '../shared/types';
import { loadCollections, saveCollections, type LibraryCollections } from './guide-history';
import { guideHistoryKey } from './guide-home';

export type CollectionStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type CollectionView = 'later' | 'history';
export const emptyCollections = (): LibraryCollections => ({ later: [], history: {} });
export function collectionGameId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
}
/** Keep private data in the existing exact-account namespace; never use the
 * guide-history module's local/display-name fallback for account collections. */
export const libraryCollectionKey = guideHistoryKey;
export function readLibraryCollections(key: string | undefined, storage?: CollectionStorage, now = Date.now()): LibraryCollections {
  if (!key) return emptyCollections();
  const value = loadCollections(key, storage);
  return {
    later: value.later.filter(collectionGameId).slice(0, 5000),
    history: Object.fromEntries(Object.entries(value.history).filter(([id, time]) => collectionGameId(id) && time <= now).slice(0, 5000)),
  };
}
export function togglePlayLater(key: string | undefined, gameId: string, storage?: CollectionStorage): boolean {
  if (!key || !collectionGameId(gameId)) return false;
  const current = readLibraryCollections(key, storage);
  const later = current.later.includes(gameId) ? current.later.filter(id => id !== gameId) : [...current.later.slice(-4999), gameId];
  return saveCollections(key, { ...current, later }, storage);
}
export function collectionGames(games: readonly Game[], collections: LibraryCollections, view: CollectionView, now = Date.now()): Game[] {
  const unique = [...new Map(games.filter(game => collectionGameId(game.id)).map(game => [game.id, game])).values()];
  if (view === 'later') {
    const byId = new Map(unique.map(game => [game.id, game]));
    return [...new Set(collections.later)].flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  }
  return unique.filter(game => Object.hasOwn(collections.history, game.id) && typeof collections.history[game.id] === 'number' && Number.isFinite(collections.history[game.id]) && collections.history[game.id] > 0 && collections.history[game.id] <= now)
    .sort((a, b) => collections.history[b.id] - collections.history[a.id] || a.title.localeCompare(b.title));
}

/** Observe real launch status, not installed metadata or a Play button click.
 * An account transition invalidates attribution for the entire operation. */
export function createLaunchHistoryRecorder(options: { storage?: CollectionStorage; now?: () => number } = {}) {
  const seen = new Map<string, { account: string | undefined; valid: boolean; recorded: boolean }>();
  return (data: Pick<AppSnapshot, 'auth' | 'games' | 'gameOperation'>): boolean => {
    const operation = data.gameOperation, account = libraryCollectionKey(data.auth), now = (options.now ?? Date.now)();
    if (!operation || operation.kind !== 'launch' || !collectionGameId(operation.gameId) || !collectionGameId(operation.id)) return false;
    const startedAt = Date.parse(operation.startedAt);
    if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > now || !data.games.some(game => game.id === operation.gameId)) return false;
    const identity = JSON.stringify([operation.id, operation.startedAt]);
    let entry = seen.get(identity);
    if (!entry) {
      entry = { account, valid: Boolean(account), recorded: false }; seen.set(identity, entry);
      if (seen.size > 256) seen.delete(seen.keys().next().value!);
    }
    if (entry.account !== account) entry.valid = false;
    if (!entry.valid || entry.recorded || !account || operation.status !== 'running') return false;
    const current = readLibraryCollections(account, options.storage, now);
    // Remounts and duplicate running snapshots cannot turn one launch into
    // multiple recent entries or keep moving its timestamp forward.
    if ((current.history[operation.gameId] ?? 0) >= startedAt) { entry.recorded = true; return false; }
    const saved = saveCollections(account, { ...current, history: { ...current.history, [operation.gameId]: now } }, options.storage);
    if (saved) entry.recorded = true;
    return saved;
  };
}
