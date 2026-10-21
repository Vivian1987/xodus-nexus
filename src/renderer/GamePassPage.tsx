import { useEffect, useRef, useState } from 'react';
import { CircleAlert, Gamepad2, LoaderCircle, RefreshCw } from 'lucide-react';
import type { AccountLibraryPage, AppSnapshot, CatalogProduct, LauncherApi } from '../shared/types';
import { libraryCollectionKey } from './library-collections';
import './library-collections.css';

type Bridge = Pick<LauncherApi, 'getAccountLibrary'>;
export interface GamePassLibraryState {
  loading: boolean; products: AccountLibraryPage['products']; cursor?: string;
  checkedAt?: string; error?: string; skippedEntitlements?: number;
}
const emptyState = (): GamePassLibraryState => ({ loading: false, products: [] });
const message = (error: unknown) => (error instanceof Error ? error.message : 'The Game Pass library could not be loaded.')
  .replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
/** One account/backend scope per loader; disposal or a newer request suppresses
 * late results. Only the authenticated library provider is queried. */
export function createGamePassLibraryLoader(bridge: Bridge, changed: (state: GamePassLibraryState) => void) {
  let state = emptyState(), revision = 0, disposed = false;
  const publish = (next: GamePassLibraryState) => { state = next; changed(next); };
  return {
    async load(options: { more?: boolean; refresh?: boolean } = {}): Promise<void> {
      if (disposed || options.more && !state.cursor) return;
      const request = ++revision, cursor = options.more ? state.cursor : undefined;
      publish({ ...state, loading: true, error: undefined });
      try {
        const page = await bridge.getAccountLibrary('gamepass', cursor, options.refresh === true);
        if (disposed || revision !== request) return;
        if (page.kind !== 'gamepass') throw Error('The backend returned a different library. Refresh to try again.');
        if (cursor && page.cursor === cursor) throw Error('Library pagination did not advance. Refresh to try again.');
        const products = [...new Map([...(options.more ? state.products : []), ...page.products].map(product => [product.productId, product])).values()];
        publish({ loading: false, products, cursor: page.cursor, checkedAt: page.checkedAt, skippedEntitlements: page.skippedEntitlements });
      } catch (error) {
        if (!disposed && revision === request) publish({ ...state, loading: false, error: message(error) });
      }
    },
    dispose() { disposed = true; revision++; },
  };
}
export function gamePassLibraryScope(data: AppSnapshot): string | undefined {
  const account = libraryCollectionKey(data.auth);
  return account && data.backend.available && data.backend.capabilities.library
    ? JSON.stringify([account, data.settings.market, data.backend.binaryPath, data.backend.commit]) : undefined;
}
export function GamePassLibrarySurface({ state, openProduct, load }: {
  state: GamePassLibraryState; openProduct: (product: CatalogProduct) => void; load: (more?: boolean) => void;
}) {
  return <>
    {state.error ? <div className="alert amber" role="alert"><CircleAlert /><span>{state.error}</span><button className="secondary" disabled={state.loading} onClick={() => load(false)}>Try again</button></div> : null}
    {state.skippedEntitlements ? <p className="account-library-note">Some license records could not be verified. This list may be incomplete.</p> : null}
    <div className="catalog-grid" data-gamepad-grid>{state.products.map(product => <article className="catalog-card" data-gamepad-card key={product.productId}>
      <button className="catalog-card-main" type="button" onClick={() => openProduct(product)}>
        {product.posterUrl ? <img src={product.posterUrl} alt={`${product.title} cover`} loading="lazy" /> : <div className="catalog-cover-placeholder"><Gamepad2 /></div>}
        <div><strong title={product.title}>{product.title}</strong><small>{product.publisher ?? product.productId}</small><span>View game details</span></div>
      </button>
    </article>)}</div>
    <div className="library-pagination">{state.loading ? <span className="library-loading" role="status"><LoaderCircle className="spin" />Loading Game Pass games…</span>
      : state.cursor ? <button className="secondary" onClick={() => load(true)}>Load more games</button> : null}</div>
    {!state.loading && !state.error && !state.products.length ? <div className="empty-state compact"><div><Gamepad2 /></div><h2>No Game Pass PC games returned</h2><p>The account provider did not return any supported games. Check your account and refresh.</p></div> : null}
  </>;
}
function GamePassLibrary({ bridge, openProduct }: { bridge: Bridge; openProduct: (product: CatalogProduct) => void }) {
  const [state, setState] = useState<GamePassLibraryState>({ loading: true, products: [] });
  const loader = useRef<ReturnType<typeof createGamePassLibraryLoader>>();
  useEffect(() => {
    const current = createGamePassLibraryLoader(bridge, setState); loader.current = current;
    void current.load();
    return () => { current.dispose(); if (loader.current === current) loader.current = undefined; };
  }, [bridge]);
  const load = (more = false) => { void loader.current?.load({ more, refresh: !more }); };
  return <><div className="collection-tabs"><button className="secondary" disabled={state.loading} onClick={() => load(false)}><RefreshCw />Refresh Game Pass library</button></div><GamePassLibrarySurface state={state} load={load} openProduct={openProduct} /></>;
}
export function GamePassPage({ data, openProduct, bridge }: { data: AppSnapshot; openProduct: (product: CatalogProduct) => void; bridge?: Bridge }) {
  const provider = bridge ?? (typeof window !== 'undefined' ? window.launcher : undefined);
  const scope = gamePassLibraryScope(data);
  const unavailable = !libraryCollectionKey(data.auth) ? 'Sign in and finish account verification to load your Game Pass games.'
    : !data.backend.available ? 'The Xodus backend is offline. Check Settings and try again.'
    : !data.backend.capabilities.library ? 'Update the Xodus backend in Settings to load your account library.'
    : 'This page requires the desktop Xodus Nexus application.';
  return <main className="gamepass-page"><header className="page-header"><div><h1>Game Pass</h1><p>Supported PC games returned by your signed-in account’s library provider.</p></div></header>
    <p className="account-library-note">Availability can change. Your account license is checked again when you install a game.</p>
    {scope && provider ? <GamePassLibrary key={scope} bridge={provider} openProduct={openProduct} /> : <p role="status">{unavailable}</p>}
  </main>;
}
