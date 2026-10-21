import { expect, it } from 'vitest';
import { streamModalObscured } from './StreamModals';

function modal({ own = false, nested = false, mapped = true, visibility = 'visible' } = {}) {
  return { matches: () => own, closest: () => nested ? {} : null, getClientRects: () => mapped ? [1] : [], visibility } as unknown as HTMLElement;
}
const visibility = (node: HTMLElement) => (node as unknown as { visibility: string }).visibility;

it('obscures native streaming content for a visible trusted modal, excluding its own toolbar and descendants', () => {
  expect(streamModalObscured([], visibility)).toBe(false);
  expect(streamModalObscured([modal({own:true}), modal({nested:true})], visibility)).toBe(false);
  expect(streamModalObscured([modal({own:true}), modal()], visibility)).toBe(true);
});

it('releases obscuring when a dialog becomes unmapped or visually hidden', () => {
  expect(streamModalObscured([modal({mapped:false}), modal({visibility:'hidden'})], visibility)).toBe(false);
  expect(streamModalObscured([modal({visibility:'hidden'}), modal()], visibility)).toBe(true);
});
