import { useEffect, useRef } from 'react';
import type { GameContentPlan } from '../shared/types';

export function ContentList({ plan, disabled, selected, change }: { plan: GameContentPlan; disabled: boolean; selected: string[]; change: (ids: string[]) => void }) {
  const eligible = plan.items.filter(item => item.access && ['available', 'installed'].includes(item.status));
  const checked = eligible.filter(item => selected.includes(item.productId)).length;
  const all = useRef<HTMLInputElement>(null);
  useEffect(() => { if (all.current) all.current.indeterminate = checked > 0 && checked < eligible.length; }, [checked, eligible.length]);
  return <div className="content-list">
    {eligible.length ? <label className="content-select-all"><input ref={all} type="checkbox" checked={checked === eligible.length} disabled={disabled} aria-checked={checked > 0 && checked < eligible.length ? 'mixed' : checked === eligible.length} onChange={event => change(event.target.checked ? eligible.map(item => item.productId) : [])} /><strong>Select all</strong><span>{checked} / {eligible.length}</span></label> : null}
    {plan.items.length ? plan.items.map(item => <article key={item.productId}>
      <label className="content-choice"><input type="checkbox" aria-label={item.title} checked={selected.includes(item.productId)} disabled={disabled || !eligible.includes(item)} onChange={event => change(event.target.checked ? [...selected, item.productId] : selected.filter(id => id !== item.productId))} />
        <span><strong title={item.title} dir="auto">{item.title}</strong><small>{item.access === 'owned' ? 'Owned' : item.access === 'gamepass' ? 'Game Pass' : 'License not verified'}{' · '}{item.status === 'installed' ? 'Installed' : item.status === 'available' ? 'Not installed' : item.status === 'unsupported' ? 'Unsupported package' : 'Unavailable'}</small>
          {item.downloadBytes ? <small>Download: {(item.downloadBytes / 1024 ** 2).toFixed(1)} MiB</small> : null}<small>{item.note}</small></span>
      </label>
    </article>) : <p>No licensed downloadable content was found for this game.</p>}
  </div>;
}
