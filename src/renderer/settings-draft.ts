import type { Settings } from '../shared/types';

/** Immediate optional preferences can publish snapshots while a user edits the
 * existing storage form. Rebase clean fields only, preserving unsaved edits. */
export function rebaseSettingsDraft(draft: Settings, previous: Settings, incoming: Settings): Settings {
  const merged = {...incoming};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(draft)] as (keyof Settings)[])) {
    if (!Object.is(draft[key], previous[key])) Object.assign(merged, {[key]: draft[key]});
  }
  return merged;
}
