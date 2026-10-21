import { LocalVoiceTest } from './LocalVoiceTest';
import { useReferenceLocale } from './ReferenceLocale';

/** Standalone local controls for an existing Nexus settings card. No capture on mount. */
export function NexusAudioSettings() {
  const { text } = useReferenceLocale();
  return <div className="nexus-audio-settings"><p>{text('Microphone controls below apply only to a local test. Xbox party voice chat is not available.', 'Τα παρακάτω χειριστήρια μικροφώνου αφορούν μόνο τοπική δοκιμή. Η φωνητική συνομιλία ομάδας Xbox δεν είναι διαθέσιμη.')}</p><LocalVoiceTest /></div>;
}
