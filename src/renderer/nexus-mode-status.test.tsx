import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatteryIndicator, batteryPowerIcon, normalizeBatteryReading, readBatteryStatus, NexusModeStatus } from './NexusModeStatus';

afterEach(() => vi.unstubAllGlobals());
it('never substitutes a plug or charging state for unknown power information', async () => {
  const status = await readBatteryStatus(undefined); expect(batteryPowerIcon(status)).toBe(null);
  expect(renderToStaticMarkup(<BatteryIndicator status={status} showPercentage />)).toBe('');
});
it('uses the new power reading and does not query the legacy percentage API too', async () => {
  const legacy = vi.fn(async () => 99);
  expect(await readBatteryStatus({ getBatteryStatus: async () => ({ percentage: 61.4, charging: true, externalPower: true }), getBatteryPercentage: legacy })).toEqual({ percentage: 61, charging: true, externalPower: true });
  expect(legacy).not.toHaveBeenCalled();
});
it('supports the legacy percentage while leaving charging and external power unknown', async () => {
  expect(await readBatteryStatus({ getBatteryPercentage: async () => 42 })).toEqual({ percentage: 42, charging: null, externalPower: null });
  expect(normalizeBatteryReading({ percentage: Number.NaN, charging: null, externalPower: false }).percentage).toBe(null);
  expect(normalizeBatteryReading({ percentage: 101, charging: null, externalPower: false }).percentage).toBe(null);
});
it.each([null, undefined, {}, { percentage: -1 }, { percentage: '50', charging: 'yes', externalPower: 1 }])('normalizes malformed readings %j to unknown', raw => {
  expect(normalizeBatteryReading(raw)).toEqual({ percentage: null, charging: null, externalPower: null });
});
it('renders no mode status and performs no power read before actual fullscreen is observed', () => {
  const getBatteryStatus = vi.fn();
  expect(renderToStaticMarkup(<NexusModeStatus bridge={{ getBatteryStatus }} />)).toBe('');
  expect(getBatteryStatus).not.toHaveBeenCalled();
});
it('renders real charging and AC states, independently of the optional percentage preference', () => {
  const charging = renderToStaticMarkup(<BatteryIndicator status={{ percentage: 61, charging: true, externalPower: true }} showPercentage={false} />);
  expect(charging).toContain('data-power-icon="charging"'); expect(charging).toContain('Battery charging 61%'); expect(charging).not.toContain('<span>61%</span>');
  const ac = renderToStaticMarkup(<BatteryIndicator status={{ percentage: null, charging: false, externalPower: true }} showPercentage />);
  expect(ac).toContain('data-power-icon="plug"'); expect(ac).toContain('Connected to power'); expect(ac).not.toContain('charging');
  const battery = renderToStaticMarkup(<BatteryIndicator status={{ percentage: 0, charging: false, externalPower: false }} showPercentage />);
  expect(battery).toContain('data-power-icon="battery"'); expect(battery).toContain('<span>0%</span>');
});
it('localizes real power status in Greek', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'el' });
  expect(renderToStaticMarkup(<BatteryIndicator status={{ percentage: 75, charging: true, externalPower: true }} showPercentage />)).toContain('Η μπαταρία φορτίζει 75%');
});
