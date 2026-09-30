import { useSyncExternalStore } from 'react';

/*
The server protects its admin API with HTTP Basic Auth (one shared admin username/password; see
middleware/auth.ts on the server). The app keeps those credentials for the tab session by
default, or on the device if "Keep me signed in" was ticked, and sends them with every API call.
*/

export type Credentials = { username: string; password: string };

const STORAGE_KEY = 'taproom-admin-credentials';

function readStored(): Credentials | null {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.username === 'string' && typeof parsed?.password === 'string') {
          return parsed;
        }
      }
    } catch {
      // Storage can be unavailable (private browsing, blocked site data); fall through.
    }
  }
  return null;
}

let current: Credentials | null = readStored();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getCredentials(): Credentials | null {
  return current;
}

export function signIn(credentials: Credentials, remember: boolean) {
  current = credentials;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // Still signed in for this page load even if storage is unavailable.
  }
  emit();
}

export function signOut() {
  current = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCredentials(): Credentials | null {
  return useSyncExternalStore(subscribe, getCredentials);
}

// Basic Auth wants base64 of the UTF-8 bytes; btoa alone only handles Latin-1.
export function basicAuthHeader(credentials: Credentials): string {
  const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return `Basic ${btoa(binary)}`;
}
