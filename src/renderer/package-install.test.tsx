import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InstallPlan } from '../shared/types';
import { InstallContentDialog, PackageDialog } from './PackageInstall';

it('shows verified package names, IDs, platform and disabled unsupported choices without auto-selection', () => {
  const plan: InstallPlan = { schema: 1, rootProductId: '9AAAAAAAAAAA', market: 'US', status: 'choice', choices: [
    { productId: '9BBBBBBBBBBB', contentId: '11111111-1111-4111-8111-111111111111', title: 'PC base game', platform: 'Windows.Desktop', packageFormat: 'MSIXVC', kind: 'Game', supported: true },
    { productId: '9CCCCCCCCCCC', contentId: '22222222-2222-4222-8222-222222222222', title: '<Console game>', platform: 'Xbox.One', packageFormat: 'XVC', kind: 'Game', supported: false },
  ] };
  const html = renderToStaticMarkup(<PackageDialog plan={plan} choose={() => {}} />);
  expect(html).toContain('PC base game'); expect(html).toContain('Windows.Desktop'); expect(html).toContain('9BBBBBBBBBBB');
  expect(html).toContain('&lt;Console game&gt;'); expect(html).toContain('Unsupported');
  expect(html.match(/disabled=""/g)).toHaveLength(2); expect(html).not.toContain('checked=""');
  expect(html).toContain('Cancel'); expect(html).toContain('checks your license');
});
it('preselects only licensed downloadable DLC before starting the base game', () => {
  const plan = { gameId: 'base', checkedAt: '', runtimeSupported: true, items: [
    { productId: 'OWN', title: 'Owned DLC', access: 'owned' as const, status: 'available' as const, note: '' },
    { productId: 'NONE', title: 'Unavailable DLC', status: 'unlicensed' as const, note: '' },
  ] };
  const html = renderToStaticMarkup(<InstallContentDialog plan={plan} choose={() => {}} />);
  expect(html).toContain('after the base game'); expect(html.match(/checked=""/g)).toHaveLength(2);
  expect(html).toMatch(/aria-label="Unavailable DLC"[^>]*disabled=""/);
  const unsupported = renderToStaticMarkup(<InstallContentDialog plan={{ ...plan, runtimeSupported: false }} choose={() => {}} />);
  expect(unsupported).not.toContain('checked=""'); expect(unsupported).toContain('Update the Nexus runtime');
  const failed = renderToStaticMarkup(<InstallContentDialog plan={{ ...plan, items: [] }} error="temporary failure" choose={() => {}} />);
  expect(failed).toContain('DLC licenses could not be checked'); expect(failed).toContain('Install base game');
  expect(failed).not.toContain('No licensed downloadable content');
});
