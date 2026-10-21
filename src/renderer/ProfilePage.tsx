import { useEffect, useRef, useState } from 'react';
import type { AuthStatus } from '../shared/types';
import { subscriptionBadge } from '../shared/subscription';
import { parseXboxSelfProfileDetails } from '../shared/xbox-profile';
import { CircleUserRound, RefreshCw, Settings, Users } from './NexusIcons';
import { useReferenceLocale } from './ReferenceLocale';
import './profile-page.css';

interface ProfilePageProps {
  auth: AuthStatus;
  settings: () => void;
  friends: () => void;
  refresh?: () => Promise<void>;
}

function profileText(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string' || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) return;
  return value.trim() || undefined;
}

function profileAvatar(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length <= 4_000_000
    && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
}

function bridgeRefresh(): (() => Promise<void>) | undefined {
  if (typeof window !== 'undefined' && typeof window.launcher?.refreshXboxProfile === 'function') {
    return async () => { await window.launcher.refreshXboxProfile(); };
  }
}

export function ProfilePage(props: ProfilePageProps) {
  const { text: t } = useReferenceLocale();
  const identity = props.auth.stored === true ? profileText(props.auth.username, 320) : undefined;
  if (!identity || props.auth.running) return <main className="page profile-page">
    <header className="page-header"><div><h1>{t('Your Xbox profile', 'Το προφίλ σας στο Xbox')}</h1></div></header>
    <section className="settings-card profile-empty">
      <CircleUserRound aria-hidden="true" />
      <h2>{props.auth.running ? t('Your account is updating', 'Ο λογαριασμός σας ενημερώνεται')
        : props.auth.stored === true ? t('Profile information is unavailable', 'Τα στοιχεία προφίλ δεν είναι διαθέσιμα')
          : t('Sign in to view your profile', 'Συνδεθείτε για να δείτε το προφίλ σας')}</h2>
      <button className="secondary" data-gamepad-initial onClick={props.settings}><Settings />{t('Account settings', 'Ρυθμίσεις λογαριασμού')}</button>
    </section>
  </main>;
  // A new account gets a fresh component. Late refresh completion cannot update
  // another account's busy/error state, including during logout and login.
  return <CurrentProfile key={identity} {...props} identity={identity} />;
}

function CurrentProfile({ auth, settings, friends, refresh, identity }: ProfilePageProps & { identity: string }) {
  const { text: t, language } = useReferenceLocale();
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [missingAvatar, setMissingAvatar] = useState<string>();
  const pending = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const profile = auth.profile, details = parseXboxSelfProfileDetails(profile);
  const gamertag = profileText(profile?.gamertag, 256) ?? profileText(auth.gamertag, 256) ?? t('Xbox profile', 'Προφίλ Xbox');
  const avatar = profileAvatar(profile?.avatarDataUrl) ?? profileAvatar(auth.avatarDataUrl);
  const membership = subscriptionBadge(profile?.subscription ?? auth.subscription);
  const refreshAction = refresh ?? bridgeRefresh();
  const hasAbout = Boolean(details.bio || details.location || details.realName || details.gameDisplayName || details.appDisplayName);
  async function update() {
    if (pending.current || auth.running || auth.profileRefreshing || !refreshAction) return;
    pending.current = true; setBusy(true); setError(false);
    try { await refreshAction(); }
    catch { if (alive.current) setError(true); }
    finally { if (alive.current) { pending.current = false; setBusy(false); } }
  }
  return <main className="page profile-page" data-profile-account="signed-in">
    <header className="page-header"><div><h1>{t('Your Xbox profile', 'Το προφίλ σας στο Xbox')}</h1><p>{t('Information returned for your account.', 'Στοιχεία που επιστράφηκαν για τον λογαριασμό σας.')}</p></div></header>
    <section className="settings-card profile-summary" aria-labelledby="profile-gamertag">
      <div className="profile-identity">
        <div className="profile-gamerpic">{avatar && missingAvatar !== avatar ? <img src={avatar} alt={t('Xbox profile picture', 'Εικόνα προφίλ Xbox')} onError={() => setMissingAvatar(avatar)} /> : <CircleUserRound aria-hidden="true" />}</div>
        <div><h2 id="profile-gamertag">{gamertag}</h2>
          {details.uniqueModernGamertag && details.uniqueModernGamertag !== gamertag ? <p className="profile-modern-tag">{details.uniqueModernGamertag}</p> : null}
          {membership ? <span className="state-pill profile-membership" aria-label={`${t('Game Pass membership', 'Συνδρομή Game Pass')}: ${membership}`}>{membership}</span> : null}
          {details.gamerscore !== undefined ? <p className="profile-gamerscore"><strong>{details.gamerscore.toLocaleString(language === 'el' ? 'el-GR' : 'en-US')}</strong><span>{t('Gamerscore', 'Βαθμολογία παίκτη')}</span></p> : null}
        </div>
      </div>
      <div className="button-row profile-actions">
        <button className="secondary" data-gamepad-initial onClick={settings}><Settings />{t('Account settings', 'Ρυθμίσεις λογαριασμού')}</button>
        <button className="secondary" onClick={friends}><Users />{t('Friends', 'Φίλοι')}</button>
        <button className="secondary" disabled={busy || auth.profileRefreshing || !refreshAction} onClick={() => void update()}><RefreshCw className={busy || auth.profileRefreshing ? 'spin' : undefined} />{busy || auth.profileRefreshing ? t('Refreshing…', 'Ανανέωση…') : t('Refresh profile', 'Ανανέωση προφίλ')}</button>
      </div>
    </section>
    <div className="profile-content">
      <section className="settings-card profile-about"><h2>{t('About', 'Πληροφορίες')}</h2>
        {hasAbout ? <><dl>
          {details.realName ? <div><dt>{t('Name', 'Όνομα')}</dt><dd>{details.realName}</dd></div> : null}
          {details.location ? <div><dt>{t('Location', 'Τοποθεσία')}</dt><dd>{details.location}</dd></div> : null}
          {details.gameDisplayName || details.appDisplayName ? <div><dt>{t('Display name', 'Εμφανιζόμενο όνομα')}</dt><dd>{details.gameDisplayName ?? details.appDisplayName}</dd></div> : null}
        </dl>{details.bio ? <p className="profile-biography">{details.bio}</p> : null}</>
          : <p className="profile-muted">{t('No biography or location was returned for this profile.', 'Δεν επιστράφηκε βιογραφικό ή τοποθεσία για αυτό το προφίλ.')}</p>}
      </section>
      <section className="settings-card profile-account"><h2>{t('Xbox account', 'Λογαριασμός Xbox')}</h2><p>{gamertag}</p><p className="profile-muted">{identity}</p>
        {details.gamerscore === undefined ? <p className="profile-muted">{t('Gamerscore is unavailable.', 'Η βαθμολογία παίκτη δεν είναι διαθέσιμη.')}</p> : null}
      </section>
    </div>
    {auth.profileSource === 'cache' ? <p className="profile-muted" role="status">{t('Showing saved profile information. Refresh to check for changes.', 'Εμφανίζονται αποθηκευμένα στοιχεία προφίλ. Ανανεώστε για να ελέγξετε για αλλαγές.')}</p> : null}
    {error || auth.profileError ? <p className="profile-error" role="alert">{t('Your Xbox profile could not be refreshed. Try again.', 'Το προφίλ Xbox δεν ανανεώθηκε. Δοκιμάστε ξανά.')}</p> : null}
  </main>;
}
