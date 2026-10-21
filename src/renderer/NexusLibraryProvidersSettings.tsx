import { useEffect, useRef, useState } from 'react';
import { libraryProviders, type LibraryProviderId, type LibraryProviderStatus } from '../shared/library-providers';
import { ExternalLink, Gamepad2, RefreshCw } from './NexusIcons';
import { useReferenceLocale } from './ReferenceLocale';
import './nexus-extra-settings.css';

export interface NexusLibraryProvidersSettingsProps {
  getProviders?: () => Promise<LibraryProviderStatus[]>;
  onImportGame?: () => void | Promise<unknown>;
  onOpenProviderSite?: (url: string) => void | Promise<unknown>;
}
const providerIds = new Set<string>(libraryProviders.map(provider => provider.id));
/** Missing or ambiguous data is unknown, never a negative or positive scan. */
export function providerRegistration(value: unknown): Map<LibraryProviderId, boolean> {
  const registrations = new Map<LibraryProviderId, boolean>(), seen = new Set<string>();
  if (!Array.isArray(value) || value.length > 100) return registrations;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as { id?: unknown; installed?: unknown };
    if (typeof raw.id !== 'string' || !providerIds.has(raw.id)) continue;
    const id = raw.id as LibraryProviderId;
    if (seen.has(id)) { registrations.delete(id); continue; }
    seen.add(id);
    if (typeof raw.installed === 'boolean') registrations.set(id, raw.installed);
  }
  return registrations;
}
async function readProviders(): Promise<LibraryProviderStatus[]> {
  if (typeof window === 'undefined' || typeof window.launcher?.getLibraryProviders !== 'function') throw Error('Provider detection is unavailable.');
  return window.launcher.getLibraryProviders();
}

/** Desktop-entry inspection only; no provider login, process launch or import. */
export function NexusLibraryProvidersSettings({ getProviders = readProviders, onImportGame, onOpenProviderSite }: NexusLibraryProvidersSettingsProps) {
  const { text } = useReferenceLocale();
  const [providers, setProviders] = useState<Map<LibraryProviderId, boolean>>(), [busy, setBusy] = useState(false), [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState(false), [actionError, setActionError] = useState(false);
  const alive = useRef(false), generation = useRef(0), scanning = useRef(false), actionPending = useRef(false);
  async function refresh(replace = false) {
    if (scanning.current && !replace) return;
    const request = ++generation.current;
    scanning.current = true; setBusy(true); setError(false); setProviders(undefined);
    try { const value = await getProviders(); if (alive.current && generation.current === request) setProviders(providerRegistration(value)); }
    catch { if (alive.current && generation.current === request) setError(true); }
    finally { if (alive.current && generation.current === request) { scanning.current = false; setBusy(false); } }
  }
  useEffect(() => {
    alive.current = true; void refresh(true);
    return () => { alive.current = false; generation.current++; scanning.current = false; };
  }, [getProviders]);
  async function act(action: () => void | Promise<unknown>) {
    if (actionPending.current) return;
    actionPending.current = true; setActionBusy(true); setActionError(false);
    try { await action(); }
    catch { if (alive.current) setActionError(true); }
    finally { actionPending.current = false; if (alive.current) setActionBusy(false); }
  }
  return <section className="settings-card nexus-library-providers" aria-label={text('Other game launchers', 'Άλλοι εκκινητές παιχνιδιών')}>
    <div className="settings-heading"><div className="settings-icon"><Gamepad2 aria-hidden="true" /></div><div><h2>{text('Other game launchers', 'Άλλοι εκκινητές παιχνιδιών')}</h2><p>{text('Check which launchers have a desktop entry on this PC.', 'Ελέγξτε ποιοι εκκινητές έχουν καταχώριση επιφάνειας εργασίας σε αυτόν τον υπολογιστή.')}</p></div></div>
    <p>{text('Detection reads desktop-entry metadata. It does not check sign-in, connect accounts, import game libraries or run Windows extensions.', 'Ο εντοπισμός διαβάζει μεταδεδομένα καταχωρίσεων επιφάνειας εργασίας. Δεν ελέγχει τη σύνδεση, δεν συνδέει λογαριασμούς, δεν εισάγει βιβλιοθήκες παιχνιδιών και δεν εκτελεί επεκτάσεις Windows.')}</p>
    <div className="button-row"><button type="button" className="secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw className={busy ? 'spin' : undefined} aria-hidden="true" />{busy ? text('Checking…', 'Έλεγχος…') : text('Check launchers again', 'Νέος έλεγχος εκκινητών')}</button>{onImportGame ? <button type="button" className="secondary" disabled={actionBusy} onClick={() => void act(onImportGame)}>{text('Add a game manually', 'Χειροκίνητη προσθήκη παιχνιδιού')}</button> : null}</div>
    {error ? <p className="error-text" role="alert">{text('Launcher detection could not be completed. Retry the scan.', 'Ο εντοπισμός εκκινητών δεν ολοκληρώθηκε. Δοκιμάστε ξανά.')}</p> : null}
    <ul className="nexus-provider-list">{libraryProviders.map(provider => {
      const registration = providers?.get(provider.id);
      const label = busy ? text('Checking desktop entry…', 'Έλεγχος καταχώρισης επιφάνειας εργασίας…')
        : registration === true ? text('Desktop entry found', 'Βρέθηκε καταχώριση επιφάνειας εργασίας')
          : registration === false ? text('No desktop entry found', 'Δεν βρέθηκε καταχώριση επιφάνειας εργασίας')
            : text('Detection unavailable', 'Μη διαθέσιμος εντοπισμός');
      return <li key={provider.id} data-library-provider={provider.id} data-provider-registration={registration === undefined ? 'unknown' : registration ? 'found' : 'absent'}><Gamepad2 aria-hidden="true" /><div><h3>{provider.name}</h3><p>{label}</p><small>{text('Automatic library import: unavailable', 'Αυτόματη εισαγωγή βιβλιοθήκης: μη διαθέσιμη')}</small></div>{onOpenProviderSite ? <button type="button" className="secondary" disabled={actionBusy} aria-label={`${provider.name}: ${text('provider website', 'ιστότοπος παρόχου')}`} onClick={() => void act(() => onOpenProviderSite(provider.site))}><ExternalLink aria-hidden="true" />{text('Website', 'Ιστότοπος')}</button> : <a href={provider.site} target="_blank" rel="noreferrer" aria-label={`${provider.name}: ${text('provider website', 'ιστότοπος παρόχου')}`}><ExternalLink aria-hidden="true" />{text('Website', 'Ιστότοπος')}</a>}</li>;
    })}</ul>
    {actionError ? <p className="error-text" role="alert">{text('The requested action could not be completed. Please retry.', 'Η ζητούμενη ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.')}</p> : null}
  </section>;
}
