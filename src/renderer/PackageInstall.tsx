import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { InstallPlan, InstallRequest } from '../shared/types';
import { useBackHandler } from './GuideNavigation';

type Install = (request: InstallRequest) => Promise<string | undefined>;
const InstallContext = createContext<Install>(async () => { throw Error('Installation dialog is unavailable.'); });
export const usePackageInstall = () => useContext(InstallContext);

/** An add-on or ambiguous plan always needs an explicit package choice. */
export function initialInstallContent(plan: InstallPlan): string | undefined {
  const supported = plan.choices.filter(item => item.supported);
  return plan.status === 'ready' && supported.length === 1 && supported[0].kind === 'Game' ? supported[0].contentId : undefined;
}

export function PackageDialog({ plan, choose }: { plan: InstallPlan; choose: (id?: string) => void }) {
  const [selected, setSelected] = useState('');
  const root = useRef<HTMLElement>(null), close = useRef(choose); close.current = choose;
  useBackHandler(() => { close.current(); return true; }, true, () => root.current);
  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const shell = document.querySelector<HTMLElement>('.app-shell'), inert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    root.current?.querySelector<HTMLButtonElement>('[data-gamepad-cancel]')?.focus({ preventScroll: true });
    return () => {
      if (shell) shell.inert = inert;
      requestAnimationFrame(() => {
        if (!origin?.isConnected || origin.closest('[inert]')) return;
        const top = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].filter(element => element.getClientRects().length).at(-1);
        if (!top || top.contains(origin)) origin.focus({ preventScroll: true });
      });
    };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) choose(); }}>
    <section ref={root} className="game-dialog package-dialog" role="dialog" aria-modal="true" aria-labelledby="package-dialog-title" onKeyDown={event => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? [])].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (!root.current?.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
    }}>
      <h2 id="package-dialog-title">Choose files to install</h2>
      <p>Choose the package you want to install from this Store offer. Xodus checks your license before downloading.</p>
      <div className="package-choices" role="radiogroup" aria-label="Available packages">{plan.choices.map(item => <label className={`package-choice${item.supported ? '' : ' unsupported'}`} key={`${item.productId}:${item.contentId}`}>
        <input type="radio" name="install-package" value={item.contentId} disabled={!item.supported} checked={selected === item.contentId} onChange={() => setSelected(item.contentId)} />
        <span><strong>{item.title}</strong><small>{item.platform || 'Unknown platform'} · {item.packageFormat || 'Unknown format'}{item.kind === 'GameAddOn' ? ' · Add-on' : ''}{!item.supported ? ' · Unsupported' : ''}</small><small>Store ID {item.productId}</small><small className="package-content-id">Package {item.contentId}</small></span>
      </label>)}</div>
      <div className="dialog-actions"><button className="secondary" data-gamepad-cancel onClick={() => choose()}>Cancel</button><button className="primary" disabled={!selected} onClick={() => choose(selected)}>Install selected package</button></div>
    </section>
  </div>;
}

export function PackageInstallProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<InstallPlan>();
  const pending = useRef<((id?: string) => void)>();
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; pending.current?.(); }; }, []);
  function choose(id?: string) { pending.current?.(id); pending.current = undefined; setPlan(undefined); }
  const install: Install = async request => {
    if (busy.current) throw Error('Finish the current package selection first.');
    busy.current = true;
    try {
      const result = await window.launcher.getInstallPlan(request.productId);
      if (!mounted.current) return;
      if (result.status === 'unavailable' || !result.choices.some(item => item.supported)) throw Error('No supported Windows.Desktop MSIXVC package was found for this Store offer.');
      if (result.rootProductId.toUpperCase() !== request.productId.toUpperCase()) throw Error('The package plan belongs to a different Store offer.');
      const selected = initialInstallContent(result)
        ?? await new Promise<string | undefined>(resolve => { pending.current = resolve; setPlan(result); });
      if (!selected || !mounted.current) return;
      if (!result.choices.some(item => item.supported && item.contentId === selected)) throw Error('The selected package is unavailable.');
      return await window.launcher.startInstall({ ...request, selectedContentId: selected, selectionMarket: result.market });
    } finally { busy.current = false; }
  };
  return <InstallContext.Provider value={install}>{children}{plan ? <PackageDialog plan={plan} choose={choose} /> : null}</InstallContext.Provider>;
}
