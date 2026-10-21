import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NexusFeatureMenu, nexusFeaturePages, nexusPages, observeXboxModeEntryRequests } from './NexusFeatures';
function fixture() {
  let requested!:()=>void, fullscreen!:(value:boolean)=>void, resolve!:(value:boolean)=>void;
  const surface={fullscreenElement:null as object|null,hasFocus:()=>true};let permitted=true;
  const open=vi.fn(), read=vi.fn(()=>new Promise<boolean>(yes=>{resolve=yes;}));
  const nativeStop=vi.fn(),requestStop=vi.fn();
  const stop=observeXboxModeEntryRequests(surface,{onXboxModeEntryRequested(fn){requested=fn;return requestStop;},getWindowFullscreen:read,onWindowFullscreenChanged(fn){fullscreen=fn;return nativeStop;}},()=>permitted,open);
  return {surface,open,read,stop,requested:()=>requested(),native:(value:boolean)=>fullscreen(value),resolve:(value:boolean)=>resolve(value),permit:(value:boolean)=>{permitted=value;},nativeStop,requestStop};
}
it('keeps optional destinations inside an ordinary closed Nexus More menu',()=>{
  const markup=renderToStaticMarkup(<NexusFeatureMenu page="home" go={()=>{}}/>);
  expect(markup).toContain('More');expect(markup).toContain('aria-expanded="false"');expect(markup).not.toContain('role="menu"');
  expect(nexusFeaturePages.every(page=>nexusPages.includes(page))).toBe(true);
});
it('admits only focused desktop requests without another modal',async()=>{
  const f=fixture();f.permit(false);f.requested();expect(f.read).not.toHaveBeenCalled();f.permit(true);f.requested();f.resolve(false);await Promise.resolve();expect(f.open).toHaveBeenCalledOnce();f.stop();
});
it('rejects a late native read after DOM fullscreen, a new native event or disposal',async()=>{
  const f=fixture();f.requested();f.surface.fullscreenElement={};f.resolve(false);await Promise.resolve();expect(f.open).not.toHaveBeenCalled();f.stop();
  const g=fixture();g.requested();g.native(true);g.resolve(false);await Promise.resolve();expect(g.open).not.toHaveBeenCalled();g.stop();expect(g.nativeStop).toHaveBeenCalledOnce();
  const h=fixture();h.stop.request();h.stop();h.resolve(false);await Promise.resolve();expect(h.open).not.toHaveBeenCalled();expect(h.requestStop).toHaveBeenCalledOnce();
});
