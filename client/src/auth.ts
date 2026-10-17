import { useSyncExternalStore } from 'react';

/*
Who is signed in. The server keeps the session: signing in sets an httpOnly cookie that the
browser sends with every request on its own, so this app never sees or stores a password or a
token. All it keeps here is what the server last said about the signed-in user, which drives
the sign-in screen and what each screen shows.

This file is only the state. Asking the server (GET /api/auth/me) is in session.ts.
*/

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: 'USER' | 'ADMIN';
};

export type SessionState =
  // The server hasn't been asked yet whether the browser's cookie is still good
  | { status: 'loading' }
  // The server couldn't be reached to find out
  | { status: 'error'; error: unknown }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: SessionUser };

const LOADING: SessionState = { status: 'loading' };
const SIGNED_OUT: SessionState = { status: 'signedOut' };

let current: SessionState = LOADING;
const listeners = new Set<() => void>();

function set(next: SessionState) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function getSession(): SessionState {
  return current;
}

export function setSignedIn(user: SessionUser) {
  set({ status: 'signedIn', user });
}

export function setSignedOut() {
  if (current !== SIGNED_OUT) set(SIGNED_OUT);
}

export function setSessionError(error: unknown) {
  set({ status: 'error', error });
}

// Back to "don't know yet", so the next screen to need the session asks the server again
export function resetSession() {
  if (current !== LOADING) set(LOADING);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionState(): SessionState {
  return useSyncExternalStore(subscribe, getSession);
}
