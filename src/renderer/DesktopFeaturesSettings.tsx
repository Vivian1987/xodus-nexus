import { useEffect, useRef, useState } from 'react';
import type { DesktopSettingsStatus, Settings } from '../shared/types';
import { Gamepad2, Monitor } from './NexusIcons';
import { useReferenceLocale } from './ReferenceLocale';
import './desktop-features-settings.css';

export interface DesktopFeaturesSettingsProps {
  settings: Pick<Settings, 'launchOnLogin' | 'launchInBackground' | 'minimizeToTray'>;
  status?: DesktopSettingsStatus;
  busy?: boolean;
  onChange(patch: Partial<Pick<Settings, 'launchOnLogin' | 'launchInBackground' | 'minimizeToTray'>>): void | Promise<unknown>;
  onOpenGameBar(): void | Promise<unknown>;
  onEnterXboxMode(): void | Promise<unknown>;
}

/** Optional additions within Nexus settings. All mutations follow an explicit user action. */
export function DesktopFeaturesSettings({ settings, status, busy = false, onChange, onOpenGameBar, onEnterXboxMode }: DesktopFeaturesSettingsProps) {
  const { text } = useReferenceLocale();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const disabled = busy || pending;
  async function run(action: () => void | Promise<unknown>) {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError('');
    try { await action(); }
    catch { if (mounted.current) setError(text('The desktop action could not be completed. Please retry.', 'Η ενέργεια επιφάνειας εργασίας δεν ολοκληρώθηκε. Δοκιμάστε ξανά.')); }
    finally { inFlight.current = false; if (mounted.current) setPending(false); }
  }
  const autostartDisabled = disabled || !status?.canSetAutostart;
  return <section className="settings-card desktop-features-settings" aria-label={text('Desktop features', 'Λειτουργίες επιφάνειας εργασίας')} aria-busy={disabled}>
    <h2>{text('Desktop features', 'Λειτουργίες επιφάνειας εργασίας')}</h2>
    <p>{text('Choose how Nexus starts and stays available on this desktop.', 'Επιλέξτε πώς ξεκινά και παραμένει διαθέσιμο το Nexus σε αυτήν την επιφάνεια εργασίας.')}</p>
    <label className="desktop-feature-toggle"><input type="checkbox" checked={settings.launchOnLogin === true} disabled={autostartDisabled} onChange={event => { const checked = event.target.checked; void run(() => onChange({ launchOnLogin: checked })); }} /><span>{text('Launch Nexus when I sign in', 'Εκκίνηση του Nexus κατά τη σύνδεσή μου')}</span></label>
    <label className="desktop-feature-toggle"><input type="checkbox" checked={settings.launchInBackground === true} disabled={autostartDisabled || !settings.launchOnLogin} onChange={event => { const checked = event.target.checked; void run(() => onChange({ launchInBackground: checked })); }} /><span>{text('Start in the background on login', 'Εκκίνηση στο παρασκήνιο κατά τη σύνδεση')}</span></label>
    {!status ? <small>{text('Checking desktop startup support…', 'Έλεγχος υποστήριξης εκκίνησης επιφάνειας εργασίας…')}</small> : !status.canSetAutostart ? <small>{status.autostartReason || text('Login startup is unavailable in this desktop session.', 'Η εκκίνηση κατά τη σύνδεση δεν είναι διαθέσιμη σε αυτήν τη συνεδρία.')}</small> : null}
    <label className="desktop-feature-toggle"><input type="checkbox" checked={settings.minimizeToTray === true} disabled={disabled || status?.trayAvailable === false} onChange={event => { const checked = event.target.checked; void run(() => onChange({ minimizeToTray: checked })); }} /><span>{text('Keep Nexus in the tray when I close the window', 'Διατήρηση του Nexus στην περιοχή ειδοποιήσεων όταν κλείνω το παράθυρο')}</span></label>
    <small>{status?.trayAvailable === false ? text('The tray is unavailable in this session. Closing the window will quit Nexus.', 'Η περιοχή ειδοποιήσεων δεν είναι διαθέσιμη σε αυτήν τη συνεδρία. Το κλείσιμο του παραθύρου τερματίζει το Nexus.') : text('Tray icon visibility depends on your desktop. Use Quit to fully exit Nexus.', 'Η ορατότητα του εικονιδίου ειδοποιήσεων εξαρτάται από την επιφάνεια εργασίας. Χρησιμοποιήστε Έξοδος για πλήρη τερματισμό του Nexus.')}</small>
    <div className="desktop-feature-actions"><button type="button" className="secondary" disabled={disabled} onClick={() => void run(onOpenGameBar)}><Gamepad2 aria-hidden="true" />{text('Open Game Bar', 'Άνοιγμα Game Bar')}</button><button type="button" className="secondary" disabled={disabled || status?.fullscreenExperience === true} onClick={() => void run(onEnterXboxMode)}><Monitor aria-hidden="true" />{text('Enter Xbox mode', 'Είσοδος σε λειτουργία Xbox')}</button></div>
    <p className="desktop-feature-status" role="status">{status?.fullscreenExperience ? text('Gaming desktop session detected.', 'Εντοπίστηκε συνεδρία επιφάνειας εργασίας παιχνιδιών.') : text('Xbox mode requires the optional supported GNOME extension.', 'Η λειτουργία Xbox απαιτεί την προαιρετική υποστηριζόμενη επέκταση GNOME.')}</p>
    {status?.gameBarController ? <p className="desktop-feature-status">{status.gameBarController.status === 'listening' ? text(`Game Bar controller listener: ${status.gameBarController.devices} eligible device(s).`, `Ακρόαση χειριστηρίου Game Bar: ${status.gameBarController.devices} κατάλληλες συσκευές.`) : status.gameBarController.reason || text('The native Game Bar controller listener is not listening.', 'Η εγγενής ακρόαση χειριστηρίου Game Bar δεν λειτουργεί αυτήν τη στιγμή.')}</p> : null}
    <small>{status?.gameBarServiceEnabled ? text('The optional Game Bar user service is configured. This does not verify that it is running.', 'Η προαιρετική υπηρεσία χρήστη Game Bar έχει ρυθμιστεί. Αυτό δεν επιβεβαιώνει ότι εκτελείται.') : text('Game Bar is available while Nexus is running. Keeping it available after Quit requires separate user-service setup.', 'Το Game Bar είναι διαθέσιμο όσο εκτελείται το Nexus. Για διαθεσιμότητα μετά την Έξοδο απαιτείται χωριστή ρύθμιση υπηρεσίας χρήστη.')}</small>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
