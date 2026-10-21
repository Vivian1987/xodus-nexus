import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import type { AppSnapshot } from '../shared/types';
import { collectionGameId } from './library-collections';
import { useLibraryCollections } from './useLibraryCollections';
import './library-collections.css';

export function PlayLaterButton({ auth, gameId, className = 'secondary', onError }: {
  auth: AppSnapshot['auth']; gameId: string; className?: string; onError?: (message: string) => void;
}) {
  const { available, collections, error, toggle } = useLibraryCollections(auth);
  const saved = collections.later.includes(gameId);
  return <span className="play-later-control"><button className={className} type="button" aria-pressed={saved}
    disabled={!available || !collectionGameId(gameId)} title={!available ? 'Sign in to save Play later for your account.' : undefined}
    onClick={() => { if (!toggle(gameId)) onError?.('Play later could not be saved on this device.'); }}>
    {saved ? <BookmarkCheck /> : <BookmarkPlus />}{saved ? 'Remove from Play later' : 'Add to Play later'}
  </button>{error && !onError ? <small role="alert">{error}</small> : null}</span>;
}
