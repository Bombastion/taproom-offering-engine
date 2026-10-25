import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ApiError } from '../src/api';
import { getSession } from '../src/auth';
import { shouldRetry } from '../src/app';
import { ADMIN, json, mockApi, renderApp, status } from './utils';
import { menus } from './fixtures';

describe('shouldRetry', () => {
  it("doesn't retry requests the server clearly answered", () => {
    expect(shouldRetry(0, new ApiError(401, 'x'))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, 'x'))).toBe(false);
  });

  it('retries server errors and network failures up to twice', () => {
    expect(shouldRetry(0, new ApiError(500, 'x'))).toBe(true);
    expect(shouldRetry(1, new ApiError(0, 'x'))).toBe(true);
    expect(shouldRetry(2, new ApiError(503, 'x'))).toBe(false);
    expect(shouldRetry(0, new TypeError('x'))).toBe(true);
  });
});

describe('sign-in', () => {
  it('sends signed-out visitors to the sign-in screen', async () => {
    const { location } = renderApp('/breweries', { signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(location().pathname).toBe('/login');
  });

  it('asks the server whether the browser is already signed in', async () => {
    const server = mockApi({ 'GET /api/auth/me': json({ user: ADMIN }), 'GET /api/breweries': json([]) });
    const { location } = renderApp('/breweries', { signedIn: 'unknown' });
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(location().pathname).toBe('/breweries');
    expect(server.calls('GET', '/api/auth/me')).toHaveLength(1);
  });

  it('sends the visitor to sign in when the server says nobody is', async () => {
    mockApi({ 'GET /api/auth/me': status(401, 'Authentication required.') });
    const { location } = renderApp('/breweries', { signedIn: 'unknown' });
    await waitFor(() => expect(location().pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('offers a retry, rather than a sign-in screen, when the server cannot be reached', async () => {
    let calls = 0;
    mockApi({
      'GET /api/auth/me': () => (++calls === 1 ? { status: 500 } : { body: { user: ADMIN } }),
      'GET /api/breweries': json([]),
    });
    const { user, location } = renderApp('/breweries', { signedIn: 'unknown' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server');
    expect(location().pathname).toBe('/breweries');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('signs in, keeps no password or token, and returns to the screen you asked for', async () => {
    const server = mockApi({
      'POST /api/auth/login': json({ user: ADMIN }),
      'GET /api/menus/m1': json({ ...menus[0], hasLogo: false, logo: null, sections: [] }),
    });
    const { user, location } = renderApp('/menus/m1', { signedIn: false });
    await user.type(await screen.findByLabelText('Email'), 'Admin@Example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(location().pathname).toBe('/menus/m1'));
    expect(server.calls('POST', '/api/auth/login')[0].body).toEqual({ email: 'Admin@Example.com', password: 'hunter2', remember: false });
    expect(server.requests.every((r) => r.headers.authorization === undefined)).toBe(true);
    expect(getSession()).toEqual({ status: 'signedIn', user: ADMIN });
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('asks the server to remember the sign-in when asked', async () => {
    const server = mockApi({ 'POST /api/auth/login': json({ user: ADMIN }), 'GET /api/menus': json([]) });
    const { user, location } = renderApp('/login', { signedIn: false });
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByLabelText('Keep me signed in on this device'));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(location().pathname).toBe('/'));
    expect(server.calls('POST', '/api/auth/login')[0].body).toMatchObject({ remember: true });
  });

  it("clears whatever an earlier user's session left in the cache", async () => {
    mockApi({ 'POST /api/auth/login': json({ user: ADMIN }), 'GET /api/menus': json([]) });
    const { user, queryClient, location } = renderApp('/login', { signedIn: false });
    queryClient.setQueryData(['left-by-someone-else'], 'private');
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(location().pathname).toBe('/'));
    expect(queryClient.getQueryData(['left-by-someone-else'])).toBeUndefined();
  });

  it.each([
    [401, 'Incorrect email or password.', "That email and password didn't work."],
    [403, JSON.stringify({ code: 'pending', message: 'Your account is waiting for an admin to approve it.' }), 'Your account is waiting for an admin to approve it.'],
    [403, JSON.stringify({ code: 'disabled', message: 'This account has been disabled.' }), 'This account has been disabled.'],
    [429, 'Too many failed sign-in attempts.', 'Too many failed sign-in attempts.'],
  ])('explains a %i', async (code, body, message) => {
    mockApi({
      'POST /api/auth/login': (): { status: number; body?: unknown; text?: string } =>
        body.startsWith('{') ? { status: code, body: JSON.parse(body) } : { status: code, text: body },
    });
    const { user, location } = renderApp('/login', { signedIn: false });
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(getSession().status).toBe('signedOut');
    expect(location().pathname).toBe('/login');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('needs both an email and a password', async () => {
    const server = mockApi({});
    const { user } = renderApp('/login', { signedIn: false });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.');
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.');
    // Nothing was sent to sign in (the screen only asked how it should look)
    expect(server.calls('POST', '/api/auth/login')).toEqual([]);
  });

  it('skips the sign-in screen when already signed in', async () => {
    mockApi({ 'GET /api/menus': json([]) });
    const { location } = renderApp('/login');
    await waitFor(() => expect(location().pathname).toBe('/'));
  });

  it('signs out from the More menu, ending the session on the server', async () => {
    const server = mockApi({ 'GET /api/menus': json(menus), 'POST /api/auth/logout': status(204) });
    const { user, location, queryClient } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(location().pathname).toBe('/login'));
    expect(server.calls('POST', '/api/auth/logout')).toHaveLength(1);
    expect(getSession().status).toBe('signedOut');
    expect(queryClient.getQueryData(['menus'])).toBeUndefined();
  });

  it("stays signed in, and says so, when signing out didn't reach the server", async () => {
    mockApi({ 'GET /api/menus': json(menus), 'POST /api/auth/logout': status(500) });
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/Something went wrong on the server/)).toBeInTheDocument();
    expect(location().pathname).toBe('/');
    expect(getSession().status).toBe('signedIn');
  });

  it('returns to sign-in when the session stops working', async () => {
    mockApi({ 'GET /api/menus': status(401) });
    const { location } = renderApp('/');
    await waitFor(() => expect(location().pathname).toBe('/login'));
  });
});

describe('navigation', () => {
  it('shows a not-found screen for unknown URLs', async () => {
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to menus' })).toHaveAttribute('href', '/');
  });

  it('highlights the current tab', async () => {
    mockApi({ 'GET /api/breweries': json([]) });
    renderApp('/breweries');
    const tabs = await screen.findByRole('navigation', { name: 'Main' });
    expect(tabs.querySelector('.active')).toHaveTextContent('Breweries');
  });
});
