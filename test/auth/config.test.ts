import { describe, expect, it } from 'vitest';
import { signupEnabled } from '../../auth/config';

describe('signupEnabled', () => {
  it('is on unless switched off', () => {
    expect(signupEnabled({})).toBe(true);
    expect(signupEnabled({ TOE_SIGNUP_ENABLED: '' })).toBe(true);
    expect(signupEnabled({ TOE_SIGNUP_ENABLED: 'true' })).toBe(true);
    expect(signupEnabled({ TOE_SIGNUP_ENABLED: '1' })).toBe(true);
  });

  it.each(['false', 'FALSE', 'False', '0', 'no', 'No', 'off', 'OFF', '  false  '])('is off for %j', (value) => {
    expect(signupEnabled({ TOE_SIGNUP_ENABLED: value })).toBe(false);
  });

  it('stays on for values it does not recognize, so a typo cannot lock people out of asking', () => {
    expect(signupEnabled({ TOE_SIGNUP_ENABLED: 'disabled' })).toBe(true);
  });
});
