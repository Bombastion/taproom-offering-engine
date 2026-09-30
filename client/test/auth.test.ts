import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { basicAuthHeader, getCredentials, signIn, signOut, useCredentials } from '../src/auth';

const KEY = 'taproom-admin-credentials';
const creds = { username: 'admin', password: 'pa:ss' };

describe('basicAuthHeader', () => {
  it('base64-encodes username:password', () => {
    expect(basicAuthHeader(creds)).toBe(`Basic ${btoa('admin:pa:ss')}`);
  });

  it('encodes non-Latin-1 characters as UTF-8, like the server expects', () => {
    const header = basicAuthHeader({ username: 'admin', password: 'wörd🍺' });
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)));
    expect(decoded).toBe('admin:wörd🍺');
  });
});

describe('signing in and out', () => {
  it('keeps the login for the tab session by default', () => {
    signIn(creds, false);
    expect(getCredentials()).toEqual(creds);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(creds);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('keeps the login on the device when asked to', () => {
    signIn(creds, false);
    signIn(creds, true);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(creds);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('forgets the login everywhere on sign out', () => {
    signIn(creds, true);
    signOut();
    expect(getCredentials()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('stays signed in for this page load when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    signIn(creds, true);
    expect(getCredentials()).toEqual(creds);
  });

  it('notifies components when the login changes', () => {
    const { result } = renderHook(() => useCredentials());
    expect(result.current).toBeNull();
    act(() => signIn(creds, false));
    expect(result.current).toEqual(creds);
    act(() => signOut());
    expect(result.current).toBeNull();
  });
});

describe('restoring a stored login on load', () => {
  async function freshAuthModule() {
    vi.resetModules();
    return import('../src/auth');
  }

  it('restores a login kept on the device', async () => {
    localStorage.setItem(KEY, JSON.stringify(creds));
    expect((await freshAuthModule()).getCredentials()).toEqual(creds);
  });

  it('prefers the tab session login', async () => {
    localStorage.setItem(KEY, JSON.stringify({ username: 'old', password: 'old' }));
    sessionStorage.setItem(KEY, JSON.stringify(creds));
    expect((await freshAuthModule()).getCredentials()).toEqual(creds);
  });

  it.each([
    ['broken JSON', '{nope'],
    ['the wrong shape', JSON.stringify({ username: 'admin' })],
    ['non-string values', JSON.stringify({ username: 'admin', password: 123 })],
  ])('ignores %s', async (_label, raw) => {
    localStorage.setItem(KEY, raw);
    expect((await freshAuthModule()).getCredentials()).toBeNull();
  });
});
