import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { libraryProviders } from '../shared/library-providers';
import { NexusLibraryProvidersSettings, providerRegistration } from './NexusLibraryProvidersSettings';
import { NexusPreferencesSettings } from './NexusPreferencesSettings';

afterEach(() => vi.unstubAllGlobals());
describe('desktop-entry capability normalization', () => {
  it('retains only explicit booleans for known providers', () => {
    expect([...providerRegistration([{ id: 'steam', installed: true }, { id: 'epic', installed: false }, { id: 'unknown', installed: true },
      { id: 'gog', installed: 'true' }, null])]).toEqual([['steam', true], ['epic', false]]);
  });
  it('makes duplicate or missing entries unknown rather than claiming detection', () => {
    const result = providerRegistration([{ id: 'steam', installed: true }, { id: 'steam', installed: true },
      { id: 'epic', installed: false }, { id: 'epic', installed: 'false' }, { id: 'steam', installed: true }]);
    expect(result.size).toBe(0);
  });
  it.each([undefined, null, true, {}, Array(101).fill({ id: 'steam', installed: true })])('rejects malformed response %j', raw => {
    expect(providerRegistration(raw).size).toBe(0);
  });
});
it('renders an unknown state and real fixed provider links without calling a bridge during render', () => {
  const getProviders = vi.fn(), onImportGame = vi.fn();
  const html = renderToStaticMarkup(<NexusLibraryProvidersSettings getProviders={getProviders} onImportGame={onImportGame} />);
  expect(getProviders).not.toHaveBeenCalled(); expect(onImportGame).not.toHaveBeenCalled();
  expect(html.match(/data-provider-registration="unknown"/g)).toHaveLength(libraryProviders.length);
  expect(html).toContain('Detection reads desktop-entry metadata.'); expect(html).toContain('Automatic library import: unavailable');
  for (const provider of libraryProviders) { expect(html).toContain(provider.name); expect(html).toContain(`href="${provider.site}"`); }
  expect(html).toContain('target="_blank" rel="noreferrer"'); expect(html).not.toMatch(/Connected|Sign in to|original-xbox|<img/);
});
it('supports injected website actions without opening anything during render', () => {
  const open = vi.fn();
  const html = renderToStaticMarkup(<NexusLibraryProvidersSettings onOpenProviderSite={open} />);
  expect(open).not.toHaveBeenCalled(); expect(html).not.toContain('target="_blank"');
  expect(html).toContain('Steam: provider website');
});
it('shows default-off preferences and a display-only byte unit', () => {
  const onChange = vi.fn(), html = renderToStaticMarkup(<NexusPreferencesSettings settings={{}} onChange={onChange} />);
  expect(html.match(/type="checkbox"/g)).toHaveLength(2); expect(html).not.toContain('checked=""'); expect(html).toContain('value="bytes" selected=""');
  expect(html).toContain('bandwidth limit is configured separately'); expect(html).toContain('Language for optional panels'); expect(onChange).not.toHaveBeenCalled();
});
it('reflects persisted flags and respects an owner busy state', () => {
  const html = renderToStaticMarkup(<NexusPreferencesSettings settings={{ downloadNotifications: true, createDesktopShortcut: true, downloadSpeedUnit: 'bits' }} busy onChange={() => {}} />);
  expect(html.match(/checked=""/g)).toHaveLength(2); expect(html).toContain('value="bits" selected=""');
  expect(html.match(/disabled=""/g)).toHaveLength(3);
});
it('localizes provider limitations, preference names and optional language controls', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'el' });
  expect(renderToStaticMarkup(<NexusLibraryProvidersSettings />)).toContain('Αυτόματη εισαγωγή βιβλιοθήκης: μη διαθέσιμη');
  const html = renderToStaticMarkup(<NexusPreferencesSettings settings={{}} onChange={() => {}} />);
  expect(html).toContain('Ειδοποίηση όταν ολοκληρώνεται μια λήψη'); expect(html).toContain('Γλώσσα προαιρετικών πλαισίων');
});
