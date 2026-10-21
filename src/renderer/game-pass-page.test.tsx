import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoSnapshot } from '../shared/demo-data';
import type { AccountLibraryPage } from '../shared/types';
import { createGamePassLibraryLoader, GamePassLibrarySurface, GamePassPage, gamePassLibraryScope, type GamePassLibraryState } from './GamePassPage';
const product = { productId: '9AAAAAAAAAAA', title: 'Synthetic PC game', description: '', categories: [], access: 'gamepass', installability: 'supported', supportNote: '' } as const;
const page = (cursor?: string): AccountLibraryPage => ({ kind: 'gamepass', products: [{ ...product, categories: [] }], accessByProductId: {}, checkedAt: '2026-01-01T00:00:00Z', cursor });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe('provider-backed Game Pass page', () => {
  it('renders a modest loading page without automatically opening products, streaming, purchases or accounts', () => {
    const data = demoSnapshot(), openProduct = vi.fn(), getAccountLibrary = vi.fn();
    data.auth = { stored: true, running: false, username: 'one@example.test', note: '' }; data.backend.available = true; data.backend.capabilities.library = true;
    const html = renderToStaticMarkup(<GamePassPage data={data} bridge={{ getAccountLibrary }} openProduct={openProduct} />);
    expect(html).toContain('Game Pass'); expect(html).toContain('Loading Game Pass games');
    expect(html).not.toMatch(/<iframe|<webview|Buy now|Start stream/); expect(getAccountLibrary).not.toHaveBeenCalled(); expect(openProduct).not.toHaveBeenCalled();
  });
  it('explains signed-out/offline/unsupported states without requesting a backend', () => {
    const data = demoSnapshot(), getAccountLibrary = vi.fn(); data.auth = { stored: false, running: false, note: '' };
    expect(renderToStaticMarkup(<GamePassPage data={data} bridge={{ getAccountLibrary }} openProduct={() => {}} />)).toContain('Sign in and finish account verification');
    data.auth = { stored: true, running: false, username: 'one@example.test', note: '' }; data.backend.available = false;
    expect(renderToStaticMarkup(<GamePassPage data={data} bridge={{ getAccountLibrary }} openProduct={() => {}} />)).toContain('backend is offline');
    data.backend.available = true; data.backend.capabilities.library = false;
    expect(renderToStaticMarkup(<GamePassPage data={data} bridge={{ getAccountLibrary }} openProduct={() => {}} />)).toContain('Update the Xodus backend');
    expect(getAccountLibrary).not.toHaveBeenCalled();
  });
  it('fetches only Game Pass library pages, deduplicates pagination and refreshes explicitly', async () => {
    const states: GamePassLibraryState[] = [], getAccountLibrary = vi.fn().mockResolvedValueOnce(page('next')).mockResolvedValueOnce({ ...page(), products: [...page().products, { ...product, productId: '9BBBBBBBBBBB', categories: [] }] }).mockResolvedValueOnce(page());
    const loader = createGamePassLibraryLoader({ getAccountLibrary }, state => states.push(state));
    expect(getAccountLibrary).not.toHaveBeenCalled(); await loader.load(); await loader.load({ more: true });
    expect(states.at(-1)?.products.map(product => product.productId)).toEqual(['9AAAAAAAAAAA', '9BBBBBBBBBBB']);
    await loader.load({ refresh: true }); expect(states.at(-1)?.products).toHaveLength(1);
    expect(getAccountLibrary.mock.calls).toEqual([['gamepass', undefined, false], ['gamepass', 'next', false], ['gamepass', undefined, true]]);
  });
  it('shows actual provider errors and catches stalled cursors or incorrect library responses', async () => {
    const states: GamePassLibraryState[] = [], getAccountLibrary = vi.fn().mockRejectedValueOnce(Error('Provider is temporarily unavailable.')).mockResolvedValueOnce(page('same')).mockResolvedValueOnce(page('same')).mockResolvedValueOnce({ ...page(), kind: 'owned' });
    const loader = createGamePassLibraryLoader({ getAccountLibrary }, state => states.push(state));
    await loader.load(); expect(states.at(-1)).toMatchObject({ loading: false, error: 'Provider is temporarily unavailable.' });
    await loader.load(); await loader.load({ more: true }); expect(states.at(-1)?.error).toContain('did not advance');
    await loader.load({ refresh: true }); expect(states.at(-1)?.error).toContain('different library');
  });
  it('rejects late account/backend results and suppresses results superseded by a newer request', async () => {
    const old = deferred<AccountLibraryPage>(), newer = deferred<AccountLibraryPage>(), changed = vi.fn();
    const getAccountLibrary = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    const loader = createGamePassLibraryLoader({ getAccountLibrary }, changed);
    const first = loader.load(), second = loader.load({ refresh: true });
    newer.resolve(page()); await second; const count = changed.mock.calls.length;
    old.resolve({ ...page(), products: [{ ...product, title: 'Old account private game', categories: [] }] }); await first;
    expect(changed).toHaveBeenCalledTimes(count); expect(changed.mock.calls.at(-1)?.[0].products[0].title).toBe(product.title);
    const pending = deferred<AccountLibraryPage>(), disposed = vi.fn();
    const obsolete = createGamePassLibraryLoader({ getAccountLibrary: () => pending.promise }, disposed);
    const request = obsolete.load(); obsolete.dispose(); pending.resolve(page()); await request;
    expect(disposed).toHaveBeenCalledTimes(1); // Loading only, never the departed account's data.
  });
  it('changes the component scope for exact account/backend/market changes and hides unstable accounts', () => {
    const data = demoSnapshot(); data.auth = { stored: true, running: false, username: 'one@example.test', note: '' }; data.backend.available = true; data.backend.capabilities.library = true;
    const original = gamePassLibraryScope(data);
    expect(gamePassLibraryScope({ ...data, auth: { ...data.auth, gamertag: 'New display' } })).toBe(original);
    expect(gamePassLibraryScope({ ...data, auth: { ...data.auth, username: 'two@example.test' } })).not.toBe(original);
    expect(gamePassLibraryScope({ ...data, settings: { ...data.settings, market: 'GB' } })).not.toBe(original);
    expect(gamePassLibraryScope({ ...data, backend: { ...data.backend, binaryPath: '/other/provider' } })).not.toBe(original);
    expect(gamePassLibraryScope({ ...data, auth: { ...data.auth, running: true } })).toBeUndefined();
  });
  it('renders provider-returned cards with explicit details actions and truthful error/partial recovery', () => {
    const openProduct = vi.fn(), html = renderToStaticMarkup(<GamePassLibrarySurface state={{ loading: false, products: page().products, cursor: 'more', error: 'Provider error', skippedEntitlements: 2 }} openProduct={openProduct} load={() => {}} />);
    expect(html).toContain(product.title); expect(html).toContain('View game details'); expect(html).toContain('Load more games');
    expect(html).toContain('role="alert"'); expect(html).toContain('Try again'); expect(html).toContain('list may be incomplete'); expect(openProduct).not.toHaveBeenCalled();
  });
});
