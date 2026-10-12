import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine, Check, ChevronRight, CircleAlert, CircleUserRound,
  Cog, Download, FolderOpen, Gamepad2, Github, HardDrive, Home, Library,
  LoaderCircle, LogIn, MoreHorizontal, PackageCheck, Play, Plus, RefreshCw, Rocket, Search, Settings2,
  Store, Terminal, Trash2, X,
} from 'lucide-react';
import type { AppSnapshot, CatalogProduct, CatalogSearchResult, Game, GameLaunchOptions, Page, Settings } from '../shared/types';
import { estimateTimeRemaining } from '../shared/utils';
import { runtimeDisplay } from '../shared/runtime-display';

const emptySnapshot: AppSnapshot = {
  backend: {
    available: false, source: 'none', updateAvailable: false, checking: false, updating: false,
    externalRoot: '',
    capabilities: { commands: [], account: false, login: false, logout: false, download: false, streaming: false, run: false },
    prerequisites: { git: false, cargo: false, rustc: false, protoc: false },
  },
  runtime: {
    installed: false, checking: false, updating: false,
    runtimeRoot: '', artifactAvailable: false,
    prerequisites: { gh: false, authenticated: false, tar: false, sha512sum: false },
  },
  games: [], downloads: [],
  settings: {
    installRoot: '', market: 'neutral', parallelDownloads: 4, winePath: '',
    externalXodusRoot: '', runtimeRoot: '', verboseLogs: false,
  },
  auth: { running: false, stored: null, note: '' },
};

type Toast = { kind: 'success' | 'error' | 'info'; message: string };

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'red' }) {
  return <span className={`status-dot ${tone}`} />;
}

function NavItem({ active, icon, label, badge, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void;
}) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
    {icon}<span>{label}</span>{badge ? <b>{badge}</b> : null}
  </button>;
}

function Cover({ game, className = '' }: { game: Game; className?: string }) {
  const local = game.coverDataUrl;
  const art = local ?? game.coverUrl;
  // Local package logos and Store cover art are both square, so they fill
  // the square tiles without cropping; odd-sized local art stays letterboxed.
  if (art) return <img className={`game-cover ${local ? 'cover-local' : 'cover-store'} ${className}`} src={art} alt={`${game.title} artwork`} />;
  return <div className={`cover-placeholder ${className}`}><Gamepad2 /></div>;
}

function StatePill({ game }: { game: Game }) {
  const label = game.installState === 'ready' ? 'Ready' : game.installState === 'incomplete' ? 'Incomplete' : 'Imported';
  return <span className={`state-pill ${game.installState}`}>
    {game.installState === 'ready' ? <Check /> : <CircleAlert />}{label}
  </span>;
}

function SectionTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{action && onClick ? <button onClick={onClick}>{action}<ChevronRight /></button> : null}</div>;
}

function useGameLaunchOptions(game: Game | undefined, data: AppSnapshot): GameLaunchOptions | undefined {
  const [options, setOptions] = useState<GameLaunchOptions>();
  useEffect(() => {
    setOptions(undefined);
    if (!game) return;
    let cancelled = false;
    window.launcher.getGameLaunchOptions(game.id)
      .then((value) => { if (!cancelled) setOptions(value); })
      .catch((error) => { if (!cancelled) setOptions({ cloudSaves: false, cloudReason: errorMessage(error), vcInstall: false, vcReason: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [game?.id, data.settings.winePath, data.settings.runtimeRoot, data.runtime.winePath, data.backend.binaryPath, data.backend.commit, data.backend.available]);
  return options;
}

export function HomePage({ data, go, action }: {
  data: AppSnapshot; go: (page: Page) => void; action: (fn: () => Promise<unknown>, success?: string) => void;
}) {
  const featured = data.games[0];
  const active = data.downloads.find((task) => task.status === 'running');
  const canPlay = Boolean(featured?.installState === 'ready' && data.backend.capabilities.run && (data.settings.winePath || data.runtime.winePath));
  const launchOptions = useGameLaunchOptions(featured, data);
  const spotlightArt = featured?.coverDataUrl ?? featured?.coverUrl;

  return <main className="page home-page">
    <section className={`spotlight ${spotlightArt ? 'has-art' : ''}`} style={spotlightArt ? { '--spotlight-art': `url(${spotlightArt})` } as React.CSSProperties : undefined}>
      <div className="spotlight-copy">
        <span className="overline">{featured ? 'CONTINUE PLAYING' : 'XODUS NEXUS'}</span>
        <h1>{featured?.title ?? 'Your PC games, brought together.'}</h1>
        <p>{featured
          ? featured.installMessage ?? `${featured.publisher ?? 'Local Xbox PC installation'} · Ready in your library`
          : 'Import an existing Xodus installation or install a game you own using its Microsoft Store Product ID.'}</p>
        <div className="button-row">
          {featured && canPlay
            ? <button className="primary" onClick={() => action(() => window.launcher.launchGame(featured.id))}><Play fill="currentColor" />Play</button>
            : <button className="primary" onClick={() => go(featured ? 'settings' : 'library')}><ChevronRight />{featured ? 'Finish setup' : 'Import a game'}</button>}
          <button className="secondary" onClick={() => go('library')}><Library />View library</button>
        </div>
      </div>
      {featured ? <div className="spotlight-meta"><StatePill game={featured} />{launchOptions?.cloudSaves ? <span>Cloud saves</span> : null}<span>{featured.storeId ? `Store ID ${featured.storeId}` : 'Local import'}</span></div> : null}
    </section>

    <SectionTitle title="Recently added" action="See all" onClick={() => go('library')} />
    {data.games.length > 0 ? <div className="poster-row">
      {data.games.slice(0, 6).map((game) => <button className="poster-card" key={game.id} onClick={() => go('library')}>
        <Cover game={game} /><strong>{game.title}</strong><span>{game.publisher ?? (game.storeId ? 'Microsoft Store installation' : 'Local installation')}</span>
      </button>)}
    </div> : <div className="empty-strip"><Gamepad2 /><div><strong>No games imported</strong><span>Your library is built only from real local manifests.</span></div><button className="secondary" onClick={() => go('library')}>Import folder</button></div>}

    <SectionTitle title="Quick access" />
    <div className="quick-grid">
      <button onClick={() => go('store')}><Store /><span><strong>Install a game</strong><small>Use a verified Product ID</small></span><ChevronRight /></button>
      <button onClick={() => go('downloads')}><Download /><span><strong>{active ? active.title : 'Install queue'}</strong><small>{active ? active.phase : 'No active downloads'}</small></span><ChevronRight /></button>
      <button onClick={() => go('settings')}><Settings2 /><span><strong>Xodus runtime</strong><small>{data.runtime.installed ? 'Custom runtime ready' : 'Runtime setup required'}</small></span><ChevronRight /></button>
    </div>
    <div className="support-bar"><CircleAlert /><div><strong>Compatibility status</strong><span>Package ownership and installation do not guarantee Wine, GameRuntime, or anti-cheat compatibility. Unsupported features are labelled explicitly.</span></div></div>
  </main>;
}

function StorePage({ data, toast, go, initialQuery }: { data: AppSnapshot; toast: (value: Toast) => void; go: (page: Page) => void; initialQuery: string }) {
  const [catalog, setCatalog] = useState<CatalogSearchResult>();
  const [featured, setFeatured] = useState<CatalogSearchResult>();
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string>();
  const [selected, setSelected] = useState<CatalogProduct>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [manualProductId, setManualProductId] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [destination, setDestination] = useState(data.settings.installRoot);
  const [busy, setBusy] = useState<string>();
  useEffect(() => { if (!selected) setDestination(data.settings.installRoot); }, [data.settings.installRoot, selected]);
  useEffect(() => {
    if (initialQuery.trim().length < 2) return;
    let cancelled = false;
    window.launcher.searchCatalog(initialQuery).then((result) => {
      if (!cancelled) { setCatalog(result); setSelected(undefined); }
    }).catch((error) => { if (!cancelled) toast({ kind: 'error', message: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [initialQuery]);
  useEffect(() => {
    let cancelled = false;
    window.launcher.getFeaturedCatalog()
      .then((result) => { if (!cancelled) setFeatured(result); })
      .catch((error) => { if (!cancelled) setFeaturedError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setFeaturedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function installDestination(product: CatalogProduct): string {
    const folder = product.title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || product.productId;
    return `${data.settings.installRoot.replace(/\/+$/, '')}/${folder}`;
  }

  function selectProduct(product: CatalogProduct) {
    setSelected(product);
    setDestination(installDestination(product));
  }

  async function loadMore() {
    if (!catalog?.cursor) return;
    setLoadingMore(true);
    try {
      const next = await window.launcher.searchCatalog(catalog.query, catalog.cursor);
      setCatalog({ ...next, products: [...catalog.products, ...next.products] });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setLoadingMore(false); }
  }

  async function install(product: CatalogProduct, target = installDestination(product)) {
    setBusy(product.productId);
    try {
      await window.launcher.startInstall({ productId: product.installProductId ?? product.productId, title: product.title, destination: target });
      toast({ kind: 'success', message: `Xodus is checking the license and installing ${product.title}.` });
      go('downloads');
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setBusy(undefined); }
  }

  async function manualInstall(event: FormEvent) {
    event.preventDefault(); setBusy('manual');
    try {
      await window.launcher.startInstall({ productId: manualProductId, title: manualTitle, destination });
      toast({ kind: 'success', message: 'Xodus streaming started.' }); go('downloads');
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setBusy(undefined); }
  }

  async function chooseDestination() {
    const selected = await window.launcher.chooseDirectory(destination);
    if (selected) setDestination(selected);
  }

  const installedIds = new Set(data.games.flatMap((game) => game.storeId?.toUpperCase() ?? []));
  const isInstalled = (product: CatalogProduct) => installedIds.has(product.productId) || Boolean(product.installProductId && installedIds.has(product.installProductId));
  const productGrid = (products: CatalogProduct[]) => <div className="catalog-grid">{products.map((product) => {
    const installed = isInstalled(product);
    return <article className={`catalog-card ${selected?.productId === product.productId ? 'selected' : ''}`} key={product.productId}>
      <button className="catalog-card-main" onClick={() => selectProduct(product)}>{product.posterUrl ? <img src={product.posterUrl} alt={`${product.title} cover`} /> : <div className="catalog-cover-placeholder"><Gamepad2 /></div>}<span className={`catalog-support ${product.installability}`}>{product.installability === 'supported' ? 'PC' : product.installability === 'unknown' ? '?' : 'Unsupported'}</span><div><strong>{product.title}</strong><small>{product.publisher ?? product.productId}</small><span>{product.purchasePrice ?? 'Price unavailable'}{product.includedWith ? ` · ${product.includedWith}` : ''}</span></div></button>
      <button className="catalog-card-install" disabled={product.installability !== 'supported' || Boolean(busy) || !data.backend.capabilities.streaming || installed} onClick={() => install(product)}>{busy === product.productId ? <LoaderCircle className="spin" /> : installed ? <Check /> : <Download />}{installed ? 'Installed' : 'Install'}</button>
    </article>;
  })}</div>;
  return <main className="page store-page">
    <header className="page-header"><div><h1>Store</h1></div><span className="catalog-source"><StatusDot />Microsoft Store</span></header>
    {!catalog ? <section className="featured-catalog"><SectionTitle title="Featured" />{featuredLoading ? <div className="catalog-loading"><LoaderCircle className="spin" /><span>Loading live Store collection…</span></div> : featured?.products.length ? <><div className="featured-rail">{featured.products.slice(0, 3).map((product) => <button className="featured-tile" key={product.productId} onClick={() => selectProduct(product)}>{product.heroUrl || product.posterUrl ? <img src={product.heroUrl ?? product.posterUrl} alt="" /> : <div className="featured-tile-placeholder"><Gamepad2 /></div>}<span className="featured-tile-copy"><strong>{product.title}</strong><small>{product.publisher ?? 'Microsoft Store'} · {product.installability === 'supported' ? 'PC package verified' : 'Check package support'}</small></span></button>)}</div><SectionTitle title="Trending PC games" />{productGrid(featured.products.slice(3))}</> : <div className="catalog-empty"><Store /><h2>Featured games are temporarily unavailable</h2><p>{featuredError ?? 'Search still works with live Microsoft Store data.'}</p></div>}</section> : null}

    {selected ? <section className={`catalog-selection ${selected.heroUrl ? 'has-art' : ''}`} style={selected.heroUrl ? { '--catalog-hero': `url(${selected.heroUrl})` } as React.CSSProperties : undefined}>
      <div className="catalog-selection-copy"><span className="overline">SELECTED PRODUCT</span><h2>{selected.title}</h2><div className="catalog-badges">{selected.purchasePrice ? <span>{selected.purchasePrice}</span> : null}{selected.includedWith ? <span className="pass">Available with {selected.includedWith}</span> : null}<span className={selected.installability}>{selected.installability === 'supported' ? 'PC MSIXVC verified' : selected.installability}</span></div><p>{selected.description}</p><small>{selected.publisher ?? 'Publisher unavailable'} · Store ID {selected.productId}{selected.installProductId ? ` · Package ID ${selected.installProductId}` : ''}</small></div>
      <div className="catalog-install-box"><p className={selected.installability === 'supported' ? 'supported' : 'unsupported'}>{selected.supportNote}</p><label>Install location<div className="input-action"><input value={destination} onChange={(event) => setDestination(event.target.value)} /><button type="button" onClick={chooseDestination} title="Choose folder"><FolderOpen /></button></div></label><div className="button-row"><button className="primary" disabled={selected.installability !== 'supported' || Boolean(busy) || !data.backend.capabilities.streaming || isInstalled(selected)} onClick={() => install(selected, destination)}>{busy === selected.productId ? <LoaderCircle className="spin" /> : isInstalled(selected) ? <Check /> : <ArrowDownToLine />}{isInstalled(selected) ? 'Installed' : 'Install with Xodus'}</button>{selected.storeUrl ? <button className="secondary" onClick={() => window.open(selected.storeUrl, '_blank')}>Store page</button> : null}</div></div>
    </section> : null}

    {catalog ? <><SectionTitle title={`Results for “${catalog.query}”`} />{productGrid(catalog.products)}{catalog.products.length === 0 ? <div className="empty-state compact"><div><Search /></div><h2>No games found</h2><p>Try a different title or a Microsoft Store Product ID.</p></div> : null}{catalog.hasMore ? <div className="load-more"><button className="secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <LoaderCircle className="spin" /> : <Plus />}Load more results</button></div> : null}</> : null}

    <SectionTitle title="Install by Product ID" />
    <form className="manual-install" onSubmit={manualInstall}><label>Product ID<input value={manualProductId} onChange={(event) => setManualProductId(event.target.value)} placeholder="For example: 9N4PT8HGCDHQ" required /></label><label>Queue name <em>Optional</em><input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} /></label><label>Install location<div className="input-action"><input value={destination} onChange={(event) => setDestination(event.target.value)} required /><button type="button" onClick={chooseDestination}><FolderOpen /></button></div></label><button className="secondary" disabled={Boolean(busy) || !data.backend.capabilities.streaming}>{busy === 'manual' ? <LoaderCircle className="spin" /> : <Terminal />}Install unlisted ID</button></form>
  </main>;
}

export function GameContextMenu({ x, y, game, options, busy, onBrowse, onSettings, onInstallVc, onRemove }: {
  x: number; y: number; game: Game; options?: GameLaunchOptions; busy: boolean;
  onBrowse: () => void; onSettings: () => void; onInstallVc: () => void; onRemove: () => void;
}) {
  return <div className="game-context-menu" role="menu" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}>
    <button role="menuitem" onClick={onBrowse}><FolderOpen />Browse game files</button>
    <button role="menuitem" onClick={onSettings}><Settings2 />Game settings</button>
    <button role="menuitem" disabled={busy || game.installState !== 'ready' || !options?.vcInstall} title={options?.vcReason} onClick={onInstallVc}><Download />Install / update VC++</button>
    <button role="menuitem" className="danger" onClick={onRemove}><Trash2 />Remove game…</button>
  </div>;
}

export function LibraryPage({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  const [dialogGame, setDialogGame] = useState<{ id: string; kind: 'settings' | 'remove' }>();
  const [editTitle, setEditTitle] = useState('');
  const [editLocale, setEditLocale] = useState('');
  const [localeOptions, setLocaleOptions] = useState<string[]>([]);
  const [dialogBusy, setDialogBusy] = useState(false);
  const selected = data.games.find((game) => game.id === selectedId) ?? data.games[0];
  useEffect(() => { if (!selectedId && data.games[0]) setSelectedId(data.games[0].id); }, [data.games, selectedId]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', escape); };
  }, [menu]);

  function openMenu(game: Game, x: number, y: number) {
    setSelectedId(game.id);
    setMenu({ id: game.id, x: Math.max(8, Math.min(x, window.innerWidth - 230)), y: Math.max(8, Math.min(y, window.innerHeight - 210)) });
  }

  function openDialog(game: Game, kind: 'settings' | 'remove') {
    setMenu(undefined);
    setEditTitle(game.title);
    setEditLocale(game.locale ?? '');
    setLocaleOptions([]);
    if (kind === 'settings') void window.launcher.getGameLocales(game.id).then(setLocaleOptions).catch((error) => toast({ kind: 'error', message: errorMessage(error) }));
    setDialogGame({ id: game.id, kind });
  }

  async function saveGameSettings(event: FormEvent) {
    event.preventDefault();
    if (!dialogGame) return;
    setDialogBusy(true);
    try {
      await window.launcher.updateGame(dialogGame.id, { title: editTitle.trim(), locale: editLocale });
      toast({ kind: 'success', message: 'Game settings saved.' });
      setDialogGame(undefined);
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setDialogBusy(false); }
  }

  async function removeGame(mode: 'library' | 'trash-files') {
    if (!dialogGame) return;
    setDialogBusy(true);
    try {
      await window.launcher.removeGame(dialogGame.id, mode);
      setSelectedId(undefined);
      setDialogGame(undefined);
      toast({ kind: 'success', message: mode === 'library' ? 'Removed from library. Game files were kept.' : 'Game folder moved to Trash.' });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setDialogBusy(false); }
  }

  async function importGame() {
    try {
      const game = await window.launcher.importGame();
      if (game) { setSelectedId(game.id); toast({ kind: 'success', message: `Imported ${game.title}.` }); }
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function play() {
    if (!selected) return;
    try { await window.launcher.launchGame(selected.id); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function stopGame() {
    try { await window.launcher.cancelGame(); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function installVc(game: Game) {
    try {
      await window.launcher.installGameVcRuntime(game.id);
      toast({ kind: 'success', message: 'Microsoft VC++ is ready in this game’s Proton prefix. Press Play.' });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function updateInstalledGame() {
    if (!selected || !window.confirm(`Check and update ${selected.title}? Xodus may replace changed game files in place. Do not run the game until the update finishes.`)) return;
    try {
      await window.launcher.updateInstalledGame(selected.id);
      toast({ kind: 'success', message: `Update started for ${selected.title}. See Install Queue.` });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  const selectedOperation = selected && data.gameOperation?.gameId === selected.id ? data.gameOperation : undefined;
  const gameBusy = Boolean(selectedOperation && ['preparing', 'running', 'stopping'].includes(selectedOperation.status));
  const launchOptions = useGameLaunchOptions(selected, data);
  const menuGame = data.games.find((game) => game.id === menu?.id);
  const modalGame = data.games.find((game) => game.id === dialogGame?.id);
  return <main className="page library-page">
    <header className="page-header"><div><h1>My Library</h1><p>Only games verified from local Xbox manifests are shown.</p></div><button className="secondary" onClick={importGame}><Plus />Import game</button></header>
    {data.games.length === 0 ? <div className="empty-state"><div><Library /></div><h2>Your library is empty</h2><p>Select a folder containing MicrosoftGame.config or appxmanifest.xml.</p><button className="primary" onClick={importGame}>Import a game</button></div> : <div className="library-layout">
      <div className="library-grid">{data.games.map((game) => <div className="library-card-wrap" key={game.id} onContextMenu={(event) => { event.preventDefault(); openMenu(game, event.clientX, event.clientY); }}><button className={`library-card ${selected?.id === game.id ? 'selected' : ''}`} onClick={() => setSelectedId(game.id)} onKeyDown={(event) => { if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(game, rect.left + 16, rect.top + 16); } }}><Cover game={game} /><strong>{game.title}</strong><span>{game.publisher ?? 'Local installation'}</span></button><button className="library-card-menu-button" title={`Options for ${game.title}`} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); openMenu(game, rect.right, rect.bottom); }}><MoreHorizontal /></button></div>)}</div>
      {selected ? <aside className="game-detail">
        <div className="detail-art"><Cover game={selected} /><div className="detail-shade" /><div><StatePill game={selected} /><h2>{selected.title}</h2><span>{selected.publisher ?? 'Publisher not provided'}</span></div></div>
        {selected.installMessage ? <div className="alert amber"><CircleAlert /><span>{selected.installMessage}</span></div> : null}
        <dl><div><dt>Store ID</dt><dd>{selected.storeId ?? 'Not found'}</dd></div><div><dt>Executable</dt><dd>{selected.executable ?? 'Not found'}</dd></div><div><dt>Location</dt><dd title={selected.path}>{selected.path}</dd></div></dl>
        <div className="detail-actions">
          <button className="primary" disabled={gameBusy || selected.installState !== 'ready' || !data.backend.capabilities.run || !(data.settings.winePath || data.runtime.winePath)} onClick={() => play()}>{gameBusy ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}{gameBusy ? 'Working…' : 'Play'}</button>
          <button className="secondary" disabled={gameBusy || !selected.storeId || selected.installState !== 'ready' || !data.backend.capabilities.streaming || data.downloads.some((task) => task.status === 'running')} onClick={updateInstalledGame} title="Check and download changed game files with Xodus"><RefreshCw />Check for updates</button>
          {gameBusy && !(selectedOperation?.kind === 'prerequisite' && selectedOperation.status === 'running') ? <button className="secondary danger" onClick={stopGame}><X />Stop</button> : null}
          <button className="icon-button" onClick={() => window.launcher.openPath(selected.path)} title="Open game folder"><FolderOpen /></button>
        </div>
        {selectedOperation ? <div className={`game-operation ${selectedOperation.status}`}><div><strong>{selectedOperation.kind === 'prerequisite' ? selectedOperation.status === 'failed' ? 'Prerequisite failed' : selectedOperation.status === 'complete' ? 'Prerequisite ready' : 'Installing prerequisite' : selectedOperation.status === 'failed' ? 'Launch failed' : selectedOperation.status === 'complete' ? 'Game exited' : 'Launching game'}</strong><span>{selectedOperation.phase}</span></div>{selectedOperation.log.length > 0 ? <pre>{selectedOperation.log.slice(-12).join('\n')}</pre> : null}{selectedOperation.logPath ? <button className="secondary" onClick={() => window.launcher.openPath(selectedOperation.logPath!)}><FolderOpen />Open diagnostic log</button> : null}</div> : null}
      </aside> : null}
    </div>}
    {menu && menuGame ? <GameContextMenu x={menu.x} y={menu.y} game={menuGame} options={launchOptions} busy={gameBusy}
      onBrowse={() => { setMenu(undefined); void window.launcher.openPath(menuGame.path).catch((error) => toast({ kind: 'error', message: errorMessage(error) })); }}
      onSettings={() => openDialog(menuGame, 'settings')}
      onInstallVc={() => { setMenu(undefined); void installVc(menuGame); }}
      onRemove={() => openDialog(menuGame, 'remove')} /> : null}
    {dialogGame && modalGame ? <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogBusy) setDialogGame(undefined); }}><section className="game-dialog" role="dialog" aria-modal="true" aria-label={dialogGame.kind === 'remove' ? `Remove ${modalGame.title}` : `Settings for ${modalGame.title}`}>
      {dialogGame.kind === 'remove' ? <><h2>Remove {modalGame.title}?</h2><p>Keep the files, or move this installation folder to Trash. Saves stored outside this folder are not affected.</p><code className="remove-path">{modalGame.path}</code><div className="dialog-actions"><button className="secondary" disabled={dialogBusy} onClick={() => setDialogGame(undefined)}>Cancel</button><button className="secondary" disabled={dialogBusy} onClick={() => removeGame('library')}>Keep files</button><button className="secondary danger" disabled={dialogBusy} onClick={() => removeGame('trash-files')}><Trash2 />Move files to Trash</button></div></> : <form onSubmit={saveGameSettings}><h2>Game settings</h2><label>Display name<input required value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label><label>Game language<select value={editLocale} onChange={(event) => setEditLocale(event.target.value)}><option value="">System default</option>{localeOptions.map((locale) => <option key={locale} value={locale}>{locale}</option>)}{editLocale && !localeOptions.some((locale) => locale.toLowerCase() === editLocale.toLowerCase()) ? <option value={editLocale}>{editLocale}</option> : null}</select></label><p>Available languages come from the game manifest. All games use the active Xodus Runtime.</p><div className="dialog-actions"><button type="button" className="secondary" disabled={dialogBusy} onClick={() => setDialogGame(undefined)}>Cancel</button><button className="primary" disabled={dialogBusy || !editTitle.trim()}><Check />Save</button></div></form>}
    </section></div> : null}
  </main>;
}

function DownloadsPage({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const [expanded, setExpanded] = useState<string>();
  const [retrying, setRetrying] = useState<string>();
  async function cancel(id: string) {
    try { await window.launcher.cancelDownload(id); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function remove(id: string) {
    try { await window.launcher.removeDownload(id); if (expanded === id) setExpanded(undefined); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function clearFinished() {
    try { await window.launcher.clearFinishedDownloads(); setExpanded(undefined); toast({ kind: 'success', message: 'Finished queue entries cleared. Game files were kept.' }); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function retry(task: AppSnapshot['downloads'][number]) {
    setRetrying(task.id);
    try {
      if (task.kind === 'update' && task.gameId) await window.launcher.updateInstalledGame(task.gameId);
      else await window.launcher.startInstall({ productId: task.productId, title: task.title, destination: task.destination });
      toast({ kind: 'success', message: `Retrying ${task.title} with Xodus.` });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setRetrying(undefined); }
  }

  const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GiB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MiB` : `${Math.round(bytes / 1024)} KiB`;
  const finishedCount = data.downloads.filter((task) => task.status !== 'running' && task.status !== 'queued').length;
  return <main className="page downloads-page">
    <header className="page-header"><div><h1>Install Queue</h1></div>{finishedCount ? <button className="secondary" onClick={clearFinished}><Trash2 />Clear finished</button> : null}</header>
    {data.downloads.length === 0 ? <div className="empty-state"><div><Download /></div><h2>Nothing in the queue</h2><p>Installations started from Store will appear here.</p></div> : <div className="download-list">{data.downloads.map((task) => {
      const running = task.status === 'running'; const failed = task.status === 'failed';
      return <article className={`download-item ${task.status}`} key={task.id}>
        <div className="download-status">{task.coverUrl ? <img className="download-cover" src={task.coverUrl} alt={`${task.title} artwork`} /> : running ? <LoaderCircle className="spin" /> : failed ? <CircleAlert /> : task.status === 'complete' ? <PackageCheck /> : <X />}{task.coverUrl && (running || failed) ? <span className={`download-badge ${failed ? 'failed' : ''}`}>{running ? <LoaderCircle className="spin" /> : <CircleAlert />}</span> : null}</div>
        <div className="download-main"><div className="download-heading"><div><h3>{task.kind === 'update' ? `Update · ${task.title}` : task.title}</h3><span>{task.productId} · {task.destination}</span></div><strong>{task.progress === null ? (running ? 'Active' : task.status) : `${Math.round(task.progress)}%`}</strong></div><div className={`progress-track ${task.progress === null && running ? 'indeterminate' : ''}`}><i style={task.progress !== null ? { width: `${task.progress}%` } : undefined} /></div><p className={failed ? 'error-text' : ''}>{task.error ?? task.phase}{task.totalBytes ? ` · ${size(task.downloadedBytes ?? 0)} / ${size(task.totalBytes)}` : ''}{task.transferRate ? ` · ${task.transferRate}` : ''}{running && estimateTimeRemaining(task.transferRate, task.downloadedBytes, task.totalBytes) ? ` · ${estimateTimeRemaining(task.transferRate, task.downloadedBytes, task.totalBytes)}` : ''}</p>{expanded === task.id ? <pre className="task-log">{task.log.length ? task.log.join('\n') : 'Xodus has not emitted text output yet.'}</pre> : null}</div>
        <div className="download-actions">{running ? <button onClick={() => cancel(task.id)} title="Stop"><X /></button> : null}{failed || task.status === 'cancelled' ? <button disabled={Boolean(retrying) || data.downloads.some((entry) => entry.status === 'running')} onClick={() => retry(task)} title="Retry installation"><RefreshCw className={retrying === task.id ? 'spin' : ''} /></button> : null}<button onClick={() => setExpanded(expanded === task.id ? undefined : task.id)} title="Show log"><Terminal /></button><button onClick={() => window.launcher.openPath(task.destination)} title="Open folder"><FolderOpen /></button>{task.status !== 'running' && task.status !== 'queued' ? <button onClick={() => remove(task.id)} title="Remove from queue"><Trash2 /></button> : null}</div>
      </article>;
    })}</div>}
  </main>;
}

function ToggleStatus({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`dependency ${ok ? 'ok' : ''}`}>{ok ? <Check /> : <X />}{label}</span>;
}

export function SettingsPage({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const [form, setForm] = useState<Settings>(data.settings);
  const [busy, setBusy] = useState<string>();
  const [logs, setLogs] = useState<string[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>([]);
  useEffect(() => setForm(data.settings), [data.settings]);
  useEffect(() => window.launcher.onOperationLog(({ scope, line }) => {
    if (scope === 'backend') setLogs((items) => [...items.slice(-199), line]);
    if (scope === 'runtime') setRuntimeLogs((items) => [...items.slice(-199), line]);
  }), []);

  async function invoke(name: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(name);
    try { await fn(); if (success) toast({ kind: 'success', message: success }); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setBusy(undefined); }
  }

  async function pick(kind: 'install' | 'backend' | 'runtime' | 'wine') {
    const selected = kind === 'wine'
      ? await window.launcher.chooseFile(form.winePath)
      : await window.launcher.chooseDirectory(kind === 'install' ? form.installRoot : kind === 'backend' ? form.externalXodusRoot : form.runtimeRoot);
    if (selected) setForm((current) => ({ ...current, [kind === 'install' ? 'installRoot' : kind === 'backend' ? 'externalXodusRoot' : kind === 'runtime' ? 'runtimeRoot' : 'winePath']: selected }));
  }

  const caps = data.backend.capabilities;
  const runtimeInfo = runtimeDisplay(data.runtime);
  return <main className="page settings-page">
    <header className="page-header"><div><h1>Settings</h1><p>Account, backend, runtime, and storage.</p></div></header>

    <section className="settings-card compact launcher-card">
      <div className="settings-heading"><div className="settings-icon"><Rocket /></div><div><span className="overline">XODUS NEXUS</span><h2>{data.launcherUpdate?.currentVersion ?? 'Development build'}</h2><p>{data.launcherUpdate?.latestVersion ? `Version ${data.launcherUpdate.latestVersion} is available — re-run the install script or download the new AppImage.` : 'Check GitHub for launcher updates.'}</p></div></div>
      <div className="button-row">
        {data.launcherUpdate?.releaseUrl ? <a className="primary" href={data.launcherUpdate.releaseUrl} target="_blank" rel="noreferrer"><ArrowDownToLine />Download update</a> : null}
        <button className="secondary" disabled={data.launcherUpdate?.checking} onClick={() => invoke('update-check', () => window.launcher.checkLauncherUpdate(), 'Update check finished.')}>{data.launcherUpdate?.checking ? <LoaderCircle className="spin" /> : <RefreshCw />}Check for updates</button>
      </div>
    </section>

    <section className="settings-card account-card">
      <div className="settings-heading"><div className="account-avatar large"><CircleUserRound /></div><div><span className="overline">MICROSOFT ACCOUNT</span><h2>{data.auth.username ?? (data.auth.stored === false ? 'Not signed in' : 'Account status unavailable')}</h2><p>{data.auth.stored === true ? 'Credentials stored by Xodus' : 'Authentication uses the original Xodus webview'}</p></div><span className={`status-label ${data.auth.stored === true ? 'ready' : data.auth.stored === false ? 'off' : 'unknown'}`}><StatusDot tone={data.auth.stored === true ? 'green' : data.auth.stored === false ? 'red' : 'amber'} />{data.auth.stored === true ? 'STORED' : data.auth.stored === false ? 'SIGNED OUT' : 'UNKNOWN'}</span></div>
      <div className="account-note"><CircleAlert /><span>{data.auth.note}</span></div>
      <div className="button-row"><button className="primary" disabled={!caps.login || data.auth.running} onClick={() => invoke('login', () => window.launcher.login(), 'Xodus sign-in completed.')}>{data.auth.running ? <LoaderCircle className="spin" /> : <LogIn />}{data.auth.stored ? 'Sign in again' : 'Sign in with Xodus'}</button><button className="secondary" disabled={!caps.logout || data.auth.running || data.auth.stored === false} onClick={() => invoke('logout', () => window.launcher.logout(), 'Stored Xodus user credentials were removed.')}>Sign out</button><button className="secondary" disabled={!caps.account || data.auth.running} onClick={() => invoke('account', () => window.launcher.refreshAccount())}><RefreshCw />Refresh status</button></div>
    </section>

    <section className="settings-card">
      <div className="settings-heading"><div className="settings-icon"><Terminal /></div><div><h2>Xodus backend</h2><p>{data.backend.version ? `Nexus backend ${data.backend.version}` : data.backend.available ? 'Ready to use' : 'Install the prebuilt Nexus backend'}</p></div><span className={`status-label ${data.backend.available ? 'ready' : 'off'}`}><StatusDot tone={data.backend.available ? 'green' : 'red'} />{data.backend.available ? 'VALIDATED' : 'OFFLINE'}</span></div>
      {data.backend.blockReason ? <div className="alert amber"><CircleAlert /><span>{data.backend.blockReason}</span></div> : null}
      {data.backend.phase ? <p className="runtime-phase">{data.backend.phase}</p> : null}
      <div className="button-row end"><button className="secondary" disabled={Boolean(busy) || data.backend.checking || data.backend.updating} onClick={() => invoke('backend-check', async () => { const status = await window.launcher.checkBackendUpdate(); if (!status.releaseAvailable) throw new Error(status.blockReason ?? 'No compatible backend release is available.'); })}>{busy === 'backend-check' || data.backend.checking ? <LoaderCircle className="spin" /> : <RefreshCw />}Check for updates</button><button className="primary" disabled={Boolean(busy) || data.backend.updating || data.backend.checking} onClick={() => invoke('backend-update', () => window.launcher.updateBackend(), 'The Nexus backend was verified, installed and activated.')}>{busy === 'backend-update' || data.backend.updating ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}{data.backend.available ? 'Install / update backend' : 'Install backend'}</button></div>
    </section>

    <section className="settings-card">
      <div className="settings-heading"><div className="settings-icon"><Gamepad2 /></div><div><h2>{runtimeInfo.title}</h2><p>{runtimeInfo.version}</p></div><span className={`status-label ${data.runtime.installed ? 'ready' : 'unknown'}`}><StatusDot tone={data.runtime.installed ? 'green' : 'amber'} />{data.runtime.installed ? 'READY' : 'MISSING'}</span></div>
      {data.runtime.error ? <div className="alert amber"><CircleAlert /><span>{data.runtime.error}</span></div> : null}{data.runtime.phase ? <div className="runtime-phase"><LoaderCircle className={data.runtime.updating ? 'spin' : ''} /><span>{data.runtime.phase}</span></div> : null}
      <div className="button-row end">
        <button className="secondary" disabled={Boolean(busy) || data.runtime.nexusChecking} onClick={() => invoke('runtime-check', async () => { const status = await window.launcher.checkNexusRuntime(); if (!status.nexusAvailable) throw new Error(status.nexusError ?? 'No published Nexus runtime is available.'); })}>{busy === 'runtime-check' || data.runtime.nexusChecking ? <LoaderCircle className="spin" /> : <RefreshCw />}Check for updates</button>
        {data.runtime.nexusAvailable ? <button className="primary" disabled={Boolean(busy) || data.runtime.updating} onClick={() => invoke('runtime-install-nexus', () => window.launcher.installNexusRuntime(), 'Nexus runtime was verified, installed, and selected.')}>{busy === 'runtime-install-nexus' || data.runtime.updating ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}Install Nexus runtime{data.runtime.nexusVersion ? ` ${data.runtime.nexusVersion.replace(/^runtime-/, '')}` : ''}</button> : null}
      </div>
      {data.runtime.updating || runtimeLogs.length > 0 ? <pre className="build-log">{runtimeLogs.join('\n') || 'Waiting for output…'}</pre> : null}
    </section>

    <div className="settings-storage">
      <section className="settings-card compact"><div className="settings-heading"><div className="settings-icon"><HardDrive /></div><div><h2>Storage and launch paths</h2><p>The external Xodus checkout is never modified.</p></div></div><div className="form-grid"><label>Default game location<div className="input-action"><input value={form.installRoot} onChange={(event) => setForm({ ...form, installRoot: event.target.value })} /><button onClick={() => pick('install')}><FolderOpen /></button></div></label><label>Market<input value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} /></label><label>Parallel streams<input type="number" min="1" max="16" value={form.parallelDownloads} onChange={(event) => setForm({ ...form, parallelDownloads: Number(event.target.value) })} /></label><label>External Xodus source<div className="input-action"><input value={form.externalXodusRoot} onChange={(event) => setForm({ ...form, externalXodusRoot: event.target.value })} /><button onClick={() => pick('backend')}><FolderOpen /></button></div></label><label>Versioned runtime directory<div className="input-action"><input value={form.runtimeRoot} onChange={(event) => setForm({ ...form, runtimeRoot: event.target.value })} /><button onClick={() => pick('runtime')}><FolderOpen /></button></div></label><label>Wine / Xodus Proton binary<div className="input-action"><input value={form.winePath} onChange={(event) => setForm({ ...form, winePath: event.target.value })} placeholder="Selected automatically by the runtime manager" /><button onClick={() => pick('wine')}><FolderOpen /></button></div></label></div><div className="save-row"><span>Settings are stored locally in Electron userData.</span><button className="primary" disabled={busy === 'save'} onClick={() => invoke('save', () => window.launcher.updateSettings(form), 'Settings saved.')}>{busy === 'save' ? <LoaderCircle className="spin" /> : <Check />}Save</button></div></section>
    </div>
    <details className="settings-card settings-diagnostics">
      <summary><Settings2 /><span>Advanced / Diagnostics</span><ChevronRight /></summary>
      <div className="diagnostics-content">
        <section><h3>Game logging</h3><div className="toggle-row"><label className="toggle"><input type="checkbox" checked={form.verboseLogs} onChange={(event) => setForm({ ...form, verboseLogs: event.target.checked })} /><span>Verbose game logs</span></label><p>Writes full Wine, vkd3d-proton and Xodus diagnostics to the per-game log file and stops coalescing repeated lines. Slower and much larger logs; use temporarily when diagnosing a crash.</p></div><div className="button-row"><button className="secondary" disabled={Boolean(busy)} onClick={() => invoke('save-diagnostics', () => window.launcher.updateSettings({ verboseLogs: form.verboseLogs }), 'Logging settings saved.')}>Save diagnostics</button></div></section>
        <section><h3>Backend details</h3><p className="diagnostic-path mono">{data.backend.binaryPath ?? 'No backend selected'}</p><div className="meta-grid"><div><span>SOURCE</span><strong>{data.backend.source === 'external' ? 'External installation · read-only' : data.backend.delivery === 'release' ? 'Nexus GitHub Release' : data.backend.source === 'managed' ? 'Local versioned build' : '—'}</strong></div><div><span>COMMIT</span><strong className="mono">{data.backend.commit?.slice(0, 12) ?? '—'}</strong></div></div><button className="secondary" disabled={Boolean(busy) || data.backend.updating || data.backend.checking} onClick={() => invoke('backend-rebuild', () => window.launcher.rebuildBackend(), 'Pinned backend source was built and activated.')}><Github />Build backend from source</button>{data.backend.updating || logs.length > 0 ? <pre className="build-log">{logs.join('\n') || 'Waiting for backend output…'}</pre> : null}</section>
        <section><h3>Runtime details</h3><p className="diagnostic-path mono">{data.runtime.winePath ?? 'No runtime selected'}</p><div className="meta-grid"><div><span>SOURCE</span><strong>{runtimeInfo.source}</strong></div><div><span>BUILD</span><strong className="mono">{data.runtime.commit ?? '—'}</strong></div><div><span>UPSTREAM</span><strong className="mono">{data.runtime.upstreamCommit?.slice(0, 12) ?? 'Not checked'}</strong></div></div><div className="capability-row"><span>Required tools</span><ToggleStatus ok={data.runtime.prerequisites.gh} label="gh" /><ToggleStatus ok={data.runtime.prerequisites.authenticated} label="GitHub authentication" /><ToggleStatus ok={data.runtime.prerequisites.tar} label="tar/xz" /><ToggleStatus ok={data.runtime.prerequisites.sha512sum} label="SHA-512" /></div>{data.runtime.artifactExpiresAt ? <p className="fine-print">Upstream artifact expiry: {new Date(data.runtime.artifactExpiresAt).toLocaleDateString('en-US')}</p> : null}</section>
        <section><h3>Upstream runtime tools</h3><div className="button-row"><button className="secondary" disabled={Boolean(busy) || data.runtime.checking} onClick={() => invoke('runtime-upstream-check', () => window.launcher.checkRuntimeUpdate())}>{busy === 'runtime-upstream-check' || data.runtime.checking ? <LoaderCircle className="spin" /> : <RefreshCw />}Check upstream snapshot</button><button className="secondary" disabled={Boolean(busy) || data.runtime.updating} onClick={() => invoke('runtime-install', () => window.launcher.installRuntime(), 'Upstream Xodus Proton runtime was verified, installed, and selected.')}>{busy === 'runtime-install' || data.runtime.updating ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}Install upstream snapshot</button>{data.runtime.name?.includes('-xgamesave-pr28-') ? <button className="secondary" disabled={Boolean(busy) || data.runtime.updating} onClick={() => invoke('runtime-rollback-preview', () => window.launcher.rollbackRuntimePreview(), 'The previous runtime is active again.')}>Use previous runtime</button> : null}</div></section>
        <section><h3>Build dependencies</h3><div className="dependency-grid"><ToggleStatus ok={data.backend.prerequisites.git} label="Git" /><ToggleStatus ok={data.backend.prerequisites.cargo} label="Cargo" /><ToggleStatus ok={data.backend.prerequisites.rustc} label="Rust ≥ 1.98" /><ToggleStatus ok={data.backend.prerequisites.protoc} label="protoc" /></div><p className="fine-print">Building Xodus also requires GTK 3, WebKitGTK 4.1, libsoup 3, and their development packages.</p></section>
      </div>
    </details>
  </main>;
}

function FirstRunWizard({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const [installRoot, setInstallRoot] = useState(data.settings.installRoot);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function browse() {
    try {
      const picked = await window.launcher.chooseDirectory(installRoot);
      if (picked) setInstallRoot(picked);
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function signIn() {
    setSigningIn(true);
    try { await window.launcher.login(); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setSigningIn(false); }
  }
  async function finish() {
    setSaving(true);
    try {
      await window.launcher.updateSettings({ installRoot, firstRunCompleted: true });
      toast({ kind: 'success', message: 'Welcome to Xodus Nexus. Install a game from the Store to get started.' });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setSaving(false); }
  }

  return <div className="wizard-overlay">
    <div className="wizard">
      <div><span className="overline">WELCOME</span><h1>Set up Xodus Nexus</h1></div>
      <p>Choose where games install. Everything else can be changed later in Settings.</p>
      <label className="wizard-field">Games folder
        <div className="input-action"><input value={installRoot} onChange={(event) => setInstallRoot(event.target.value)} /><button onClick={() => void browse()} title="Browse"><FolderOpen /></button></div>
        <small>New games download and extract into this folder.</small>
      </label>
      <div className="wizard-account">
        <div><strong>Microsoft account</strong><small>{data.auth.stored === true ? `Signed in as ${data.auth.username ?? 'stored account'}` : data.auth.stored === false ? 'Not signed in yet — Store browsing works without an account' : 'Account status is still being checked'}</small></div>
        <button className="secondary" disabled={!data.backend.capabilities.login || signingIn} onClick={() => void signIn()}>{signingIn ? <LoaderCircle className="spin" /> : <LogIn />}{data.auth.stored ? 'Sign in again' : 'Sign in'}</button>
      </div>
      <div className="wizard-actions">
        <span>Signing in can also be done later from Settings.</span>
        <button className="primary" disabled={saving} onClick={() => void finish()}>{saving ? <LoaderCircle className="spin" /> : <Check />}Start using Xodus Nexus</button>
      </div>
    </div>
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>(() => window.location.hash === '#store' ? 'store' : 'home');
  const [data, setData] = useState<AppSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');

  useEffect(() => {
    void window.launcher.getSnapshot().then((value) => { setData(value); setLoading(false); }).catch((error) => { setToast({ kind: 'error', message: errorMessage(error) }); setLoading(false); });
    return window.launcher.onSnapshot(setData);
  }, []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(undefined), 5000); return () => window.clearTimeout(timeout); }, [toast]);
  useEffect(() => {
    // XODUS_DEMO_TOUR=1 cycles through the pages for screenshot capture.
    if (!window.launcher.isDemoTour()) return;
    const order: Page[] = ['home', 'library', 'store', 'downloads', 'settings'];
    let index = 0;
    const timer = window.setInterval(() => { index = (index + 1) % order.length; setPage(order[index]); }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const activeCount = data.downloads.filter((task) => task.status === 'running').length;
  const searchResults = useMemo(() => search.trim() ? data.games.filter((game) => `${game.title} ${game.storeId ?? ''}`.toLowerCase().includes(search.toLowerCase())) : [], [data.games, search]);
  const accountTitle = data.auth.username ?? (data.auth.stored === true ? 'Microsoft account' : 'Sign in');
  function action(fn: () => Promise<unknown>, success?: string) { void fn().then(() => success && setToast({ kind: 'success', message: success })).catch((error) => setToast({ kind: 'error', message: errorMessage(error) })); }

  if (loading) return <div className="boot"><div className="brand-mark">X</div><LoaderCircle className="spin" /><span>Loading Xodus Nexus</span></div>;
  return <div className="app-shell">
    {!data.settings.firstRunCompleted ? <FirstRunWizard data={data} toast={(value) => setToast(value)} /> : null}
    <aside className="sidebar">
      <button className="account-summary" onClick={() => setPage('settings')}><div className="account-avatar"><CircleUserRound /></div><span><strong>{accountTitle}</strong><small>{data.auth.stored === true ? 'Credentials stored' : data.auth.stored === false ? 'Not signed in' : 'Status unavailable'}</small></span><ChevronRight /></button>
      <nav><NavItem active={page === 'home'} icon={<Home />} label="Home" onClick={() => setPage('home')} /><NavItem active={page === 'store'} icon={<Store />} label="Store" onClick={() => setPage('store')} /><NavItem active={page === 'library'} icon={<Library />} label="My Library" onClick={() => setPage('library')} /><NavItem active={page === 'downloads'} icon={<Download />} label="Install Queue" badge={activeCount} onClick={() => setPage('downloads')} /></nav>
      {data.games.length > 0 ? <div className="recents"><span>Most recent</span>{data.games.slice(0, 5).map((game) => <button key={game.id} onClick={() => setPage('library')}><Cover game={game} /><strong>{game.title}</strong></button>)}</div> : null}
      <div className="sidebar-bottom"><NavItem active={page === 'settings'} icon={<Cog />} label="Settings" onClick={() => setPage('settings')} /><button className="queue-summary" onClick={() => setPage('downloads')}><Download /><span><strong>Install Queue</strong><small>{activeCount ? `${activeCount} active installation${activeCount === 1 ? '' : 's'}` : 'Manage installations'}</small></span></button></div>
    </aside>

    <section className="content-shell">
      <header className="topbar"><div className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && search.trim().length >= 2) { setSubmittedSearch(search.trim()); setPage('store'); } }} placeholder="Search games, add-ons and your library" />{search ? <button onClick={() => setSearch('')}><X /></button> : null}{searchResults.length > 0 && page !== 'store' ? <div className="search-results">{searchResults.map((game) => <button key={game.id} onClick={() => { setSearch(''); setPage('library'); }}><Cover game={game} /><span><strong>{game.title}</strong><small>{game.storeId ?? game.path}</small></span></button>)}</div> : null}</div><div className="top-status"><StatusDot tone={data.backend.available ? 'green' : 'red'} /><span>{data.backend.available ? 'Xodus ready' : 'Backend offline'}</span><button onClick={() => setPage('settings')}><Settings2 /></button></div></header>
      <div className="page-scroll">{page === 'home' ? <HomePage data={data} go={setPage} action={action} /> : null}{page === 'store' ? <StorePage data={data} toast={setToast} go={setPage} initialQuery={submittedSearch} /> : null}{page === 'library' ? <LibraryPage data={data} toast={setToast} /> : null}{page === 'downloads' ? <DownloadsPage data={data} toast={setToast} /> : null}{page === 'settings' ? <SettingsPage data={data} toast={setToast} /> : null}</div>
    </section>
    {toast ? <div className={`toast ${toast.kind}`}>{toast.kind === 'success' ? <Check /> : toast.kind === 'error' ? <CircleAlert /> : <Terminal />}<span>{toast.message}</span><button onClick={() => setToast(undefined)}><X /></button></div> : null}
  </div>;
}
