import { useState } from 'react';
import { BookmarkPlus, Clock3, Gamepad2 } from 'lucide-react';
import type { AppSnapshot, Game } from '../shared/types';
import type { LibraryCollections } from './guide-history';
import { collectionGames, type CollectionView } from './library-collections';
import { useLibraryCollections } from './useLibraryCollections';
import { PlayLaterButton } from './PlayLaterButton';
import './library-collections.css';

function CollectionArtwork({ game }: { game: Game }) {
  const [failed, setFailed] = useState('');
  const artwork = game.coverUrl ?? game.coverDataUrl;
  return artwork && failed !== artwork ? <img src={artwork} alt={`${game.title} cover`} loading="lazy" onError={() => setFailed(artwork)} />
    : <div className="catalog-cover-placeholder"><Gamepad2 /></div>;
}
export function LibraryCollectionCards({ games, collections, view, auth, openGame }: {
  games: readonly Game[]; collections: LibraryCollections; view: CollectionView; auth: AppSnapshot['auth']; openGame: (id: string) => void;
}) {
  const rows = collectionGames(games, collections, view);
  return <div className="catalog-grid" data-gamepad-grid>{rows.map(game => <article key={game.id} className="catalog-card collection-card" data-gamepad-card>
    <button className="catalog-card-main" type="button" onClick={() => openGame(game.id)}>
      <CollectionArtwork game={game} /><div><strong title={game.title}>{game.title}</strong><small>{game.publisher ?? 'Local installation'}</small>
        {view === 'history' ? <time dateTime={new Date(collections.history[game.id]).toISOString()}>Last launched {new Date(collections.history[game.id]).toLocaleString()}</time> : null}
      </div>
    </button><PlayLaterButton auth={auth} gameId={game.id} />
  </article>)}</div>;
}
export function LibraryCollectionsPage({ data, openGame, initialView = 'later' }: {
  data: AppSnapshot; openGame: (id: string) => void; initialView?: CollectionView;
}) {
  const [view, setView] = useState<CollectionView>(initialView);
  const { available, collections } = useLibraryCollections(data.auth);
  const rows = collectionGames(data.games, collections, view);
  const savedIds = view === 'later' ? collections.later : Object.keys(collections.history);
  const missing = savedIds.filter(id => !data.games.some(game => game.id === id)).length;
  return <main className="collections-page">
    <header className="page-header"><div><h1>Library collections</h1><p>Play later and games you launched with Xodus Nexus, saved for this account on this device.</p></div></header>
    <div className="collection-tabs" aria-label="Library collection">
      <button className="secondary" type="button" aria-pressed={view === 'later'} onClick={() => setView('later')}><BookmarkPlus />Play later</button>
      <button className="secondary" type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}><Clock3 />Recently played</button>
    </div>
    {!available ? <div className="empty-state compact"><div><BookmarkPlus /></div><h2>Sign in to view your collections</h2><p>Each account has its own Play later list and launch history.</p></div>
      : rows.length ? <LibraryCollectionCards games={data.games} collections={collections} view={view} auth={data.auth} openGame={openGame} />
      : <div className="empty-state compact"><div>{view === 'later' ? <BookmarkPlus /> : <Clock3 />}</div><h2>{view === 'later' ? 'Nothing saved for later' : 'No recorded launches yet'}</h2><p>{view === 'later' ? 'Use Add to Play later in a game’s details to save it here.' : 'Games appear here after Xodus Nexus reports a running game launch.'}</p></div>}
    {available && missing > 0 ? <p className="account-library-note">{missing} saved {missing === 1 ? 'entry is' : 'entries are'} hidden because the game is no longer in this library.</p> : null}
  </main>;
}
