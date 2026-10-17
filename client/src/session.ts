import { useEffect } from 'react';
import { api, ApiError } from './api';
import { resetSession, setSessionError, setSignedIn, setSignedOut, SessionState, useSessionState } from './auth';

let inFlight: Promise<void> | null = null;

// Asks the server who the browser's cookie belongs to, if anyone. One request at a time, however
// many screens ask.
export function loadSession(): Promise<void> {
  inFlight ??= api
    .me()
    .then(({ user }) => setSignedIn(user))
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) setSignedOut();
      else setSessionError(error);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// The session state, loading it from the server the first time it's needed
export function useSession(): SessionState {
  const state = useSessionState();
  useEffect(() => {
    if (state.status === 'loading') void loadSession();
  }, [state.status]);
  return state;
}

export function retrySession() {
  resetSession();
}
