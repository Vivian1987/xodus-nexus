import type {AppSnapshot} from '../shared/types';
export interface LibraryCollections { later: string[]; history: Record<string, number> }
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export function collectionKey(auth: AppSnapshot['auth']) { return `nexus.library-collections.v1:${encodeURIComponent(auth.username ?? auth.gamertag ?? 'local')}`; }
export function loadCollections(key: string, storage?: StorageLike): LibraryCollections {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(key) ?? '{}');
    return { later: Array.isArray(value.later) ? [...new Set(value.later.filter((id: unknown): id is string => typeof id === 'string' && id.length <= 200))] as string[] : [],
      history: Object.fromEntries(Object.entries(value.history ?? {}).filter(([id, time]) => id.length <= 200 && typeof time === 'number' && Number.isFinite(time) && time > 0)) as Record<string, number> };
  } catch { return { later: [], history: {} }; }
}
export function saveCollections(key: string, value: LibraryCollections, storage?: StorageLike): boolean {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(value)); if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexus-library-collections')); return true; }
  catch { return false; }
}
