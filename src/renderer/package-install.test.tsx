import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
import type { InstallPlan } from '../shared/types';
import { initialInstallContent, PackageDialog } from './PackageInstall';

it('only auto-selects one ready base game, leaving add-ons and ambiguous plans explicit', () => {
  const base = { productId: '9BBBBBBBBBBB', contentId: '11111111-1111-4111-8111-111111111111', title: 'Base', platform: 'Windows.Desktop', packageFormat: 'MSIXVC', kind: 'Game', supported: true };
  const plan: InstallPlan = { schema: 1, rootProductId: '9AAAAAAAAAAA', market: 'US', status: 'ready', choices: [base] };
  expect(initialInstallContent(plan)).toBe(base.contentId);
  expect(initialInstallContent({ ...plan, status: 'choice' })).toBeUndefined();
  expect(initialInstallContent({ ...plan, choices: [{ ...base, kind: 'GameAddOn' }] })).toBeUndefined();
  expect(initialInstallContent({ ...plan, choices: [base, { ...base, contentId: 'other' }] })).toBeUndefined();
  expect(initialInstallContent({ ...plan, choices: [{ ...base, supported: false }] })).toBeUndefined();
});

it('shows verified package names, IDs, platform and disabled unsupported choices without auto-selection', () => {
  const plan: InstallPlan = { schema: 1, rootProductId: '9AAAAAAAAAAA', market: 'US', status: 'choice', choices: [
    { productId: '9BBBBBBBBBBB', contentId: '11111111-1111-4111-8111-111111111111', title: 'PC base game', platform: 'Windows.Desktop', packageFormat: 'MSIXVC', kind: 'Game', supported: true },
    { productId: '9CCCCCCCCCCC', contentId: '22222222-2222-4222-8222-222222222222', title: '<Console game>', platform: 'Xbox.One', packageFormat: 'XVC', kind: 'Game', supported: false },
  ] };
  const html = renderToStaticMarkup(<PackageDialog plan={plan} choose={() => {}} />);
  expect(html).toContain('PC base game'); expect(html).toContain('Windows.Desktop'); expect(html).toContain('9BBBBBBBBBBB');
  expect(html).toContain('&lt;Console game&gt;'); expect(html).toContain('Unsupported');
  expect(html.match(/disabled=""/g)).toHaveLength(2); expect(html).not.toContain('checked=""');
  expect(html).toContain('Cancel'); expect(html).toContain('checks your license');
});

// Run the actual provider with small hook/JSX adapters so async plan selection,
// cancellation and its final IPC request are tested without a real account.
function providerRuntime(plan: InstallPlan) {
  const getInstallPlan = vi.fn(async () => plan), startInstall = vi.fn(async () => 'task-1');
  let cursor = 0; const slots: any[] = [], cleanups: (() => void)[] = [];
  const hooks = {
    createContext: () => ({ Provider: 'TestInstallProvider' }), useContext: () => undefined,
    useState: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: unknown) => { slots[index] = value; }]; },
    useRef: (initial: unknown) => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect: (effect: () => (() => void) | undefined) => { const index = cursor++; if (!(index in slots)) { slots[index] = true; const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } },
  };
  const exports: Record<string, any> = {}, code = ts.transpileModule(readFileSync(new URL('./PackageInstall.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const imports: Record<string, unknown> = { react: hooks, 'react/jsx-runtime': jsxRuntime, './GuideNavigation': { useBackHandler: () => {} } };
  runInNewContext(code, { exports, require: (id: string) => { if (!(id in imports)) throw Error(`Unexpected import: ${id}`); return imports[id]; }, window: { launcher: { getInstallPlan, startInstall } } });
  const render = () => { cursor = 0; return exports.PackageInstallProvider({ children: 'Existing Nexus content' }); };
  const tree = render();
  return { getInstallPlan, startInstall, install: tree.props.value as (request: object) => Promise<unknown>, render,
    dialog: () => render().props.children[1], unmount: () => cleanups.forEach(cleanup => cleanup()) };
}
const request = { productId: '9AAAAAAAAAAA', destination: '/games/chosen', title: 'Requested Store offer' };
const choice = { productId: '9BBBBBBBBBBB', contentId: '11111111-1111-4111-8111-111111111111', title: 'Base', platform: 'Windows.Desktop', packageFormat: 'MSIXVC', kind: 'Game', supported: true };
const plan: InstallPlan = { schema: 1, rootProductId: request.productId, market: 'CZ', status: 'ready', choices: [choice] };
it('forwards only the verified base package, original destination and selection market to installation', async () => {
  const app = providerRuntime(plan);
  expect(await app.install(request)).toBe('task-1');
  expect(app.getInstallPlan).toHaveBeenCalledWith(request.productId);
  expect(app.startInstall).toHaveBeenCalledOnce(); expect(app.startInstall).toHaveBeenCalledWith({ ...request, selectedContentId: choice.contentId, selectionMarket: 'CZ' });
  expect(app.dialog()).toBeNull();
});
it('requires an explicit add-on choice, blocks a second request and resolves cancellation without installing', async () => {
  const app = providerRuntime({ ...plan, choices: [{ ...choice, kind: 'GameAddOn' }] });
  const pending = app.install(request); await new Promise(resolve => setImmediate(resolve));
  expect(app.dialog().props.plan.choices[0].kind).toBe('GameAddOn'); expect(app.startInstall).not.toHaveBeenCalled();
  await expect(app.install(request)).rejects.toThrow('Finish the current');
  app.dialog().props.choose(); await expect(pending).resolves.toBeUndefined(); expect(app.startInstall).not.toHaveBeenCalled();
  const next = app.install(request); await new Promise(resolve => setImmediate(resolve)); app.dialog().props.choose(choice.contentId);
  await expect(next).resolves.toBe('task-1'); expect(app.startInstall).toHaveBeenCalledOnce();
});
it('does not install a stale Store plan or a package selection resolved after unmount', async () => {
  const stale = providerRuntime({ ...plan, rootProductId: '9CCCCCCCCCCC' });
  await expect(stale.install(request)).rejects.toThrow('different Store offer'); expect(stale.startInstall).not.toHaveBeenCalled();
  const app = providerRuntime({ ...plan, status: 'choice' }), pending = app.install(request); await new Promise(resolve => setImmediate(resolve));
  app.unmount(); await expect(pending).resolves.toBeUndefined(); expect(app.startInstall).not.toHaveBeenCalled();
});
