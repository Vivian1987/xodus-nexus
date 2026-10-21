import { useEffect, useState } from 'react';
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Cable } from './NexusIcons';
import { formatShellClock, observeWindowFullscreen, type NativeFullscreenBridge } from './guide-fullscreen';
import { useReferenceLocale } from './ReferenceLocale';
import './nexus-mode-status.css';

export interface BatteryReading { percentage: number | null; charging: boolean | null; externalPower: boolean | null }
export interface BatteryBridge {
  getBatteryStatus?(): Promise<BatteryReading>;
  getBatteryPercentage?(): Promise<number | null>;
}
const unknown: BatteryReading = { percentage: null, charging: null, externalPower: null };

export function normalizeBatteryReading(value: unknown): BatteryReading {
  const raw = value && typeof value === 'object' ? value as Partial<BatteryReading> : {};
  return {
    percentage: typeof raw.percentage === 'number' && Number.isFinite(raw.percentage) && raw.percentage >= 0 && raw.percentage <= 100 ? Math.round(raw.percentage) : null,
    charging: typeof raw.charging === 'boolean' ? raw.charging : null,
    externalPower: typeof raw.externalPower === 'boolean' ? raw.externalPower : null,
  };
}
export async function readBatteryStatus(bridge: BatteryBridge | undefined): Promise<BatteryReading> {
  if (bridge?.getBatteryStatus) return normalizeBatteryReading(await bridge.getBatteryStatus());
  if (bridge?.getBatteryPercentage) return normalizeBatteryReading({ ...unknown, percentage: await bridge.getBatteryPercentage() });
  return unknown;
}
export function batteryPowerIcon(status: BatteryReading): 'charging' | 'battery' | 'plug' | null {
  if (status.charging === true) return 'charging';
  if (status.percentage !== null) return 'battery';
  return status.externalPower === true ? 'plug' : null;
}
export function BatteryIndicator({ status, showPercentage = true }: { status: BatteryReading; showPercentage?: boolean }) {
  const { text } = useReferenceLocale();
  const normalized = normalizeBatteryReading(status), kind = batteryPowerIcon(normalized);
  if (!kind) return null;
  const percentage = normalized.percentage === null ? '' : ` ${normalized.percentage}%`;
  const label = kind === 'plug' ? text('Connected to power', 'Συνδεδεμένο στο ρεύμα') : kind === 'charging' ? text(`Battery charging${percentage}`, `Η μπαταρία φορτίζει${percentage}`) : text(`Battery${percentage}`, `Μπαταρία${percentage}`);
  const Icon = kind === 'plug' ? Cable : kind === 'charging' ? BatteryCharging : normalized.percentage === 0 ? Battery
    : (normalized.percentage ?? 0) < 30 ? BatteryLow : (normalized.percentage ?? 0) < 75 ? BatteryMedium : BatteryFull;
  return <span className="nexus-mode-battery" data-power-icon={kind} role="img" aria-label={label} title={label}><Icon aria-hidden="true" />{showPercentage && normalized.percentage !== null ? <span>{normalized.percentage}%</span> : null}</span>;
}

function ObservedModeStatus({ bridge, showBatteryPercentage }: { bridge?: BatteryBridge; showBatteryPercentage: boolean }) {
  const { language, text } = useReferenceLocale();
  const [battery, setBattery] = useState<BatteryReading>(unknown), [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let active = true, pending = false;
    const read = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try { const value = await readBatteryStatus(bridge); if (active) setBattery(value); }
      catch { if (active) setBattery(unknown); }
      finally { pending = false; }
    };
    const refresh = () => { if (document.visibilityState !== 'hidden') { setNow(new Date()); void read(); } };
    refresh(); const timer = window.setInterval(refresh, 30_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [bridge]);
  return <span className="nexus-mode-status" aria-label={text('Fullscreen status', 'Κατάσταση πλήρους οθόνης')}><BatteryIndicator status={battery} showPercentage={showBatteryPercentage} /><time dateTime={now.toISOString()}>{formatShellClock(now, language)}</time></span>;
}

/** Actual DOM/native observations gate both rendering and polling. Attributes,
 * button clicks and a requested mode do not count as entered fullscreen. */
export function NexusModeStatus({ bridge = typeof window === 'undefined' ? undefined : window.launcher, showBatteryPercentage = true }: {
  bridge?: NativeFullscreenBridge & BatteryBridge; showBatteryPercentage?: boolean;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const observer = observeWindowFullscreen(document, bridge, state => setFullscreen(state.nativeFullscreen || state.documentFullscreen));
    return () => observer.stop();
  }, [bridge]);
  return fullscreen ? <ObservedModeStatus bridge={bridge} showBatteryPercentage={showBatteryPercentage} /> : null;
}
