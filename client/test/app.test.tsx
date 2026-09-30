import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { ApiError } from '../src/api';
import { getCredentials } from '../src/auth';
import { shouldRetry } from '../src/app';
import { json, mockApi, renderApp, status } from './utils';
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

  it('checks the login, keeps it for the session and returns to the screen you asked for', async () => {
    const server = mockApi({ 'GET /api/session': json({ ok: true }), 'GET /api/menus/m1': json({ ...menus[0], hasLogo: false, logo: null, sections: [] }) });
    const { user, location } = renderApp('/menus/m1', { signedIn: false });
    await user.type(await screen.findByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(location().pathname).toBe('/menus/m1'));
    expect(server.calls('GET', '/api/session')[0].headers.authorization).toBe(`Basic ${btoa('admin:hunter2')}`);
    expect(getCredentials()).toEqual({ username: 'admin', password: 'hunter2' });
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
  });

  it('remembers the login on the device when asked', async () => {
    mockApi({ 'GET /api/session': json({ ok: true }), 'GET /api/menus': json([]) });
    const { user, location } = renderApp('/login', { signedIn: false });
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByLabelText('Keep me signed in on this device'));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(location().pathname).toBe('/'));
    expect(localStorage.length).toBe(1);
  });

  it.each([
    [401, "That username and password didn't work."],
    [503, "The server's admin password isn't set up yet (TOE_ADMIN_PASSWORD)."],
    [429, 'Too many failed sign-in attempts.'],
  ])('explains a %i', async (code, message) => {
    mockApi({ 'GET /api/session': status(code, code === 429 ? 'Too many failed sign-in attempts.' : '') });
    const { user, location } = renderApp('/login', { signedIn: false });
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(getCredentials()).toBeNull();
    expect(location().pathname).toBe('/login');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('needs both a username and a password', async () => {
    const server = mockApi({});
    const { user } = renderApp('/login', { signedIn: false });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the admin username and password.');
    expect(server.requests).toEqual([]);
  });

  it('skips the sign-in screen when already signed in', async () => {
    mockApi({ 'GET /api/menus': json([]) });
    const { location } = renderApp('/login');
    await waitFor(() => expect(location().pathname).toBe('/'));
  });

  it('signs out from the More menu', async () => {
    mockApi({ 'GET /api/menus': json(menus) });
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(location().pathname).toBe('/login'));
    expect(getCredentials()).toBeNull();
  });

  it('returns to sign-in when the stored login stops working', async () => {
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
