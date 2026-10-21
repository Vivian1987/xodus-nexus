import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { dispatchBackHandlers, registerBackHandler } from './guide-navigation';

// Execute production Back/Escape closures with isolated DOM scope ports. This
// catches integration gaps between baseline Nexus navigation and the optional
// scoped handlers without starting a browser or polling a physical controller.
const source = ts.createSourceFile('gamepad-navigation.ts', readFileSync('src/renderer/gamepad-navigation.ts', 'utf8'), ts.ScriptTarget.ES2022, true);
const install = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'installGamepadNavigation') as ts.FunctionDeclaration;
const statements = install.body!.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && ['back', 'keyboard'].includes(declaration.name.text)));
if (statements.length !== 2) throw Error('Production Back and Escape closures were not found.');
const executable = ts.transpileModule(statements.map(node => ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, source)).join('\n') + '\nexports.back=back; exports.keyboard=keyboard;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function fixture() {
  class Element {
    isConnected = true; cancel?: Element; click = vi.fn(); children = new Set<Element>();
    constructor(private menu = false) {}
    hasAttribute(name: string) { return name === 'data-game-menu' && this.menu; }
    contains(node: Element) { return node === this || this.children.has(node); }
    querySelector() { return this.cancel; }
  }
  const doc = { querySelectorAll: () => [] }, win = { document: doc, dispatchEvent: vi.fn(), requestAnimationFrame: vi.fn() } as unknown as Window;
  const home = vi.fn(), pageFocus = vi.fn(), pointer = vi.fn(), closePicker = vi.fn();
  const context = vm.createContext({ exports: {} as { back(): void; keyboard(event: unknown): void },
    win, doc, scope: doc, picker: undefined, pendingDetail: undefined, detailReturn: undefined, escapeFromPad: false,
    HTMLElement: Element, KeyboardEvent: class {}, dispatchBackHandlers, currentScope: () => context.scope,
    closePicker, pointer, enabled: () => true, options: { back: home }, pageFocus,
    focus: vi.fn(), focused: () => undefined,
  });
  vm.runInContext(executable, context);
  return { context, win, doc, Element, home, pageFocus, pointer, closePicker, back: context.exports.back, keyboard: context.exports.keyboard };
}
describe('baseline Nexus and scoped optional Back integration', () => {
  it('controller B dismisses the scoped More ReferenceMenu before main Home', () => {
    const f = fixture(), menu = new f.Element(true), dismiss = vi.fn(() => true);
    f.context.scope = menu; registerBackHandler(f.win, dismiss, () => menu as unknown as HTMLElement);
    f.back(); expect(dismiss).toHaveBeenCalledOnce(); expect(f.home).not.toHaveBeenCalled(); expect(f.win.dispatchEvent).not.toHaveBeenCalled();
  });
  it('controller B reaches the scoped Remote Play back/close action without navigating the main page', () => {
    const f = fixture(), remote = new f.Element(), control = vi.fn(); let canGoBack = true;
    remote.cancel = new f.Element(); f.context.scope = remote;
    registerBackHandler(f.win, () => { control(canGoBack ? 'back' : 'close'); return true; }, () => remote as unknown as HTMLElement);
    f.back(); canGoBack = false; f.back();
    expect(control.mock.calls).toEqual([['back'], ['close']]); expect(remote.cancel.click).not.toHaveBeenCalled(); expect(f.home).not.toHaveBeenCalled();
  });
  it('leaves a newer ordinary modal above an older registered menu and uses its existing cancel action', () => {
    const f = fixture(), menu = new f.Element(true), modal = new f.Element(), dismissMenu = vi.fn(() => true);
    modal.cancel = new f.Element(); f.context.scope = modal; registerBackHandler(f.win, dismissMenu, () => menu as unknown as HTMLElement);
    f.back(); expect(modal.cancel.click).toHaveBeenCalledOnce(); expect(dismissMenu).not.toHaveBeenCalled(); expect(f.home).not.toHaveBeenCalled();
  });
  it('preserves the native select-picker precedence over scoped handlers for B and Escape', () => {
    const f = fixture(), menu = new f.Element(true), dismiss = vi.fn(() => true);
    f.context.scope = menu; f.context.picker = {}; registerBackHandler(f.win, dismiss, () => menu as unknown as HTMLElement);
    f.back(); const event = { key: 'Escape', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }; f.keyboard(event);
    expect(f.closePicker.mock.calls).toEqual([[true], [true]]); expect(dismiss).not.toHaveBeenCalled(); expect(f.home).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });
  it('keyboard Escape consumes the current registered menu once and prevents duplicate local handling', () => {
    const f = fixture(), menu = new f.Element(true), dismiss = vi.fn(() => true); f.context.scope = menu;
    registerBackHandler(f.win, dismiss, () => menu as unknown as HTMLElement);
    const event = { key: 'Escape', preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }; f.keyboard(event);
    expect(dismiss).toHaveBeenCalledOnce(); expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopImmediatePropagation).toHaveBeenCalledOnce(); expect(f.home).not.toHaveBeenCalled();
  });
  it('keeps the original Home fallback when no popup consumes Back, without calling registrations twice', () => {
    const f = fixture(), decline = vi.fn(() => false); registerBackHandler(f.win, decline);
    f.back(); expect(decline).toHaveBeenCalledOnce(); expect(f.home).toHaveBeenCalledOnce(); expect(f.pageFocus).toHaveBeenCalledOnce();
  });
});
