import { expect, it } from 'vitest';
import { demoSnapshot } from '../shared/demo-data';
import { installedCatalogGame, queuedCatalogProduct } from './catalog-navigation';
it('matches exact case-insensitive Store identity, including bundle install products', () => {
  const games = demoSnapshot().games; games[0].storeId = '9ABC'; games[1].storeId = '9DEF';
  expect(installedCatalogGame({ productId: '9abc' }, games)?.id).toBe(games[0].id);
  expect(installedCatalogGame({ productId: 'BUNDLE', installProductId: '9def' }, games)?.id).toBe(games[1].id);
  expect(installedCatalogGame({ productId: games[0].title }, games)).toBeUndefined();
});
it('retains distinct queue Product IDs when game titles collide and makes no installability claim', () => {
  const first = queuedCatalogProduct({ productId: '9ABC', title: 'Same title' });
  const second = queuedCatalogProduct({ productId: '9DEF', title: 'Same title' });
  expect(first?.productId).toBe('9ABC'); expect(second?.productId).toBe('9DEF');
  expect(first?.installability).toBe('unknown');
  expect(queuedCatalogProduct({ productId: ' ', title: 'Unknown' })).toBeUndefined();
});
