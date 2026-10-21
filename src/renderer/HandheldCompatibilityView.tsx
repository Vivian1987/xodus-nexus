import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { HandheldCompatibility } from '../shared/handheld-compatibility';
import { Check, ChevronRight, CircleHelp, Gamepad2, Info, Monitor, ShieldAlert, X } from './NexusIcons';
import { useBackHandler } from './GuideNavigation';
import { useReferenceLocale } from './ReferenceLocale';
import './handheld-compatibility.css';

export function handheldRatingLabel(rating: HandheldCompatibility['rating'] | undefined, text: (en: string, el: string) => string): string {
  switch (rating) {
    case 'optimized': return text('Handheld optimized', 'Βελτιστοποιημένο για συσκευή χειρός');
    case 'playable': return text('Mostly compatible', 'Κυρίως συμβατό');
    case 'unsupported': return text('Unsupported on Windows handhelds', 'Δεν υποστηρίζεται σε συσκευές χειρός Windows');
    default: return text('Handheld compatibility', 'Συμβατότητα συσκευής χειρός');
  }
}

/** Information only: public Windows classification never blocks a Linux launch. */
export function HandheldCompatibilityEntry({ value, open }: { value?: HandheldCompatibility; open: () => void }) {
  const { text } = useReferenceLocale();
  return <button type="button" className="secondary handheld-compatibility-entry" data-handheld-rating={value?.rating ?? 'unknown'} aria-haspopup="dialog" onClick={open}>
    <Gamepad2 aria-hidden="true" /><span>{handheldRatingLabel(value?.rating, text)}</span><ChevronRight aria-hidden="true" />
  </button>;
}

export function HandheldCompatibilityDialog({ title, value, close }: { title: string; value?: HandheldCompatibility; close: () => void }) {
  const { text } = useReferenceLocale();
  const root = useRef<HTMLElement>(null), closeRef = useRef(close); closeRef.current = close;
  const id = useId(), headingId = `${id}-title`, contextId = `${id}-context`;
  const rating = value?.rating ?? 'unknown';
  useBackHandler(() => { closeRef.current(); return true; }, true, () => root.current);
  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const shell = document.querySelector<HTMLElement>('.app-shell'), inert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    root.current?.querySelector<HTMLButtonElement>('[data-handheld-dismiss]')?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !root.current?.contains(document.activeElement)) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const buttons = [...root.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (shell) shell.inert = inert;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, []);
  const heading = rating === 'optimized' ? text('Optimized for Windows handhelds', 'Βελτιστοποιημένο για συσκευές χειρός Windows')
    : rating === 'playable' ? text('Some handheld adjustments may be needed', 'Ίσως χρειάζονται προσαρμογές στη συσκευή χειρός')
    : rating === 'unsupported' ? text('Windows handheld requirements are not met', 'Δεν πληρούνται οι απαιτήσεις συσκευών χειρός Windows')
    : text('No handheld rating is available', 'Δεν υπάρχει διαθέσιμη αξιολόγηση συσκευής χειρός');
  const criteria = [
    { id: 'defaults-work', label: text('Default setup', 'Αρχικές ρυθμίσεις'), description: text('Controller play with the standard game settings.', 'Παιχνίδι με χειριστήριο στις αρχικές ρυθμίσεις του παιχνιδιού.') },
    { id: 'iconography', label: text('Button prompts', 'Ενδείξεις κουμπιών'), description: text('On-screen controls correspond to controller buttons.', 'Τα χειριστήρια στην οθόνη αντιστοιχούν στα κουμπιά του χειριστηρίου.') },
    { id: 'text-input', label: text('Text input', 'Εισαγωγή κειμένου'), description: text('Text entry works with an on-screen keyboard.', 'Η εισαγωγή κειμένου λειτουργεί με πληκτρολόγιο οθόνης.') },
    { id: 'ui-legibility', label: text('Interface readability', 'Αναγνωσιμότητα περιβάλλοντος'), description: text('Text and menus can be read on the smaller display.', 'Το κείμενο και τα μενού διαβάζονται στη μικρότερη οθόνη.') },
    { id: 'supported-display', label: text('Display support', 'Υποστήριξη οθόνης'), description: text('The game accommodates the handheld display resolution.', 'Το παιχνίδι προσαρμόζεται στην ανάλυση οθόνης της συσκευής χειρός.') },
  ] as const;
  const ResultIcon = rating === 'optimized' ? Check : rating === 'unsupported' ? ShieldAlert : rating === 'playable' ? Info : CircleHelp;
  const content = <div className="handheld-compatibility-backdrop">
    <section ref={root} className="handheld-compatibility-dialog" data-handheld-rating={rating} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={contextId}>
      <button type="button" className="handheld-dialog-close" data-gamepad-cancel aria-label={text('Close', 'Κλείσιμο')} onClick={close}><X aria-hidden="true" /></button>
      <div className="handheld-dialog-heading"><div className="handheld-public-icon" aria-hidden="true"><Monitor /><Gamepad2 /><ResultIcon /></div><div><h2 id={headingId}>{heading}</h2><p className="handheld-game-title">{title}</p></div></div>
      <p>{text('Microsoft’s public catalog reports the following Windows handheld classification. Individual checks appear only when the provider supplies them.', 'Ο δημόσιος κατάλογος της Microsoft αναφέρει την παρακάτω αξιολόγηση συσκευών χειρός Windows. Οι επιμέρους έλεγχοι εμφανίζονται μόνο όταν τους παρέχει ο πάροχος.')}</p>
      <ul className="handheld-criteria">{criteria.map(criterion => {
        const result = value?.criteria?.find(item => item.id === criterion.id)?.rating;
        const known = result === 'optimized' || result === 'playable' || result === 'unsupported';
        const resultLabel = result === 'optimized' ? text('Meets requirement', 'Πληροί την απαίτηση')
          : result === 'playable' ? text('May need adjustment', 'Ίσως χρειάζεται προσαρμογή')
          : result === 'unsupported' ? text('Requirement not met', 'Δεν πληροί την απαίτηση')
          : text('Result not provided', 'Δεν έχει δοθεί αποτέλεσμα');
        return <li key={criterion.id} data-criterion-state={known ? result : 'not-provided'}>{result === 'optimized' ? <Check aria-hidden="true" /> : <Info aria-hidden="true" />}<div><strong>{criterion.label}</strong><p>{criterion.description}</p><small>{resultLabel}</small></div></li>;
      })}</ul>
      <p id={contextId} className="handheld-rating-context">{text('Xbox rating for Windows handhelds. Linux / Proton compatibility has not been verified.', 'Αξιολόγηση Xbox για συσκευές χειρός Windows. Η συμβατότητα Linux / Proton δεν έχει επαληθευτεί.')}</p>
      <div className="handheld-dialog-actions"><button type="button" className="primary" data-handheld-dismiss onClick={close}>{text('Close', 'Κλείσιμο')}</button></div>
    </section>
  </div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
