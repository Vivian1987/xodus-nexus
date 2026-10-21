import { describe, expect, it } from 'vitest';
import { noXboxSocialCapabilities } from './xbox-social';

describe('unavailable social capabilities', () => {
  it('cannot acquire capabilities through a consumer mutation', () => {
    const unavailableWindow = { ...noXboxSocialCapabilities };
    const verifiedWindow = { ...noXboxSocialCapabilities, friends: true };
    expect(Reflect.set(noXboxSocialCapabilities, 'partyVoice', true)).toBe(false);
    expect(verifiedWindow.friends).toBe(true);
    expect(Object.values(unavailableWindow).every(enabled => enabled === false)).toBe(true);
    expect(Object.values(noXboxSocialCapabilities).every(enabled => enabled === false)).toBe(true);
  });
});
