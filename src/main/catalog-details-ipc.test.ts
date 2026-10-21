import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { safeProductId } from '../shared/utils';
import { demoAccountProducts, demoGames } from '../shared/demo-data';

// Execute the actual catalog-details admission route with synthetic ports;
// no Electron process, account, desktop state, or public endpoint is accessed.
const source = ts.createSourceFile('index.ts', readFileSync('src/main/index.ts', 'utf8'), ts.ScriptTarget.ES2022, true);
const callbacks: ts.Expression[] = [];
function visit(node: ts.Node): void {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(source) === 'ipcMain'
      && node.expression.name.text === 'handle' && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'catalog-details') callbacks.push(node.arguments[1]);
  ts.forEachChild(node, visit);
}
visit(source);
if (callbacks.length !== 1) throw Error('Expected one guarded catalog-details route shared by normal and demo mode.');
const executable = ts.transpileModule('exports.handle=' + callbacks[0].getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function fixture(demoMode = false) {
  const contents = { mainFrame: {} }, details = { productId: '9AAAAAAAAAAA', title: 'Public product details', description: '', categories: [], screenshots: [] };
  const gameDetails = vi.fn(async () => details), systemSender = vi.fn();
  const context = vm.createContext({ exports: {} as { handle(event: unknown, id: unknown): unknown }, mainWindow: { webContents: contents },
    safeProductId, demoMode, demoAccountProducts, demoGames, shutdownStarted: false,
    catalog: { gameDetails }, systemSender, currentMarket: () => 'GB',
  });
  vm.runInContext(executable, context);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  return { gameDetails, systemSender, details, context, event, request: (raw: unknown, sender = event) => Promise.resolve().then(() => context.exports.handle(sender, raw)) };
}
describe('public Store details IPC admission', () => {
  it('normalizes a valid Store ID and queries only the public catalog in the configured market', async () => {
    const f = fixture(); expect(await f.request(' 9aaaaaaaaaaa ')).toBe(f.details);
    expect(f.systemSender).toHaveBeenCalledWith(f.event); expect(f.gameDetails).toHaveBeenCalledOnce(); expect(f.gameDetails).toHaveBeenCalledWith('9AAAAAAAAAAA', 'GB');
  });
  it.each([undefined, {}, 'https://example.test', '../9AAAAAAAAAAA', '9AAAAA', '9AAAA-AAAAAA'])('rejects malformed IDs before catalog access: %s', async raw => {
    const f = fixture(); await expect(f.request(raw)).rejects.toThrow(); expect(f.gameDetails).not.toHaveBeenCalled();
  });
  it('rejects foreign windows, subframes and unknown frames before catalog access', async () => {
    const f = fixture();
    for (const event of [{ sender: { mainFrame: f.event.senderFrame }, senderFrame: f.event.senderFrame },
      { sender: f.event.sender, senderFrame: {} }, { sender: f.event.sender, senderFrame: undefined }])
      await expect(f.request('9AAAAAAAAAAA', event as typeof f.event)).rejects.toThrow('from the launcher');
    expect(f.gameDetails).not.toHaveBeenCalled();
  });
  it('uses static known demo fixtures and returns unknown demo products without network calls', async () => {
    const f = fixture(true), sample = demoAccountProducts[0], installed = demoGames[0];
    expect(await f.request(sample.productId)).toEqual({ productId: sample.productId, title: sample.title, publisher: sample.publisher,
      description: 'Sample game details for the account-free demo.', categories: [], screenshots: [] });
    expect(await f.request(installed.storeId)).toMatchObject({ productId: installed.storeId, title: installed.title });
    expect(await f.request('9ZZZZZZZZZZZ')).toBeUndefined(); expect(f.gameDetails).not.toHaveBeenCalled();
  });
  it('does not start a catalog request during shutdown', async () => {
    const f = fixture(); f.context.shutdownStarted = true;
    await expect(f.request('9AAAAAAAAAAA')).rejects.toThrow('closing'); expect(f.gameDetails).not.toHaveBeenCalled();
  });
});
