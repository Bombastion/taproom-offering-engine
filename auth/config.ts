/*
Switches an operator can set in the environment (see the README).

TOE_SIGNUP_ENABLED turns requesting accounts on or off. It's on unless set to false, 0, no or off
(any capitalization). Turning it off stops new requests; accounts that already exist, pending ones
included, are unaffected, and an admin can still approve them.
*/
export function signupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !/^(false|0|no|off)$/i.test((env.TOE_SIGNUP_ENABLED ?? '').trim());
}
