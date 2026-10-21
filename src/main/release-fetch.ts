// Keep public launcher/backend requests on the existing Nexus release channel.
const repository = 'domsvoboda/xodus-nexus';
const assetHosts = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
const redirectStatus = new Set([301, 302, 303, 307, 308]);
const cancel = async (response: Response) => { await response.body?.cancel().catch(() => {}); };

export async function releaseBytes(response: Response, limit: number): Promise<Buffer> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw Error('Invalid release response limit.');
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    await cancel(response); throw Error('Release metadata exceeds the download limit.');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) throw Error('Release metadata exceeds the download limit.');
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks, bytes);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function releaseText(response: Response, limit: number): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true }).decode(await releaseBytes(response, limit));
}

/** API redirects are refused. Asset redirects must remain on GitHub's asset
 * CDN, without forwarding credentials or relying on implicit fetch redirects. */
export async function fetchNexusRelease(fetcher: typeof fetch, input: string, init: RequestInit = {}): Promise<Response> {
  let url = new URL(input);
  const safe = (value: URL) => value.protocol === 'https:' && !value.username && !value.password && !value.port && !value.hash;
  const api = url.hostname === 'api.github.com' && url.pathname === `/repos/${repository}/releases`;
  const asset = url.hostname === 'github.com' && new RegExp(`^/${repository}/releases/download/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`).test(url.pathname);
  if (!safe(url) || !api && !asset || init.method && init.method !== 'GET' || init.body != null) throw Error('Unexpected Nexus release request.');
  const headers = new Headers(init.headers);
  if (['authorization', 'cookie', 'proxy-authorization'].some(name => headers.has(name))) throw Error('Credentials cannot be sent to the release channel.');
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetcher(url.href, { ...init, headers, credentials: 'omit', redirect: 'manual' });
    if (response.redirected || response.url && new URL(response.url).href !== url.href) {
      await cancel(response); throw Error('The release request followed an unchecked redirect.');
    }
    if (!redirectStatus.has(response.status)) return response;
    const location = response.headers.get('location'); await cancel(response);
    if (api || !location || redirects === 5) throw Error('Unexpected Nexus release redirect.');
    const next = new URL(location, url);
    if (!safe(next) || !assetHosts.has(next.hostname)) throw Error('Unexpected Nexus asset redirect destination.');
    url = next;
  }
  throw Error('Too many release redirects.');
}
