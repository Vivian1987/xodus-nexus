import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import type { CatalogProduct, GameStoreDetails } from '../shared/types';

// Execute the production Store selection function and initial-product effect.
// No React mount, IPC request, account, filesystem game, or catalog endpoint.
const source = ts.createSourceFile('App.tsx', readFileSync('src/renderer/App.tsx', 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const store = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'StorePage') as ts.FunctionDeclaration;
const selection = store.body!.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'selectProduct');
const effect = store.body!.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
  && node.expression.expression.getText(source) === 'useEffect' && node.expression.arguments[1]?.getText(source) === '[initialProduct]') as ts.ExpressionStatement;
if (!selection || !effect || !ts.isCallExpression(effect.expression)) throw Error('Production Store selection boundary was not found.');
const executable = ts.transpileModule(selection.getText(source) + '\nexports.selectProduct=selectProduct; exports.effect=' + effect.expression.arguments[0].getText(source), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const initial: CatalogProduct = { productId: '9AAAAAAAAAAA', installProductId: '9CCCCCCCCCCC', title: 'Initial game', description: '', categories: [], purchasePrice: '$10', installability: 'unknown', supportNote: 'Package not verified' };
const details: GameStoreDetails = { productId: initial.productId, title: 'Hydrated title', description: 'Public game description', categories: ['Action'], screenshots: [] };
function fixture() {
  let selected: CatalogProduct | undefined, destination = '', resolve!: (value: GameStoreDetails | undefined) => void;
  const getCatalogDetails = vi.fn(() => new Promise<GameStoreDetails | undefined>(done => { resolve = done; }));
  const setSelected = (value: CatalogProduct | undefined | ((current?: CatalogProduct) => CatalogProduct | undefined)) => { selected = typeof value === 'function' ? value(selected) : value; };
  const context = vm.createContext({ exports: {} as { selectProduct(product: CatalogProduct): void; effect(): () => void },
    initialProduct: initial, selectionRevision: { current: 0 }, setSelected, setDestination: (value: string) => { destination = value; },
    installDestination: (product: CatalogProduct) => `/synthetic/${product.productId}`, window: { launcher: { getCatalogDetails } },
  });
  vm.runInContext(executable, context);
  const cleanup = context.exports.effect();
  return { getCatalogDetails, cleanup, select: context.exports.selectProduct, setSelected, selected: () => selected, destination: () => destination,
    resolve: async (value: GameStoreDetails | undefined) => { resolve(value); await Promise.resolve(); } };
}
describe('Store initial-product metadata hydration', () => {
  it('cannot replace an explicitly selected other product or pair it with the other destination', async () => {
    const f = fixture(), other = { ...initial, productId: '9BBBBBBBBBBB', title: 'Explicit selection' };
    f.select(other); await f.resolve(details);
    expect(f.selected()).toBe(other); expect(f.destination()).toBe('/synthetic/9BBBBBBBBBBB');
  });
  it('does not replay an old request after the user selects another game and then the same ID again', async () => {
    const f = fixture(), latest = { ...initial, description: 'Explicit latest listing', purchasePrice: '$5' };
    f.select({ ...initial, productId: '9BBBBBBBBBBB' }); f.select(latest); await f.resolve(details);
    expect(f.selected()).toBe(latest);
  });
  it('merges the matching description while preserving current package, price and support fields', async () => {
    const f = fixture(); await f.resolve(details);
    expect(f.getCatalogDetails).toHaveBeenCalledWith(initial.productId);
    expect(f.selected()).toMatchObject({ ...details, installProductId: initial.installProductId, purchasePrice: '$10', installability: 'unknown', supportNote: initial.supportNote });
    expect(f.destination()).toBe('/synthetic/9AAAAAAAAAAA');
  });
  it('does not resurrect a selection cleared while metadata was loading', async () => {
    const f = fixture(); f.setSelected(undefined); await f.resolve(details); expect(f.selected()).toBeUndefined();
  });
  it('rejects an alias or different product response rather than relabelling its details as the requested game', async () => {
    const f = fixture(); await f.resolve({ ...details, productId: initial.installProductId! }); expect(f.selected()).toBe(initial);
  });
  it('ignores a delayed completion after its effect was cleaned up', async () => {
    const f = fixture(); f.cleanup(); await f.resolve(details); expect(f.selected()).toBe(initial);
  });
});
