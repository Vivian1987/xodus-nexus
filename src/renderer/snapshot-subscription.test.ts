import { expect, it, vi } from 'vitest';
import type { AppSnapshot } from '../shared/types';
import { observeNexusSnapshot } from './snapshot-subscription';
const snapshot = (username: string) => ({auth:{username}} as AppSnapshot);
function fixture() {
  let event!: (value: AppSnapshot) => void, resolve!: (value: AppSnapshot) => void, reject!: (value: unknown) => void;
  const initial = new Promise<AppSnapshot>((yes,no) => {resolve=yes;reject=no;});
  const unsubscribe = vi.fn(), changed = vi.fn(), failed = vi.fn(), order:string[]=[];
  const stop = observeNexusSnapshot({onSnapshot(fn){order.push('subscribe');event=fn;return unsubscribe;},getSnapshot(){order.push('read');return initial;}},changed,failed);
  return {event:(value:AppSnapshot)=>event(value),resolve,reject,changed,failed,unsubscribe,stop,order};
}
it('subscribes before reading and never replaces a newer account/operation event', async()=>{
  const f=fixture(); await Promise.resolve(); expect(f.order).toEqual(['subscribe','read']);
  f.event(snapshot('current')); f.resolve(snapshot('old')); await vi.waitFor(()=>expect(f.changed).toHaveBeenCalledOnce());
  expect(f.changed).toHaveBeenLastCalledWith(snapshot('current')); f.stop();
});
it('accepts initial data with no newer event and reports only current errors',async()=>{
  const f=fixture(); f.resolve(snapshot('initial')); await vi.waitFor(()=>expect(f.changed).toHaveBeenCalledWith(snapshot('initial')));f.stop();
  const g=fixture();g.reject(Error('initial failure'));await vi.waitFor(()=>expect(g.failed).toHaveBeenCalledOnce());g.stop();
});
it('suppresses stale initial failure and every late completion after unmount',async()=>{
  const f=fixture();f.event(snapshot('new'));f.reject(Error('old'));await Promise.resolve();await Promise.resolve();expect(f.failed).not.toHaveBeenCalled();f.stop();
  const g=fixture();g.stop();g.event(snapshot('late'));g.resolve(snapshot('late initial'));await Promise.resolve();await Promise.resolve();expect(g.changed).not.toHaveBeenCalled();expect(g.unsubscribe).toHaveBeenCalledOnce();
});
