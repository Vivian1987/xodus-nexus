import { describe, expect, it } from 'vitest';
import { CatalogService, parseCatalogProducts } from './catalog.js';

const search = {
  productsList: [{
    productId: '9game123',
    title: 'Purchased Game',
    description: 'A real Store description.',
    publisherName: 'Studio',
    isGame: true,
    posterArtUrl: 'https://store-images.s-microsoft.com/image/poster',
    redirectUrl: 'https://www.xbox.com/games/store/game/9game123',
    priceInfo: { displayPrice: '$29.99' },
    plaintextPassName: undefined,
    categories: ['Action'],
  }, {
    productId: '9bundle1',
    title: 'Bundle Game',
    description: 'Bundle',
    isGame: true,
    plaintextPassName: 'Xbox Game Pass',
  }],
  cursor: 'next_page',
  hasMorePages: true,
};

const catalog = {
  Products: [{
    ProductId: '9GAME123',
    DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [{
      PackageFormat: 'MSIXVC',
      PlatformDependencies: [{ PlatformName: 'Windows.Desktop' }],
    }] } } }],
  }, {
    ProductId: '9BUNDLE1',
    DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [] } } }],
  }],
};

describe('Microsoft Store catalog parsing', () => {
  it('separates purchase price, subscription availability, and Xodus package support', () => {
    const products = parseCatalogProducts(search, catalog);
    expect(products[0]).toMatchObject({
      productId: '9GAME123',
      purchasePrice: '$29.99',
      includedWith: undefined,
      installability: 'supported',
      packageFormat: 'MSIXVC',
    });
    expect(products[1]).toMatchObject({
      includedWith: 'Xbox Game Pass',
      installability: 'unsupported',
    });
  });

  it('rejects image URLs outside Microsoft Store hosts', () => {
    const products = parseCatalogProducts({ productsList: [{ ...search.productsList[0], posterArtUrl: 'https://example.com/tracker.png' }] }, catalog);
    expect(products[0].posterUrl).toBeUndefined();
  });

  it('prefers branded box art over textless poster art', () => {
    const products = parseCatalogProducts({ productsList: [{ ...search.productsList[0], boxArtUrl: 'https://store-images.s-microsoft.com/image/boxart' }] }, catalog);
    expect(products[0].posterUrl).toBe('https://store-images.s-microsoft.com/image/boxart');
  });

  it('resolves a Store edition to its single primary bundled MSIXVC product', () => {
    const products = parseCatalogProducts({ productsList: [{ productId: '9edition', title: 'Game Standard Edition', isGame: true }] }, {
      Products: [{
        ProductId: '9EDITION',
        DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [], BundledSkus: [
          { BigId: '9package', IsPrimary: true },
          { BigId: '9bonus', IsPrimary: false },
        ] } } }],
      }, {
        ProductId: '9PACKAGE',
        DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [{
          PackageFormat: 'MSIXVC', PlatformDependencies: [{ PlatformName: 'Windows.Desktop' }],
        }] } } }],
      }, {
        ProductId: '9BONUS',
        DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [] } } }],
      }],
    });
    expect(products[0]).toMatchObject({
      productId: '9EDITION',
      installProductId: '9PACKAGE',
      installability: 'supported',
      packageFormat: 'MSIXVC',
    });
  });

  it('does not treat an unsupported direct EAppx package as a resolvable bundle', () => {
    const products = parseCatalogProducts({ productsList: [{ productId: '9eappx', title: 'Legacy PC Game', isGame: true }] }, {
      Products: [{
        ProductId: '9EAPPX',
        DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [{
          PackageFormat: 'EAppx', PlatformDependencies: [{ PlatformName: 'Windows.Desktop' }],
        }], BundledSkus: [{ BigId: '9package', IsPrimary: true }] } } }],
      }],
    });
    expect(products[0]).toMatchObject({ installability: 'unsupported', packageFormat: 'EAPPX' });
    expect(products[0].installProductId).toBeUndefined();
  });
});

describe('CatalogService', () => {
  it('queries games and enriches them with display catalog package metadata', async () => {
    const urls: string[] = [];
    const fetcher = (async (input: URL | RequestInfo) => {
      const url = String(input); urls.push(url);
      return new Response(JSON.stringify(url.includes('displaycatalog') ? catalog : search), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const result = await new CatalogService(fetcher).search('gears', 'neutral');
    expect(result.market).toBe('US');
    expect(result.hasMore).toBe(true);
    expect(result.products[0].installability).toBe('supported');
    expect(urls[0]).toContain('mediaType=games');
    expect(urls[1]).toContain('bigIds=9GAME123%2C9BUNDLE1');
  });

  it('loads the live computed games collection and enriches its products', async () => {
    const urls: string[] = [];
    const fetcher = (async (input: URL | RequestInfo) => {
      const url = String(input); urls.push(url);
      return new Response(JSON.stringify(url.includes('displaycatalog') ? catalog : { ...search, title: 'Trending games' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    const result = await new CatalogService(fetcher).featured('CZ');
    expect(result.query).toBe('Trending games');
    expect(result.market).toBe('CZ');
    expect(result.hasMore).toBe(false);
    expect(urls[0]).toContain('GetComputedProductsList');
    expect(urls[0]).toContain('mediaType=Games');
  });

  it('looks up Store cover artwork by Product ID, preferring square box art, and rejects foreign hosts', async () => {
    const fetcher = (async (input: URL | RequestInfo) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes('displaycatalog') ? {
        Products: [{
          ProductId: '9GAME123',
          LocalizedProperties: [{ Images: [
            { ImagePurpose: 'Logo', Uri: '//store-images.s-microsoft.com/image/logo' },
            { ImagePurpose: 'FeaturePromotionalSquareArt', Uri: '//store-images.s-microsoft.com/image/promo' },
            { ImagePurpose: 'BoxArt', Uri: '//store-images.s-microsoft.com/image/boxart' },
          ] }],
        }, {
          ProductId: '9FOREIGN',
          LocalizedProperties: [{ Images: [
            { ImagePurpose: 'BoxArt', Uri: '//tracker.example.com/image/boxart' },
          ] }],
        }],
      } : search), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const posters = await new CatalogService(fetcher).posters(['9game123', '9foreign', 'bad id'], 'US');
    expect(posters.get('9GAME123')).toBe('https://store-images.s-microsoft.com/image/boxart');
    expect(posters.has('9FOREIGN')).toBe(false);
  });
});
