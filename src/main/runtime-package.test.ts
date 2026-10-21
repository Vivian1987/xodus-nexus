import { expect, it } from 'vitest';
import { RUNTIME_REPOSITORY, runtimeAssetUrl, runtimeCandidate, runtimeReleasesUrl } from './runtime-package.js';
function release(version = '11.0-tested', published_at = '2026-10-20T00:00:00Z') {
  const tag_name = `runtime-${version}`, base = `xodus-nexus-runtime-${version}`;
  return { tag_name, published_at, assets: ['-x86_64.tar.xz', '-x86_64.sha512sum', '-source.tar.xz', '-source.sha512sum'].map(suffix => ({
    name: `${base}${suffix}`, browser_download_url: `https://github.com/domsvoboda/xodus-nexus/releases/download/${tag_name}/${base}${suffix}`,
  })) };
}
it('uses the original Nexus channel and binds binary, checksum and source assets to one runtime tag', () => {
  const value = release();
  expect(RUNTIME_REPOSITORY).toBe('domsvoboda/xodus-nexus'); expect(runtimeReleasesUrl).toContain('/domsvoboda/xodus-nexus/releases?per_page=30');
  expect(runtimeCandidate([null, 1, {}, { ...value, draft: true }, value])).toEqual({
    version: value.tag_name, name: value.assets[0].name, url: value.assets[0].browser_download_url,
    checksumName: value.assets[1].name, checksumUrl: value.assets[1].browser_download_url,
  });
});
it.each(['missing-source', 'duplicate-archive', 'foreign-url', 'mixed-tag', 'mixed-filename', 'credentials', 'query'])('rejects incomplete or ambiguous distribution data: %s', scenario => {
  const value = release();
  if (scenario === 'missing-source') value.assets.pop();
  if (scenario === 'duplicate-archive') value.assets.push(value.assets[0]);
  if (scenario === 'foreign-url') value.assets[0].browser_download_url = 'https://example.test/runtime.tar.xz';
  if (scenario === 'mixed-tag') value.tag_name = 'runtime-other';
  if (scenario === 'mixed-filename') value.assets[1].name = 'other.sha512sum';
  if (scenario === 'credentials') value.assets[0].browser_download_url = value.assets[0].browser_download_url.replace('https://', 'https://user:pass@');
  if (scenario === 'query') value.assets[0].browser_download_url += '?download=1';
  expect(() => runtimeCandidate([value])).toThrow('No Nexus runtime');
});
it('preserves newest complete publication selection and undated fallback independently of commit ordering', () => {
  const older = release('11.0-gffff', '2026-10-18T00:00:00Z'), newer = release('11.0-gaaaa', '2026-10-19T00:00:00Z');
  const partial = release('partial', '2026-10-21T00:00:00Z'); partial.assets.pop();
  for (const list of [[older, newer], [newer, older]]) expect(runtimeCandidate([release('undated', ''), ...list, partial, { ...release('launcher'), tag_name: 'v9.9.9' }]).version).toBe(newer.tag_name);
  expect(runtimeCandidate([release('undated', '')]).version).toBe('runtime-undated');
});
it('rejects malformed release lists and unsafe requests before constructing a download URL', () => {
  for (const value of [null, {}, new Array(1001).fill({})]) expect(() => runtimeCandidate(value)).toThrow('Invalid');
  const item = release();
  expect(() => runtimeAssetUrl('../escape', item.assets[0].name, item.assets[0].browser_download_url)).toThrow('Unexpected');
  expect(() => runtimeAssetUrl(item.tag_name, '../escape', item.assets[0].browser_download_url)).toThrow('Unexpected');
});
