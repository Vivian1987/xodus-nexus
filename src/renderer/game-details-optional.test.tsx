import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import ts from 'typescript';
import { demoSnapshot } from '../shared/demo-data';
import type { AppSnapshot, GameStoreDetails } from '../shared/types';
import type { HandheldCompatibility } from '../shared/handheld-compatibility';
import { GameDetailsContent } from './GameDetails';
import { libraryCollectionKey } from './library-collections';

afterEach(() => vi.unstubAllGlobals());
const game = demoSnapshot().games[0];
const details: GameStoreDetails = { productId: game.storeId!, title: game.title, description: 'Returned description', categories: [], screenshots: [] };
const auth: AppSnapshot['auth'] = { stored: true, running: false, username: 'current@example.test', note: '' };
const value = (rating: HandheldCompatibility['rating']): HandheldCompatibility => ({ rating, source: 'microsoft-catalog', platform: 'windows-pc', rawRating: { unknown: 0, optimized: 1, unsupported: 2, playable: 3 }[rating] });
function props(data = details, account?: AppSnapshot['auth']) {
  return { game, auth: account, details: data, back: vi.fn(), refresh: vi.fn(),
    play: <button className="primary" data-native-play>Play</button>, manage: <button data-license-action>Existing manage action</button>,
    notices: <p>Existing license notice</p>, technical: <p>Existing installation details</p>, achievements: <p>Existing achievements</p> };
}

it.each(['optimized', 'playable', 'unsupported', 'unknown'] as const)('keeps the existing Nexus launch/license content with an informational %s handheld entry', rating => {
  const refresh = vi.fn(), html = renderToStaticMarkup(<GameDetailsContent {...props({ ...details, handheldCompatibility: value(rating) })} refresh={refresh} />);
  expect(html).toContain(`data-handheld-rating="${rating}"`);
  expect(html).toContain('aria-haspopup="dialog"'); expect(html).not.toContain('aria-modal="true"');
  const play = html.match(/<button\b[^>]*data-native-play[^>]*>/)?.[0];
  expect(play).toBeDefined(); expect(play).not.toContain('disabled');
  for (const content of ['gd-hero', 'gd-play-row', 'gd-about', 'gd-gallery', 'gd-facts', 'Existing license notice', 'Existing manage action', 'Existing installation details', 'Existing achievements']) expect(html).toContain(content);
  expect(refresh).not.toHaveBeenCalled();
});
it('keeps the unknown compatibility entry available and preserves a license-disabled Play button', () => {
  const html = renderToStaticMarkup(<GameDetailsContent {...props()} play={<button data-license-blocked disabled>Play</button>} />);
  expect(html).toContain('data-handheld-rating="unknown"');
  expect(html.match(/<button\b[^>]*handheld-compatibility-entry[^>]*>/)?.[0]).not.toContain('disabled');
  expect(html.match(/<button\b[^>]*data-license-blocked[^>]*>/)?.[0]).toContain('disabled=""');
  expect(html).not.toMatch(/Linux verified|Steam Deck Verified|Add to Play later/);
});
it('uses the local game identity for account-scoped Play later and hides another account’s saved state', () => {
  const storage = { getItem: vi.fn((key: string) => key === libraryCollectionKey(auth) ? JSON.stringify({ later: [game.id], history: {} }) : null), setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  const current = renderToStaticMarkup(<GameDetailsContent {...props(details, auth)} />);
  expect(current).toContain('Remove from Play later'); expect(current).toContain('aria-pressed="true"');
  const other = renderToStaticMarkup(<GameDetailsContent {...props(details, { ...auth, username: 'other@example.test' })} />);
  expect(other).toContain('Add to Play later'); expect(other).not.toContain('Remove from Play later');
  for (const patch of [{ stored: false }, { running: true }]) {
    const unavailable = renderToStaticMarkup(<GameDetailsContent {...props(details, { ...auth, ...patch })} />);
    expect(unavailable).toContain('Add to Play later'); expect(unavailable).not.toContain('Remove from Play later');
    expect(unavailable).toMatch(/aria-pressed="false" disabled=""/);
    const play = unavailable.match(/<button\b[^>]*data-native-play[^>]*>/)?.[0];
    expect(play).toBeDefined(); expect(play).not.toContain('disabled');
  }
  expect(storage.setItem).not.toHaveBeenCalled();
});

// Execute the current component with small hooks and child markers. This checks
// integration callbacks without mounting a DOM, reading an account or launching.
function runtime() {
  let cursor = 0; const state: any[] = [];
  const Entry = () => null, Dialog = () => null, Later = () => null;
  const imports: Record<string, unknown> = { react: {
    useState: (initial: unknown) => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (next: unknown) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
    useRef: (initial: unknown) => ({ current: initial }), useEffect: () => {}, useCallback: (callback: unknown) => callback,
  }, 'react/jsx-runtime': jsxRuntime, 'lucide-react': icons, './game-details.css': {}, './Achievements': { Achievements: () => null },
  './HandheldCompatibilityView': { HandheldCompatibilityEntry: Entry, HandheldCompatibilityDialog: Dialog }, './PlayLaterButton': { PlayLaterButton: Later } };
  const exports: Record<string, (props: any) => any> = {};
  const code = ts.transpileModule(readFileSync(new URL('./GameDetails.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports, require: (id: string) => { if (!(id in imports)) throw Error(`Unexpected test import: ${id}`); return imports[id]; } });
  const nodes = (node: any): any[] => node && typeof node === 'object' ? [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] : [];
  return { Entry, Dialog, Later, render: (input: ReturnType<typeof props>) => { cursor = 0; return exports.GameDetailsContent(input); },
    page: exports.GameDetails, find: (tree: unknown, type: unknown) => nodes(tree).find(node => node.type === type), nodes };
}

it('opens the actual metadata classification dialog, dismisses it, and never invokes Play or Manage', () => {
  const app = runtime(), play = vi.fn(), manage = vi.fn();
  const compatibility = value('unsupported'), input = { ...props({ ...details, handheldCompatibility: compatibility }, auth),
    play: <button onClick={play}>Play</button>, manage: <button onClick={manage}>Manage</button> };
  let tree = app.render(input);
  expect(app.find(tree, app.Dialog)).toBeUndefined();
  expect(app.find(tree, app.Entry).props.value).toBe(compatibility);
  expect(app.find(tree, app.Later).props).toMatchObject({ gameId: game.id, auth });
  app.find(tree, app.Entry).props.open(); tree = app.render(input);
  const dialog = app.find(tree, app.Dialog);
  expect(dialog.props.title).toBe(game.title); expect(dialog.props.value).toBe(compatibility);
  expect(app.nodes(tree)).toContain(input.play); expect(app.nodes(tree)).toContain(input.manage);
  dialog.props.close(); expect(app.find(app.render(input), app.Dialog)).toBeUndefined();
  expect(play).not.toHaveBeenCalled(); expect(manage).not.toHaveBeenCalled();
});
it('does not carry an open compatibility dialog into a different selected game before effects run', () => {
  const app = runtime(), input = props(); let tree = app.render(input);
  app.find(tree, app.Entry).props.open(); expect(app.find(app.render(input), app.Dialog)).toBeDefined();
  tree = app.render({ ...input, game: { ...game, id: 'different-game', title: 'Different game' } });
  expect(app.find(tree, app.Dialog)).toBeUndefined();
});
it('forwards the current snapshot account into the details surface without changing caller actions', () => {
  const app = runtime(), data = demoSnapshot(); data.auth = auth;
  const input = props(), page = app.page({ ...input, data });
  expect(page.props.auth).toBe(auth); expect(page.props.game).toBe(game);
  expect(page.props.play).toBe(input.play); expect(page.props.manage).toBe(input.manage);
});
