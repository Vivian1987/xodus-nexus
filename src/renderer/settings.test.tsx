import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoSnapshot } from '../shared/demo-data';
import { SettingsPage } from './App';

describe('Settings diagnostics', () => {
  it('keeps technical details in a closed disclosure, without a CLI command list', () => {
    const html = renderToStaticMarkup(<SettingsPage data={demoSnapshot()} toast={() => {}} />);
    const details = html.match(/<details\b[^>]*>[\s\S]*?<\/details>/)?.[0];
    expect(details).toBeDefined();
    expect(details?.split('>')[0]).not.toMatch(/\bopen\b/);
    expect(details).toContain('Build dependencies');
    expect(details).toContain('Required tools');
    expect(details).toContain('COMMIT');
    expect(details).toContain('Install upstream snapshot');
    const main = html.replace(details!, '');
    expect(main).not.toContain('Build dependencies');
    expect(main).not.toContain('Required tools');
    expect(main).not.toContain('PROTON HEAD');
    expect(main).not.toContain('Install upstream snapshot');
    expect(main).not.toContain('Official GitHub Actions snapshot');
    expect(main).toContain('Xodus Nexus runtime');
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
