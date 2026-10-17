import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { getSession, resetSession, setSessionError, setSignedIn, setSignedOut, useSessionState } from '../src/auth';
import { loadSession, retrySession, useSession } from '../src/session';
import { ADMIN, json, mockApi, status } from './utils';

describe('session state', () => {
  it("starts out not knowing, since the server hasn't been asked", () => {
    expect(getSession()).toEqual({ status: 'loading' });
  });

  it('holds the signed-in user', () => {
    setSignedIn(ADMIN);
    expect(getSession()).toEqual({ status: 'signedIn', user: ADMIN });
    setSignedOut();
    expect(getSession()).toEqual({ status: 'signedOut' });
  });

  it('can say it could not find out, and go back to not knowing', () => {
    const error = new Error('offline');
    setSessionError(error);
    expect(getSession()).toEqual({ status: 'error', error });
    resetSession();
    expect(getSession()).toEqual({ status: 'loading' });
  });

  it('keeps the same object while nothing changes, so components do not re-render for nothing', () => {
    setSignedOut();
    const first = getSession();
    setSignedOut();
    expect(getSession()).toBe(first);
  });

  it('keeps nothing in browser storage', () => {
    setSignedIn(ADMIN);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('notifies components when it changes', () => {
    const { result } = renderHook(() => useSessionState());
    expect(result.current.status).toBe('loading');
    act(() => setSignedIn(ADMIN));
    expect(result.current).toEqual({ status: 'signedIn', user: ADMIN });
    act(() => setSignedOut());
    expect(result.current.status).toBe('signedOut');
  });
});

describe('loading the session from the server', () => {
  it('signs in the user the server names', async () => {
    const server = mockApi({ 'GET /api/auth/me': json({ user: ADMIN }) });
    await loadSession();
    expect(getSession()).toEqual({ status: 'signedIn', user: ADMIN });
    expect(server.requests[0].headers.authorization).toBeUndefined();
  });

  it('is signed out when the server says nobody is signed in', async () => {
    mockApi({ 'GET /api/auth/me': status(401, 'Authentication required.') });
    await loadSession();
    expect(getSession()).toEqual({ status: 'signedOut' });
  });

  it('reports a server that cannot answer, rather than treating it as signed out', async () => {
    mockApi({ 'GET /api/auth/me': status(500) });
    await loadSession();
    expect(getSession().status).toBe('error');
  });

  it('asks once however many screens need it', async () => {
    const server = mockApi({ 'GET /api/auth/me': json({ user: ADMIN }) });
    await Promise.all([loadSession(), loadSession(), loadSession()]);
    expect(server.calls('GET', '/api/auth/me')).toHaveLength(1);
  });

  it('is loaded by the first component that asks for the session', async () => {
    const server = mockApi({ 'GET /api/auth/me': json({ user: ADMIN }) });
    const { result } = renderHook(() => useSession());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(server.calls('GET', '/api/auth/me')).toHaveLength(1);
  });

  it("doesn't ask when the state is already known", () => {
    setSignedOut();
    const server = mockApi({});
    renderHook(() => useSession());
    expect(server.requests).toEqual([]);
  });

  it('asks again after a retry', async () => {
    let calls = 0;
    const server = mockApi({
      'GET /api/auth/me': () => (++calls === 1 ? { status: 500 } : { body: { user: ADMIN } }),
    });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => retrySession());
    await waitFor(() => expect(result.current.status).toBe('signedIn'));
    expect(server.calls('GET', '/api/auth/me')).toHaveLength(2);
  });
});
