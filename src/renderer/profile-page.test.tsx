import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import type { ReactElement } from 'react';
import ts from 'typescript';
import type { AuthStatus } from '../shared/types';
import { subscriptionBadge } from '../shared/subscription';
import { parseXboxSelfProfileDetails } from '../shared/xbox-profile';
import * as icons from './NexusIcons';
import { ProfilePage } from './ProfilePage';

afterEach(() => vi.unstubAllGlobals());
const active = (productIds = ['CFQ7TTC0KHS0']) => ({ status: 'active' as const, productIds, checkedAt: new Date().toISOString() });
const avatar = 'data:image/png;base64,iVBORw0KGgo=';
function auth(): AuthStatus {
  return { stored: true, running: false, username: 'current@example.test', note: '', gamertag: 'CurrentPlayer', avatarDataUrl: avatar,
    profile: { gamertag: 'CurrentPlayer', gamerscore: 0, bio: 'Returned biography\nwith two lines', location: 'Returned location', realName: 'Returned name' }, subscription: active() };
}
function render(value = auth(), refresh?: () => Promise<void>) {
  return renderToStaticMarkup(<ProfilePage auth={value} settings={() => {}} friends={() => {}} refresh={refresh} />);
}

describe('current account profile rendering', () => {
  it('uses Nexus cards and returned fields, including an actual zero score and text membership', () => {
    const html = render();
    for (const text of ['settings-card profile-summary', 'settings-card profile-about', 'CurrentPlayer', 'Returned biography', 'Returned location', 'Returned name', 'ULTIMATE', 'Gamerscore']) expect(html).toContain(text);
    expect(html).toContain('<strong>0</strong>');
    expect(html).toContain('class="state-pill profile-membership"');
    for (const absent of ['/icons/', 'profile-hero', 'Followers', 'Following', '>Online<', 'AccountTier']) expect(html).not.toContain(absent);
  });
  it.each([false, null])('suppresses cached private fields when stored is %j', stored => {
    const html = render({ ...auth(), stored, profileSource: 'cache', profileError: 'raw private error' });
    expect(html).toContain('Sign in to view your profile');
    for (const absent of ['CurrentPlayer', 'current@example.test', 'Returned biography', 'Returned location', 'ULTIMATE', avatar, 'raw private']) expect(html).not.toContain(absent);
  });
  it('hides the previous profile throughout account operations and without an account identity', () => {
    for (const value of [{ ...auth(), running: true }, { ...auth(), username: undefined }]) {
      const html = render(value);
      for (const absent of ['CurrentPlayer', 'Returned biography', 'current@example.test', 'ULTIMATE', avatar]) expect(html).not.toContain(absent);
      expect(html).toContain('Account settings');
      expect(html).not.toContain('Refresh profile');
    }
  });
  it('keeps older profile caches usable without inventing missing details or a current membership', () => {
    const html = render({ ...auth(), profile: undefined, subscription: { status: 'unknown', productIds: [], checkedAt: new Date().toISOString() } });
    expect(html).toContain('CurrentPlayer');
    expect(html).toContain('Gamerscore is unavailable.');
    expect(html).toContain('No biography or location was returned');
    expect(html).not.toContain('profile-membership');
    expect(html).not.toContain('<strong>0</strong>');
  });
  it('discards malformed optional fields and identity/avatar values without displaying raw objects', () => {
    const value = { ...auth(), gamertag: { private: 'raw-identity' }, avatarDataUrl: 'https://untrusted.invalid/private.png',
      profile: { gamertag: '\u0000invalid', avatarDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=', gamerscore: -1, bio: { secret: 'raw-biography' }, location: 'invalid\u0000location', realName: 'x'.repeat(257), accountTier: 'Gold' }, subscription: active(['unknown']) } as unknown as AuthStatus;
    const html = render(value);
    expect(html).toContain('Gamerscore is unavailable');
    for (const absent of ['raw-identity', 'raw-biography', 'untrusted.invalid', 'svg+xml', 'invalid', 'Gold', 'profile-membership', '<img']) expect(html).not.toContain(absent);
  });
  it('escapes valid biography text rather than treating it as markup', () => {
    const value = auth(); value.profile!.bio = '<script>synthetic text</script>';
    const html = render(value);
    expect(html).toContain('&lt;script&gt;synthetic text&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('labels saved data and refresh failure without exposing raw backend errors or account notes', () => {
    const html = render({ ...auth(), profileSource: 'cache', profileError: 'raw sensitive provider payload', note: 'private diagnostic note' });
    expect(html).toContain('Showing saved profile information');
    expect(html).toContain('role="status"');
    expect(html).toContain('Your Xbox profile could not be refreshed. Try again.');
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/raw sensitive|private diagnostic/);
  });
  it('never requests account data during rendering and disables refresh without an adapter', () => {
    const refresh = vi.fn(async () => {});
    vi.stubGlobal('window', { launcher: { refreshXboxProfile: refresh } });
    expect(render()).toContain('Refresh profile');
    expect(refresh).not.toHaveBeenCalled();
    vi.stubGlobal('window', { launcher: {} });
    expect(render()).toMatch(/<button[^>]*disabled=""[^>]*><svg[^]*?Refresh profile/);
  });
  it('localizes profile controls using the existing Nexus language preference', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'el' });
    const html = render();
    for (const text of ['Το προφίλ σας στο Xbox', 'Ανανέωση προφίλ', 'Βαθμολογία παίκτη', 'Ρυθμίσεις λογαριασμού']) expect(html).toContain(text);
  });
});

// The repository uses SSR tests without a DOM dependency. Exercise the actual
// component functions with small hook stubs so callbacks/lifecycle are tested
// without mounting a window, touching an account, or replacing production code.
function controls(value = auth(), refresh?: () => Promise<void>) {
  const effects: (() => void)[] = [], setters: ReturnType<typeof vi.fn>[] = [];
  const hooks = {
    useRef: (initial: unknown) => ({ current: initial }),
    useState: (initial: unknown) => { const set = vi.fn(); setters.push(set); return [initial, set]; },
    useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) effects.push(cleanup); },
  };
  const module = { exports: {} as { ProfilePage: typeof ProfilePage } };
  const imports: Record<string, unknown> = { react: hooks, 'react/jsx-runtime': jsxRuntime,
    '../shared/subscription': { subscriptionBadge }, '../shared/xbox-profile': { parseXboxSelfProfileDetails }, './NexusIcons': icons,
    './ReferenceLocale': { useReferenceLocale: () => ({ text: (en: string) => en, language: 'en' }) }, './profile-page.css': {} };
  const code = ts.transpileModule(readFileSync(new URL('./ProfilePage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, { exports: module.exports, require: (id: string) => { if (!(id in imports)) throw Error(`Unexpected test import: ${id}`); return imports[id]; }, window: { launcher: { refreshXboxProfile: refresh } } });
  const settings = vi.fn(), friends = vi.fn();
  const element = module.exports.ProfilePage({ auth: value, settings, friends }) as ReactElement;
  const tree = (element.type as (props: unknown) => ReactElement)(element.props);
  const nodes = (node: any): any[] => node && typeof node === 'object' ? [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)] : [];
  const text = (node: any): string => typeof node === 'string' ? node : !node || typeof node !== 'object' ? '' : [node.props?.children].flat(Infinity).map(text).join('');
  const button = (label: string) => nodes(tree).find(node => node.type === 'button' && text(node).includes(label)).props;
  return { button, setters, settings, friends, key: element.key, cleanup: () => effects.forEach(effect => effect()) };
}
function deferred() {
  let resolve!: () => void, reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const settled = () => new Promise<void>(done => setImmediate(done));

describe('explicit profile controls', () => {
  it('opens settings and friends and invokes the native refresh adapter once for repeated clicks', async () => {
    const pending = deferred(), refresh = vi.fn(() => pending.promise), view = controls(auth(), refresh);
    view.button('Account settings').onClick(); view.button('Friends').onClick();
    expect(view.settings).toHaveBeenCalledOnce(); expect(view.friends).toHaveBeenCalledOnce();
    view.button('Refresh profile').onClick(); view.button('Refresh profile').onClick();
    expect(refresh).toHaveBeenCalledOnce();
    pending.resolve(); await settled();
    expect(view.setters[0].mock.calls).toEqual([[true], [false]]);
    expect(view.setters[1].mock.calls).toEqual([[false]]);
    view.cleanup();
  });
  it('keeps an unfinished refresh from publishing an error or busy state after account cleanup', async () => {
    const pending = deferred(), view = controls(auth(), () => pending.promise);
    view.button('Refresh profile').onClick(); view.cleanup();
    pending.reject(Error('raw private failure')); await settled();
    expect(view.setters[0].mock.calls).toEqual([[true]]);
    expect(view.setters[1].mock.calls).toEqual([[false]]);
    const replacement = controls({ ...auth(), username: 'replacement@example.test' });
    expect(replacement.key).not.toBe(view.key); replacement.cleanup();
  });
  it('represents a refresh rejection with a boolean error and blocks requests while native refresh is active', async () => {
    const pending = deferred(), refresh = vi.fn(() => pending.promise), view = controls(auth(), refresh);
    view.button('Refresh profile').onClick();
    pending.reject(Error('raw private failure')); await settled();
    expect(view.setters[1].mock.calls).toEqual([[false], [true]]);
    expect(view.setters.flatMap(setter => setter.mock.calls).flat()).not.toContain('raw private failure');
    const busy = controls({ ...auth(), profileRefreshing: true }, refresh);
    expect(busy.button('Refreshing…').disabled).toBe(true);
    busy.button('Refreshing…').onClick(); expect(refresh).toHaveBeenCalledOnce();
    view.cleanup(); busy.cleanup();
  });
});
