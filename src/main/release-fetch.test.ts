import { expect, it, vi } from 'vitest';
import { fetchNexusRelease, releaseBytes, releaseText } from './release-fetch.js';
const api = 'https://api.github.com/repos/domsvoboda/xodus-nexus/releases?per_page=100';
const asset = 'https://github.com/domsvoboda/xodus-nexus/releases/download/v0.3.10/Xodus-Nexus-0.3.10-x86_64.AppImage';
it('keeps the original Nexus release channel and explicitly omits redirects and credentials', async () => {
  const fetcher = vi.fn(async () => new Response('[]'));
  expect(await (await fetchNexusRelease(fetcher, api)).text()).toBe('[]');
  expect(fetcher.mock.calls[0]).toEqual([api, expect.objectContaining({ redirect: 'manual', credentials: 'omit' })]);
});
it('follows bounded GitHub asset-CDN redirects while preserving cancellation and headers', async () => {
  const signal = new AbortController().signal;
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/github-production-release-asset/123/file?signature=fixture' } })).mockResolvedValueOnce(new Response('bytes verified by caller'));
  expect(await (await fetchNexusRelease(fetcher, asset, { signal, headers: { Accept: 'application/octet-stream' } })).text()).toBe('bytes verified by caller');
  expect(fetcher.mock.calls[1][1]).toMatchObject({ signal, redirect: 'manual', credentials: 'omit' });
  expect(fetcher.mock.calls[1][1].headers.get('Accept')).toBe('application/octet-stream');
});
it.each(['https://github.com/other/repository/releases/download/v1/file', 'https://evil.invalid/file', 'http://objects.githubusercontent.com/file', 'https://release-assets.githubusercontent.com.evil.invalid/file', 'https://user:password@objects.githubusercontent.com/file'])('rejects an unsafe asset redirect: %s', async location => {
  const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
  await expect(fetchNexusRelease(fetcher, asset)).rejects.toThrow('redirect destination'); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('refuses API redirects, loops, implicit redirects, credentials and non-GET operations', async () => {
  const loop = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://objects.githubusercontent.com/file' } }));
  await expect(fetchNexusRelease(loop, api)).rejects.toThrow('release redirect');
  await expect(fetchNexusRelease(loop, asset)).rejects.toThrow('release redirect'); expect(loop).toHaveBeenCalledTimes(7);
  const response = new Response('unexpected'); Object.defineProperty(response, 'redirected', { value: true });
  await expect(fetchNexusRelease(vi.fn(async () => response), asset)).rejects.toThrow('unchecked redirect');
  const unused = vi.fn();
  for (const headers of [{ Authorization: 'synthetic' }, { Cookie: 'synthetic' }, { 'Proxy-Authorization': 'synthetic' }]) await expect(fetchNexusRelease(unused, asset, { headers })).rejects.toThrow('Credentials');
  await expect(fetchNexusRelease(unused, asset, { method: 'POST' })).rejects.toThrow('Unexpected');
  await expect(fetchNexusRelease(unused, asset, { body: '' })).rejects.toThrow('Unexpected');
  await expect(fetchNexusRelease(unused, 'https://github.com/other/repository/releases/download/v1/file')).rejects.toThrow('Unexpected');
  expect(unused).not.toHaveBeenCalled();
});
it('bounds metadata by actual bytes, cancels excess responses and decodes strict UTF-8', async () => {
  const cancelled = vi.fn();
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); }, cancel: cancelled }));
  await expect(releaseBytes(response, 4)).rejects.toThrow('download limit'); expect(cancelled).toHaveBeenCalledOnce();
  await expect(releaseBytes(new Response('x', { headers: { 'content-length': '100' } }), 4)).rejects.toThrow('download limit');
  await expect(releaseText(new Response(new Uint8Array([0xc3, 0x28])), 4)).rejects.toThrow();
  expect(await releaseText(new Response('Δ'), 2)).toBe('Δ');
  await expect(releaseText(new Response('Δ'), 1)).rejects.toThrow('download limit');
});
