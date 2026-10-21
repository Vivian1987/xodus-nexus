import { describe, expect, it, vi } from 'vitest';
import { CatalogService, parseCatalogProducts } from './catalog.js';
import { parseHandheldCompatibility, readHandheldCompatibility } from './handheld-compatibility.js';

const id = '9PPT8K6GQHRZ';
const summary = (result: unknown, deviceResults?: unknown) => ({ productId: id, productKind: 'Game', hhVerified: { deviceEvaluation: result, deviceResults } });
const payload = (result: unknown, deviceResults?: unknown) => ({ productSummaries: [summary(result, deviceResults)] });
const description = { Products: [{ ProductId: id, ProductType: 'Game', LocalizedProperties: [{ ProductTitle: 'Example', ProductDescription: 'Description',
  Images: [{ ImagePurpose: 'Screenshot', Uri: 'https://store-images.s-microsoft.com/screenshot' }] }] }] };

describe('explicit public Windows handheld metadata', () => {
  it.each([[0, 'unknown'], [1, 'optimized'], [2, 'unsupported'], [3, 'playable']] as const)('maps only explicit rating %s to %s', (rawRating, rating) => {
    expect(parseHandheldCompatibility(id, payload(rawRating))).toEqual({ rating, rawRating, source: 'microsoft-catalog', platform: 'windows-pc' });
  });
  it.each([undefined, null, true, false, '1', 'Verified', 4, -1, 1.5, Infinity, {}, []])('rejects absent, malformed and future ratings %j', result => {
    expect(parseHandheldCompatibility(id, payload(result))).toBeUndefined();
  });
  it('requires an exact unique game and never borrows a bundle child rating', () => {
    const other = { ...summary(1), productId: '9AAAAAAAAAAA' };
    for (const productSummaries of [[other], [summary(1), summary(1)], [{ ...summary(1), productKind: 'Durable' }],
      [{ productId: id, productKind: 'Game', bundledProductIds: [other.productId] }, other], Array(101).fill(summary(1))]) {
      expect(parseHandheldCompatibility(id, { productSummaries })).toBeUndefined();
    }
    expect(parseHandheldCompatibility('../invalid', payload(1))).toBeUndefined();
    expect(parseHandheldCompatibility(id, null)).toBeUndefined();
    expect(parseHandheldCompatibility(id, { productSummaries: {} })).toBeUndefined();
  });
  it('never derives a rating from controller, entitlement or package capabilities', () => {
    expect(parseHandheldCompatibility(id, { productSummaries: [{ productId: id, productKind: 'Game', fullControllerSupport: true, availableOn: ['Handheld'], capabilities: ['HandheldOptimized'] }] })).toBeUndefined();
    const products = parseCatalogProducts({ productsList: [{ productId: id, title: 'Example', isGame: true, plaintextPassName: 'Game Pass', hhVerified: { deviceEvaluation: 1 } }] }, {});
    expect(products[0]?.handheldCompatibility).toBeUndefined();
  });
  it('retains individual explicit results without inferring them from an overall result', () => {
    expect(parseHandheldCompatibility(id, payload(1))?.criteria).toBeUndefined();
    expect(parseHandheldCompatibility(id, payload(1, [
      { deviceTest: 4, testResult: 1 }, { deviceTest: 0, testResult: 1 }, { deviceTest: 1, testResult: 3 },
      { deviceTest: 2, testResult: 2 }, { deviceTest: 3, testResult: 0 },
    ]))?.criteria).toEqual([
      { id: 'supported-display', rating: 'optimized' }, { id: 'defaults-work', rating: 'optimized' },
      { id: 'iconography', rating: 'playable' }, { id: 'text-input', rating: 'unsupported' }, { id: 'ui-legibility', rating: 'unknown' },
    ]);
  });
  it('marks ambiguous duplicate criteria unknown, including malformed duplicates', () => {
    expect(parseHandheldCompatibility(id, payload(1, [
      { deviceTest: 0, testResult: 1 }, { deviceTest: 0, testResult: 1 },
      { deviceTest: 1, testResult: 1 }, { deviceTest: 1, testResult: '1' },
      { deviceTest: 2, testResult: null }, { deviceTest: 2, testResult: 1 },
    ]))?.criteria).toEqual([{ id: 'defaults-work', rating: 'unknown' }, { id: 'iconography', rating: 'unknown' }, { id: 'text-input', rating: 'unknown' }]);
  });
  it('ignores malformed and excessive criterion results', () => {
    for (const results of [null, {}, true, Array(101).fill({ deviceTest: 0, testResult: 1 })]) {
      expect(parseHandheldCompatibility(id, payload(3, results))).toMatchObject({ rating: 'playable' });
      expect(parseHandheldCompatibility(id, payload(3, results))?.criteria).toBeUndefined();
    }
    expect(parseHandheldCompatibility(id, payload(1, [null, [], { deviceTest: '0', testResult: 1 }, { deviceTest: false, testResult: 1 },
      { deviceTest: -1, testResult: 1 }, { deviceTest: 5, testResult: 1 }, { deviceTest: 0, result: 1 },
      { deviceTest: 1, testResult: '1' }, { deviceTest: 2, testResult: true }, { deviceTest: 3, testResult: 4 }, { deviceTest: 4, testResult: 3 },
    ]))?.criteria).toEqual([{ id: 'supported-display', rating: 'playable' }]);
  });
});

describe('optional anonymous provider read', () => {
  it('uses one fixed public origin, an anonymous correlation vector and a bounded timeout', async () => {
    const fetcher = vi.fn(async () => Response.json(payload(1)));
    expect((await readHandheldCompatibility(id, 'GR', fetcher as typeof fetch))?.rating).toBe('optimized');
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`https://emerald.xboxservices.com/xboxcomfd/products/${id}?locale=en-GR`);
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error' });
    const headers = new Headers(init.headers);
    expect(headers.get('X-MS-API-Version')).toBe('1.0');
    expect(headers.get('MS-CV')).toMatch(/^[A-Za-z0-9+/]{22}\.0$/);
    expect(headers.has('Authorization')).toBe(false); expect(headers.has('Cookie')).toBe(false);
    expect(init.body).toBeUndefined(); expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it('rejects invalid product IDs before fetching and normalizes an invalid region safely', async () => {
    const fetcher = vi.fn(async () => Response.json(payload(1)));
    expect(await readHandheldCompatibility('../bad', 'US', fetcher as typeof fetch)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    await readHandheldCompatibility(id, '../bad', fetcher as typeof fetch);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('?locale=en-US');
  });
  it.each(['offline', 'unauthorized', 'redirect', 'invalid-json', 'empty', 'unrelated'] as const)('fails closed without affecting descriptions when %s', async mode => {
    const fetcher = (async () => {
      if (mode === 'offline') throw Error('Offline');
      if (mode === 'unauthorized') return new Response('Unavailable', { status: 401 });
      if (mode === 'redirect') return Response.redirect('https://login.live.com/');
      if (mode === 'invalid-json') return new Response('<html>Invalid JSON</html>');
      if (mode === 'empty') return new Response(null);
      return Response.json({ productSummaries: [{ ...summary(1), productId: '9AAAAAAAAAAA' }] });
    }) as typeof fetch;
    expect(await readHandheldCompatibility(id, 'US', fetcher)).toBeUndefined();
  });
  it('cancels a declared oversized response before reading it', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetcher = (async () => new Response(body, { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } })) as typeof fetch;
    expect(await readHandheldCompatibility(id, 'US', fetcher)).toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('bounds actual bytes even if content-length is absent or misleading', async () => {
    for (const headers of [undefined, { 'content-length': '1' }]) {
      const fetcher = (async () => new Response(' '.repeat(2 * 1024 * 1024) + JSON.stringify(payload(1)), { headers })) as typeof fetch;
      expect(await readHandheldCompatibility(id, 'US', fetcher)).toBeUndefined();
    }
  });
});

describe('Nexus catalog integration', () => {
  it('enriches only opened game details and preserves cloned cached descriptions, screenshots and criteria', async () => {
    const calls: string[] = [];
    const fetcher = (async (input: URL | RequestInfo) => {
      const url = new URL(String(input)); calls.push(String(url));
      return Response.json(url.hostname === 'emerald.xboxservices.com' ? payload(1, [{ deviceTest: 0, testResult: 1 }]) : description);
    }) as typeof fetch;
    const service = new CatalogService(fetcher), first = await service.gameDetails(id, 'US');
    expect(first).toMatchObject({ title: 'Example', description: 'Description', screenshots: ['https://store-images.s-microsoft.com/screenshot'], handheldCompatibility: { rating: 'optimized' } });
    first!.handheldCompatibility!.criteria![0].rating = 'unsupported';
    first!.title = 'Mutated';
    expect(await service.gameDetails(id, 'US')).toMatchObject({ title: 'Example', handheldCompatibility: { criteria: [{ id: 'defaults-work', rating: 'optimized' }] } });
    expect(calls).toHaveLength(2);
    await service.gameDetails(id, 'GB');
    expect(calls).toHaveLength(4); expect(calls[3]).toContain('?locale=en-GB');
  });
  it('keeps existing descriptions when the optional metadata service fails', async () => {
    const fetcher = (async (input: URL | RequestInfo) => {
      if (new URL(String(input)).hostname === 'emerald.xboxservices.com') throw Error('Offline');
      return Response.json(description);
    }) as typeof fetch;
    expect(await new CatalogService(fetcher).gameDetails(id, 'US')).toMatchObject({ title: 'Example', description: 'Description', screenshots: ['https://store-images.s-microsoft.com/screenshot'] });
  });
  it.each([{ Products: [] }, { Products: [{ ProductId: id, ProductType: 'Durable' }] }, { Products: [{ ProductId: id, ProductType: 'Game' }] }])('does not request metadata for missing or invalid descriptive records', async record => {
    const fetcher = vi.fn(async () => Response.json(record));
    expect(await new CatalogService(fetcher as typeof fetch).gameDetails(id, 'US')).toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain('displaycatalog.mp.microsoft.com');
  });
});
