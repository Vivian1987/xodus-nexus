import { randomBytes } from 'node:crypto';
import type { HandheldCompatibility } from '../shared/handheld-compatibility.js';

const RESPONSE_LIMIT = 2 * 1024 * 1024;
const RATINGS: HandheldCompatibility['rating'][] = ['unknown', 'optimized', 'unsupported', 'playable'];
const CRITERIA = ['defaults-work', 'iconography', 'text-input', 'ui-legibility', 'supported-display'] as const;
const validId = (id: string) => /^[A-Z0-9]{12}$/.test(id);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const rating = (value: unknown): HandheldCompatibility['rating'] | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? RATINGS[value] : undefined;

function criteria(value: unknown): HandheldCompatibility['criteria'] {
  if (!Array.isArray(value) || value.length > 100) return;
  type Criterion = NonNullable<HandheldCompatibility['criteria']>[number];
  const seen = new Set<Criterion['id']>(), results = new Map<Criterion['id'], Criterion['rating']>();
  for (const entry of value) {
    const row = record(entry), test = row?.deviceTest;
    if (typeof test !== 'number' || !Number.isInteger(test)) continue;
    const id = CRITERIA[test];
    if (!id) continue;
    // Ambiguous duplicates cannot leave a successful result behind.
    if (seen.has(id)) { results.set(id, 'unknown'); continue; }
    seen.add(id);
    const result = rating(row?.testResult);
    if (result) results.set(id, result);
  }
  return results.size ? [...results].map(([id, result]) => ({ id, rating: result })) : undefined;
}

/** Parse only explicit Xbox public product-summary results for this exact game. */
export function parseHandheldCompatibility(productId: string, payload: unknown): HandheldCompatibility | undefined {
  if (!validId(productId)) return;
  const summaries = record(payload)?.productSummaries;
  if (!Array.isArray(summaries) || summaries.length > 100) return;
  const matches = summaries.map(record).filter(product =>
    typeof product?.productId === 'string' && product.productId.trim().toUpperCase() === productId);
  // Do not borrow a bundle child's rating or choose between duplicate records.
  if (matches.length !== 1 || matches[0]?.productKind !== 'Game') return;
  const verified = record(matches[0].hhVerified), rawRating = verified?.deviceEvaluation;
  const result = rating(rawRating);
  if (!result) return;
  const individual = criteria(verified?.deviceResults);
  return { rating: result, rawRating: rawRating as number, source: 'microsoft-catalog', platform: 'windows-pc',
    ...(individual ? { criteria: individual } : {}) };
}

async function boundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get('content-length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > RESPONSE_LIMIT) {
    await response.body?.cancel();
    throw Error('Handheld metadata exceeds the response limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('Handheld metadata body is missing.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > RESPONSE_LIMIT) throw Error('Handheld metadata exceeds the response limit.');
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks, length).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Optional anonymous metadata, fetched only when a game details page is opened. */
export async function readHandheldCompatibility(productId: string, market: string, fetcher: typeof fetch = fetch): Promise<HandheldCompatibility | undefined> {
  if (!validId(productId)) return;
  const region = /^[A-Z]{2}$/.test(market) ? market : 'US';
  const url = new URL(`https://emerald.xboxservices.com/xboxcomfd/products/${productId}`);
  url.searchParams.set('locale', `en-${region}`);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'X-MS-API-Version': '1.0', 'MS-CV': `${randomBytes(16).toString('base64').replace(/=+$/, '')}.0` },
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) { await response.body?.cancel(); return; }
    return parseHandheldCompatibility(productId, await boundedJson(response));
  } catch { return; }
}
