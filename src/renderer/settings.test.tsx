import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoSnapshot } from '../shared/demo-data';
import { SettingsPage } from './App';

describe('Settings diagnostics', () => {
  it('does not call an unpublished development build the latest published release', () => {
    const html = renderToStaticMarkup(<SettingsPage data={demoSnapshot()} toast={() => {}} />);
    expect(html).toContain('0.1.0');
    expect(html).not.toContain('latest published release');
    expect(html).toContain('Check GitHub for launcher updates.');
  });
  it('keeps technical details in a closed disclosure, without a CLI command list', () => {
    const html = renderToStaticMarkup(<SettingsPage data={demoSnapshot()} toast={() => {}} />);
    const details = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    expect(details).toBeDefined();
    expect(details?.split('>')[0]).not.toMatch(/\bopen\b/);
    expect(details).toContain('Build dependencies');
    expect(details).toContain('Required tools');
    expect(details).toContain('COMMIT');
    expect(details).toContain('Install upstream snapshot');
    expect(details).toContain('Verbose game logs');
    expect(details).toContain('Save diagnostics');
    expect(details).toContain('Build backend from source');
    const main = html.replace(details!, '');
    expect(main).not.toContain('Build dependencies');
    expect(main).not.toContain('Verbose game logs');
    expect(main).not.toContain('Required tools');
    expect(main).not.toContain('PROTON HEAD');
    expect(main).not.toContain('Install upstream snapshot');
    expect(main).not.toContain('Official GitHub Actions snapshot');
    expect(main).not.toContain('Build backend from source');
    expect(main).not.toContain('Rebuild backend');
    expect(main).toContain('Install / update backend');
    expect(main).toContain('Nexus runtime');
    expect(html).not.toContain('Advertised commands');
  });
  it('keeps actionable errors visible and unsupported sign-in disabled', () => {
    const data = demoSnapshot();
    data.backend.capabilities.login = false;
    data.backend.blockReason = 'Cargo is missing. Install it before building.';
    data.runtime.error = 'SHA-512 verification failed.';
    const html = renderToStaticMarkup(<SettingsPage data={data} toast={() => {}} />);
    const main = html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/, '');
    expect(main).toContain(data.backend.blockReason);
    expect(main).toContain(data.runtime.error);
    expect(main).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Sign in again<\/button>/);
  });
});
