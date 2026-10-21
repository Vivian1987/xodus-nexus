import {useEffect} from 'react';

export function streamModalObscured(nodes: Iterable<HTMLElement>, visibility = (node: HTMLElement) => getComputedStyle(node).visibility): boolean {
  return [...nodes].some(node => !node.matches('.remote-play-host,.cloud-gaming-host') && !node.closest('.remote-play-host,.cloud-gaming-host')
    && node.getClientRects().length > 0 && visibility(node) !== 'hidden');
}

/** Native streaming views sit above React. Keep them behind visible launcher
 * dialogs, while excluding their own trusted toolbar from modal discovery. */
export function StreamModals() {
  useEffect(() => {
    let active = true, frame = 0, previous: boolean | undefined;
    const update = () => {
      frame = 0; if (!active) return;
      const obscured = streamModalObscured(document.querySelectorAll<HTMLElement>('[aria-modal="true"],.guide-overlay'));
      if (obscured === previous) return;
      previous = obscured; document.body.toggleAttribute('data-stream-obscured', obscured);
      void window.launcher.setRemotePlayObscured?.(obscured).catch(() => {});
      void window.launcher.setCloudGamingObscured?.(obscured).catch(() => {});
    };
    const schedule = () => { if (active && !frame) frame = requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['aria-modal','hidden','aria-hidden','class','style']});
    window.addEventListener('resize', schedule);
    update();
    return () => {
      active = false; observer.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); document.body.removeAttribute('data-stream-obscured');
      void window.launcher.setRemotePlayObscured?.(false).catch(() => {});
      void window.launcher.setCloudGamingObscured?.(false).catch(() => {});
    };
  }, []);
  return null;
}
