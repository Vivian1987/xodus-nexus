/** Public runtime packages stay on the existing Nexus release channel. The
 * separate Proton Actions/source-build paths keep their own upstream pins. */
export const RUNTIME_REPOSITORY = 'domsvoboda/xodus-nexus';
export const runtimeReleasesUrl = `https://api.github.com/repos/${RUNTIME_REPOSITORY}/releases?per_page=30`;
export interface NexusRuntimeArtifact {
  version: string; name: string; url: string; checksumName: string; checksumUrl: string;
}
const tagPattern = /^runtime-[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function runtimeAssetUrl(tag: string, name: string, value: unknown): string {
  const expected = `https://github.com/${RUNTIME_REPOSITORY}/releases/download/${tag}/${name}`;
  if (!tagPattern.test(tag) || !/^[A-Za-z0-9._-]+$/.test(name) || value !== expected) throw new Error('Unexpected Nexus runtime asset URL.');
  return expected;
}

export function runtimeCandidate(value: unknown): NexusRuntimeArtifact {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid Nexus runtime release list.');
  let found: NexusRuntimeArtifact | undefined, newestPublication = -Infinity;
  for (const release of value) {
    if (!release || typeof release !== 'object' || release.draft || release.prerelease || typeof release.tag_name !== 'string' || !tagPattern.test(release.tag_name)) continue;
    const version = release.tag_name, base = `xodus-nexus-runtime-${version.slice('runtime-'.length)}`;
    const assets: Array<{ name?: unknown; browser_download_url?: unknown }> = Array.isArray(release.assets) && release.assets.length <= 1000 ? release.assets : [];
    const asset = (file: string) => {
      const matches = assets.filter(item => item && typeof item === 'object' && item.name === file);
      if (matches.length !== 1) throw new Error('Incomplete or ambiguous Nexus runtime release.');
      return runtimeAssetUrl(version, file, matches[0].browser_download_url);
    };
    try {
      const name = `${base}-x86_64.tar.xz`, checksumName = `${base}-x86_64.sha512sum`;
      const candidate = { version, name, url: asset(name), checksumName, checksumUrl: asset(checksumName) };
      // Corresponding source is part of the existing release recipe even though
      // installation downloads only the runtime archive and its checksum.
      asset(`${base}-source.tar.xz`); asset(`${base}-source.sha512sum`);
      const parsed = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN;
      const publication = Number.isFinite(parsed) ? parsed : -Infinity;
      // Keep upstream's newest complete publication and undated fallback rules;
      // unrelated launcher/backend releases cannot hide an available runtime.
      if (!found || publication > newestPublication) { found = candidate; newestPublication = publication; }
    } catch { /* A partial upload is not an installable runtime release. */ }
  }
  if (!found) throw new Error('No Nexus runtime release has been published yet.');
  return found;
}
