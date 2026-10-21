import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSnapshot } from '../shared/types';
import { createLaunchHistoryRecorder, emptyCollections, libraryCollectionKey, readLibraryCollections, togglePlayLater } from './library-collections';

export function useLibraryCollections(auth: AppSnapshot['auth']) {
  const key = libraryCollectionKey(auth);
  const currentKey = useRef(key); currentKey.current = key;
  const [state, setState] = useState(() => ({ key, collections: readLibraryCollections(key), error: '' }));
  useEffect(() => {
    const update = () => setState({ key, collections: readLibraryCollections(key), error: '' });
    const storage = (event: StorageEvent) => { if (!event.key || event.key === key) update(); };
    update();
    window.addEventListener('nexus-library-collections', update);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('nexus-library-collections', update); window.removeEventListener('storage', storage); };
  }, [key]);
  const toggle = useCallback((gameId: string) => {
    if (!key || currentKey.current !== key) return false;
    const saved = togglePlayLater(key, gameId);
    setState({ key, collections: readLibraryCollections(key), error: saved ? '' : 'Play later could not be saved on this device.' });
    return saved;
  }, [key]);
  // Hide old-account data during the render before its effect cleanup runs.
  const current = key && state.key === key;
  return { available: Boolean(key), collections: current ? state.collections : emptyCollections(), error: current ? state.error : '', toggle };
}

/** Mount once beside the App snapshot subscription, outside page routing. */
export function useLaunchHistory(data: Pick<AppSnapshot, 'auth' | 'games' | 'gameOperation'>): void {
  const recorder = useRef<ReturnType<typeof createLaunchHistoryRecorder>>();
  recorder.current ??= createLaunchHistoryRecorder();
  useEffect(() => { recorder.current!(data); }, [data.auth, data.games, data.gameOperation]);
}
