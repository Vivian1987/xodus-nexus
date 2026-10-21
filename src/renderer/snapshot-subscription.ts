import type { AppSnapshot } from '../shared/types';

/** Subscribe before reading; late initial data cannot replace account/operation events. */
export function observeNexusSnapshot(
  bridge: { getSnapshot(): Promise<AppSnapshot>; onSnapshot(changed: (value: AppSnapshot) => void): () => void },
  changed: (value: AppSnapshot) => void, failed: (error: unknown) => void,
) {
  let active = true, revision = 0;
  const stop = bridge.onSnapshot(value => {if (active) {revision++; changed(value);}});
  const initial = revision;
  void Promise.resolve().then(() => bridge.getSnapshot()).then(value => {
    if (active && revision === initial) changed(value);
  }).catch(error => {if (active && revision === initial) failed(error);});
  return () => {active = false; stop();};
}
