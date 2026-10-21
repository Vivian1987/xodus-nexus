import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoSnapshot } from '../shared/demo-data';
import { LibraryCollectionCards, LibraryCollectionsPage } from './LibraryCollectionsPage';
import { PlayLaterButton } from './PlayLaterButton';
import { libraryCollectionKey } from './library-collections';
afterEach(() => vi.unstubAllGlobals());
it('offers separate Nexus collections and never invents recently played from installations', () => {
  const data = demoSnapshot(), openGame = vi.fn(); data.auth = { stored: true, running: false, username: 'one@example.test', note: '' };
  vi.stubGlobal('localStorage', { getItem: () => null });
  const html = renderToStaticMarkup(<LibraryCollectionsPage data={data} openGame={openGame} initialView="history" />);
  expect(html).toContain('Library collections'); expect(html).toContain('Play later'); expect(html).toContain('Recently played');
  expect(html).toContain('No recorded launches yet'); expect(html).not.toContain(data.games[0].title); expect(openGame).not.toHaveBeenCalled();
});
it('renders only existing game IDs and provides details and explicit remove controls', () => {
  const data = demoSnapshot(), game = data.games[0], openGame = vi.fn(); data.auth = { ...data.auth, stored: true, running: false, username: 'one@example.test' };
  const collections = { later: [game.id, 'deleted-id'], history: { [game.id]: 1000, 'deleted-id': 2000 } };
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === libraryCollectionKey(data.auth) ? JSON.stringify(collections) : null });
  const html = renderToStaticMarkup(<LibraryCollectionCards games={[game]} collections={collections} view="history" auth={data.auth} openGame={openGame} />);
  expect(html).toContain(game.title); expect(html).toContain('Last launched'); expect(html).toContain('Remove from Play later');
  expect(html).toContain('aria-pressed="true"'); expect(html).not.toContain('deleted-id'); expect(openGame).not.toHaveBeenCalled();
});
it('hides collections and disables saving during sign-out/account transitions, even with old cached local data', () => {
  const data = demoSnapshot(); data.auth = { ...data.auth, stored: false, running: false };
  vi.stubGlobal('localStorage', { getItem: vi.fn(() => JSON.stringify({ later: [data.games[0].id] })) });
  const page = renderToStaticMarkup(<LibraryCollectionsPage data={data} openGame={() => {}} />);
  const button = renderToStaticMarkup(<PlayLaterButton auth={data.auth} gameId={data.games[0].id} />);
  expect(page).toContain('Sign in to view your collections'); expect(page).not.toContain(data.games[0].title);
  expect(button).toContain('disabled'); expect(button).toContain('aria-pressed="false"'); expect(localStorage.getItem).not.toHaveBeenCalled();
});
