import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../shared/types';
import { useReferenceLocale } from './ReferenceLocale';
import './nexus-extra-settings.css';

export type NexusPreferencePatch = Partial<Pick<Settings, 'downloadNotifications' | 'createDesktopShortcut' | 'downloadSpeedUnit'>>;
export function NexusPreferencesSettings({ settings, onChange, busy = false }: {
  settings: Pick<Settings, 'downloadNotifications' | 'createDesktopShortcut' | 'downloadSpeedUnit'>;
  onChange(patch: NexusPreferencePatch): void | Promise<unknown>; busy?: boolean;
}) {
  const { text, preference, setPreference } = useReferenceLocale();
  const [pending, setPending] = useState(false), [error, setError] = useState(false);
  const locked = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function save(patch: NexusPreferencePatch) {
    if (busy || locked.current) return;
    locked.current = true; setPending(true); setError(false);
    try { await onChange(patch); }
    catch { if (alive.current) setError(true); }
    finally { locked.current = false; if (alive.current) setPending(false); }
  }
  const disabled = busy || pending;
  return <section className="settings-card nexus-preferences-settings" aria-label={text('Additional preferences', 'Πρόσθετες προτιμήσεις')} aria-busy={disabled}>
    <h2>{text('Additional preferences', 'Πρόσθετες προτιμήσεις')}</h2>
    <label className="nexus-preference-toggle"><input type="checkbox" checked={settings.downloadNotifications === true} disabled={disabled} onChange={event => void save({ downloadNotifications: event.target.checked })} /><span>{text('Notify me when a download finishes', 'Ειδοποίηση όταν ολοκληρώνεται μια λήψη')}</span></label>
    <label className="nexus-preference-toggle"><input type="checkbox" checked={settings.createDesktopShortcut === true} disabled={disabled} onChange={event => void save({ createDesktopShortcut: event.target.checked })} /><span>{text('Create a desktop shortcut after installation', 'Δημιουργία συντόμευσης επιφάνειας εργασίας μετά την εγκατάσταση')}</span></label>
    <label className="nexus-preference-select">{text('Download speed display', 'Εμφάνιση ταχύτητας λήψης')}<select aria-label={text('Download speed display', 'Εμφάνιση ταχύτητας λήψης')} value={settings.downloadSpeedUnit === 'bits' ? 'bits' : 'bytes'} disabled={disabled} onChange={event => void save({ downloadSpeedUnit: event.target.value === 'bits' ? 'bits' : 'bytes' })}><option value="bytes">{text('Bytes per second', 'Byte ανά δευτερόλεπτο')}</option><option value="bits">{text('Bits per second', 'Bit ανά δευτερόλεπτο')}</option></select></label>
    <small>{text('This changes the displayed rate. The bandwidth limit is configured separately.', 'Αυτό αλλάζει την εμφανιζόμενη ταχύτητα. Το όριο εύρους ζώνης ρυθμίζεται χωριστά.')}</small>
    <label className="nexus-preference-select">{text('Language for optional panels', 'Γλώσσα προαιρετικών πλαισίων')}<select aria-label={text('Language for optional panels', 'Γλώσσα προαιρετικών πλαισίων')} value={preference} onChange={event => setPreference(event.target.value === 'el' ? 'el' : event.target.value === 'en' ? 'en' : 'system')}><option value="system">{text('Follow system', 'Σύμφωνα με το σύστημα')}</option><option value="en">English</option><option value="el">Ελληνικά</option></select></label>
    <small>{text('Applies to the optional Game Bar, profile and added settings panels.', 'Ισχύει για το προαιρετικό Game Bar, το προφίλ και τα πρόσθετα πλαίσια ρυθμίσεων.')}</small>
    {error ? <p role="alert" className="error-text">{text('The preference could not be saved. Please retry.', 'Η προτίμηση δεν αποθηκεύτηκε. Δοκιμάστε ξανά.')}</p> : null}
  </section>;
}
