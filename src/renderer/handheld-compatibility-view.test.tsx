import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HandheldCompatibilityDialog, HandheldCompatibilityEntry } from './HandheldCompatibilityView';
import type { HandheldCompatibility } from '../shared/handheld-compatibility';

afterEach(() => vi.unstubAllGlobals());
const value = (rating: HandheldCompatibility['rating']): HandheldCompatibility => ({ rating, source: 'microsoft-catalog', platform: 'windows-pc', rawRating: ({ unknown: 0, optimized: 1, unsupported: 2, playable: 3 })[rating] });
it('keeps an unrated information entry enabled', () => {
  const html = renderToStaticMarkup(<HandheldCompatibilityEntry open={() => {}} />);
  expect(html).toContain('aria-haspopup="dialog"'); expect(html).toContain('data-handheld-rating="unknown"'); expect(html).not.toContain('disabled');
});
it.each(['unknown', 'optimized', 'playable', 'unsupported'] as const)('does not invent individual results or Linux verification from %s', rating => {
  const html = renderToStaticMarkup(<HandheldCompatibilityDialog title="Example" value={value(rating)} close={() => {}} />);
  expect(html.match(/data-criterion-state="not-provided"/g)).toHaveLength(5);
  expect(html).not.toContain('data-criterion-state="optimized"');
  expect(html).toContain('Linux / Proton compatibility has not been verified.'); expect(html).toContain('role="dialog"'); expect(html).toContain('aria-modal="true"');
  expect(html).not.toMatch(/FPS|frames per second|Linux verified|Steam Deck Verified|original-xbox|<img/);
});
it('renders individual provider results independently and keeps unknown checks unknown', () => {
  const classification: HandheldCompatibility = { ...value('playable'), criteria: [{ id: 'iconography', rating: 'optimized' }, { id: 'text-input', rating: 'unsupported' }, { id: 'defaults-work', rating: 'unknown' }] };
  const html = renderToStaticMarkup(<HandheldCompatibilityDialog title="Example" value={classification} close={() => {}} />);
  expect(html.match(/data-criterion-state="optimized"/g)).toHaveLength(1); expect(html.match(/data-criterion-state="unsupported"/g)).toHaveLength(1);
  expect(html.match(/data-criterion-state="not-provided"/g)).toHaveLength(3); expect(html).toContain('Requirement not met');
});
it('uses plain generic labels and public Lucide symbols without loading external assets', () => {
  const html = renderToStaticMarkup(<HandheldCompatibilityDialog title="Example" close={() => {}} />);
  for (const label of ['Default setup', 'Button prompts', 'Text input', 'Interface readability', 'Display support']) expect(html).toContain(label);
  expect(html).toContain('lucide'); expect(html).not.toContain('src=');
});
it('localizes both the affordance and Windows-only explanation', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'el' });
  expect(renderToStaticMarkup(<HandheldCompatibilityEntry open={() => {}} />)).toContain('Συμβατότητα συσκευής χειρός');
  const html = renderToStaticMarkup(<HandheldCompatibilityDialog title="Example" close={() => {}} />);
  expect(html).toContain('Η συμβατότητα Linux / Proton δεν έχει επαληθευτεί.'); expect(html).toContain('Δεν έχει δοθεί αποτέλεσμα');
});
