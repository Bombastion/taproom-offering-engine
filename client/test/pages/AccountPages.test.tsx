import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { AdminUser } from '../../src/api';
import { getSession } from '../../src/auth';
import { ADMIN, json, MEMBER, mockApi, renderApp, status } from '../utils';

// Requesting an account, the Account screen, and the admin Users screen.

type Handlers = Parameters<typeof mockApi>[0];
type User = ReturnType<typeof renderApp>['user'];

function account(overrides: Partial<AdminUser> & { id: string; email: string }): AdminUser {
  return {
    displayName: null,
    role: 'USER',
    status: 'ACTIVE',
    createdAt: '2026-10-01T12:00:00Z',
    approvedAt: '2026-10-02T12:00:00Z',
    ...overrides,
  };
}

const me = account({ ...ADMIN, role: 'ADMIN' });
const newcomer = account({ id: 'u3', email: 'newcomer@example.com', displayName: 'Newcomer', status: 'PENDING', approvedAt: null });
const regular = account({ id: 'u4', email: 'regular@example.com', displayName: 'Regular' });
const fired = account({ id: 'u5', email: 'gone@example.com', status: 'DISABLED' });

function userList(users: AdminUser[]) {
  const counts = { PENDING: 0, ACTIVE: 0, DISABLED: 0 };
  for (const u of users) counts[u.status]++;
  return json({ users, counts });
}

describe('requesting an account', () => {
  const fill = async (user: User, { password = 'a-long-password', confirm = password }: { password?: string; confirm?: string } = {}) => {
    await user.type(screen.getByLabelText(/Your name/), 'Newt');
    await user.type(screen.getByLabelText('Email'), 'newt@example.com');
    await user.type(screen.getByLabelText('Password'), password);
    await user.type(screen.getByLabelText('Confirm password'), confirm);
  };

  it('is reachable from the sign-in screen', async () => {
    mockApi({});
    const { user, location } = renderApp('/login', { signedIn: false });
    await user.click(screen.getByRole('link', { name: 'Request one' }));
    expect(location().pathname).toBe('/signup');
    expect(screen.getByRole('heading', { name: 'Request an account' })).toBeInTheDocument();
  });

  it('sends the request and says an admin has to approve it, without signing in', async () => {
    const server = mockApi({ 'POST /api/auth/signup': json({ status: 'pending' }, 202) });
    const { user } = renderApp('/signup', { signedIn: false });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Request account' }));
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
    expect(screen.getByText(/needs to approve your account/)).toBeInTheDocument();
    expect(server.calls('POST', '/api/auth/signup')[0].body).toEqual({ email: 'newt@example.com', password: 'a-long-password', displayName: 'Newt' });
    expect(getSession().status).toBe('signedOut');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('sends no name when none is given', async () => {
    const server = mockApi({ 'POST /api/auth/signup': json({ status: 'pending' }, 202) });
    const { user } = renderApp('/signup', { signedIn: false });
    await user.type(screen.getByLabelText('Email'), 'newt@example.com');
    await user.type(screen.getByLabelText('Password'), 'a-long-password');
    await user.type(screen.getByLabelText('Confirm password'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Request account' }));
    await screen.findByRole('heading', { name: 'Request sent' });
    expect(server.calls('POST', '/api/auth/signup')[0].body).toMatchObject({ displayName: null });
  });

  it.each([
    ['a missing email', undefined, 'a-long-password', 'a-long-password', 'Enter a valid email address.'],
    ['a short password', 'newt@example.com', 'short', 'short', 'at least 10 characters'],
    ['passwords that differ', 'newt@example.com', 'a-long-password', 'another-long-one', "don't match"],
  ])('catches %s before asking the server', async (_what, email, password, confirm, message) => {
    const server = mockApi({});
    const { user } = renderApp('/signup', { signedIn: false });
    if (email) await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Password'), password);
    await user.type(screen.getByLabelText('Confirm password'), confirm);
    await user.click(screen.getByRole('button', { name: 'Request account' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(server.requests).toEqual([]);
  });

  it("shows the server's reason when it refuses, and lets the person try again", async () => {
    mockApi({ 'POST /api/auth/signup': { status: 429, text: 'Too many account requests from this address. Please try again later.' } });
    const { user } = renderApp('/signup', { signedIn: false });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Request account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many account requests');
    expect(screen.getByRole('button', { name: 'Request account' })).toBeEnabled();
  });

  it('skips the screen when already signed in', async () => {
    mockApi({ 'GET /api/menus': json([]) });
    const { location } = renderApp('/signup');
    await waitFor(() => expect(location().pathname).toBe('/'));
  });
});

describe('the Account screen', () => {
  it('shows who is signed in', async () => {
    mockApi({});
    renderApp('/account', { as: MEMBER });
    expect(await screen.findByRole('heading', { name: 'member@example.com' })).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
  });

  it('changes the password and clears the form', async () => {
    const server = mockApi({ 'POST /api/auth/password': status(204) });
    const { user } = renderApp('/account', { as: MEMBER });
    await user.type(await screen.findByLabelText('Current password'), 'old-password');
    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(server.calls('POST', '/api/auth/password')[0].body).toEqual({ currentPassword: 'old-password', newPassword: 'a-brand-new-password' });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(getSession().status).toBe('signedIn');
  });

  it('says so when the current password is wrong, and stays signed in', async () => {
    mockApi({ 'POST /api/auth/password': { status: 403, text: 'Your current password is incorrect.' } });
    const { user } = renderApp('/account', { as: MEMBER });
    await user.type(await screen.findByLabelText('Current password'), 'wrong');
    await user.type(screen.getByLabelText('New password'), 'a-brand-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'a-brand-new-password');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect.');
    expect(getSession().status).toBe('signedIn');
  });

  it.each([
    ['no current password', '', 'a-brand-new-password', 'a-brand-new-password', 'Enter your current password.'],
    ['a short new password', 'old', 'short', 'short', 'at least 10 characters'],
    ['new passwords that differ', 'old', 'a-brand-new-password', 'something-different', "don't match"],
  ])('catches %s before asking the server', async (_what, current, next, confirm, message) => {
    const server = mockApi({});
    const { user } = renderApp('/account', { as: MEMBER });
    if (current) await user.type(await screen.findByLabelText('Current password'), current);
    await user.type(await screen.findByLabelText('New password'), next);
    await user.type(screen.getByLabelText('Confirm new password'), confirm);
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(server.calls('POST', '/api/auth/password')).toEqual([]);
  });

  it('signs out', async () => {
    const server = mockApi({ 'POST /api/auth/logout': status(204) });
    const { user, location } = renderApp('/account', { as: MEMBER });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(location().pathname).toBe('/login'));
    expect(server.calls('POST', '/api/auth/logout')).toHaveLength(1);
  });

  it('is in the More menu for everyone', async () => {
    mockApi({ 'GET /api/menus': json([]) });
    const { user, location } = renderApp('/', { as: MEMBER });
    await user.click(await screen.findByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('link', { name: 'Account' }));
    expect(location().pathname).toBe('/account');
  });
});

describe('who sees the Users screen', () => {
  it('is hidden from regular users: not in the menu, not asked of the server, and not found by address', async () => {
    const server = mockApi({ 'GET /api/menus': json([]) });
    const { user, router } = renderApp('/', { as: MEMBER });
    await user.click(await screen.findByRole('button', { name: 'More options' }));
    expect(screen.queryByRole('link', { name: /Users/ })).not.toBeInTheDocument();
    expect(server.calls('GET', '/api/admin/users')).toEqual([]);

    await router.navigate('/users');
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(server.calls('GET', '/api/admin/users')).toEqual([]);
  });

  it('is in the menu for admins, with how many are waiting', async () => {
    mockApi({ 'GET /api/menus': json([]), 'GET /api/admin/users': userList([me, newcomer]) });
    const { user, location } = renderApp('/');
    const more = await screen.findByRole('button', { name: 'More options (1 waiting for approval)' });
    await user.click(more);
    const link = screen.getByRole('link', { name: /Users/ });
    expect(link).toHaveTextContent('1 waiting');
    await user.click(link);
    expect(location().pathname).toBe('/users');
  });

  it('shows no badge when nobody is waiting', async () => {
    mockApi({ 'GET /api/menus': json([]), 'GET /api/admin/users': userList([me, regular]) });
    renderApp('/');
    expect(await screen.findByRole('button', { name: 'More options' })).toBeInTheDocument();
  });
});

describe('the Users screen', () => {
  const open = (users: AdminUser[], extra: Handlers = {}) => {
    const server = mockApi({ 'GET /api/admin/users': userList(users), ...extra });
    return { server, ...renderApp('/users') };
  };

  it('opens on the pending requests, with counts on each tab', async () => {
    open([me, newcomer, regular, fired]);
    expect(await screen.findByText('Newcomer')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pending (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Active (2)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Disabled (1)' })).toBeInTheDocument();
    expect(screen.getByText('newcomer@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Regular')).not.toBeInTheDocument();
  });

  it("opens on the active accounts when nobody is waiting, marking the admin's own", async () => {
    open([me, regular]);
    expect(await screen.findByText('Regular')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Active (2)' })).toHaveAttribute('aria-selected', 'true');
    const own = screen.getByText('Admin', { selector: '.card-title' }).closest('.card') as HTMLElement;
    expect(within(own).getByText('You')).toBeInTheDocument();
    // Nothing to do to yourself
    expect(within(own).queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so when a tab is empty', async () => {
    const { user } = open([me]);
    await screen.findByRole('tab', { name: 'Pending (0)' });
    await user.click(screen.getByRole('tab', { name: 'Disabled (0)' }));
    expect(screen.getByText('No disabled accounts.')).toBeInTheDocument();
  });

  it('approves a request right away', async () => {
    let approved = false;
    const server = mockApi({
      'GET /api/admin/users': () => userList(approved ? [me, { ...newcomer, status: 'ACTIVE' }] : [me, newcomer]),
      'POST /api/admin/users/u3/approve': () => {
        approved = true;
        return json({ ...newcomer, status: 'ACTIVE' });
      },
    });
    const { user } = renderApp('/users');
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approved Newcomer')).toBeInTheDocument();
    expect(server.calls('POST', '/api/admin/users/u3/approve')).toHaveLength(1);
    // The request moved out of the pending tab
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Pending (0)' })).toBeInTheDocument());
  });

  it('asks before rejecting, then rejects', async () => {
    const { server, user } = open([me, newcomer], {
      'POST /api/admin/users/u3/reject': json({ ...newcomer, status: 'DISABLED' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject this request?' });
    expect(server.calls('POST', '/api/admin/users/u3/reject')).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(server.calls('POST', '/api/admin/users/u3/reject')).toHaveLength(1));
    expect(await screen.findByText('Rejected Newcomer')).toBeInTheDocument();
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const { server, user } = open([me, regular]);
    await user.click(await screen.findByRole('button', { name: 'Disable' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Disable this account?' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(server.calls('POST', '/api/admin/users/u4/disable')).toEqual([]);
  });

  it('disables an active account after confirming', async () => {
    const { server, user } = open([me, regular], {
      'POST /api/admin/users/u4/disable': json({ ...regular, status: 'DISABLED' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Disable' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Disable this account?' })).getByRole('button', { name: 'Disable' }));
    await waitFor(() => expect(server.calls('POST', '/api/admin/users/u4/disable')).toHaveLength(1));
    expect(await screen.findByText('Disabled Regular')).toBeInTheDocument();
  });

  it('enables a disabled account', async () => {
    const { server, user } = open([me, fired], {
      'POST /api/admin/users/u5/enable': json({ ...fired, status: 'ACTIVE' }),
    });
    await user.click(await screen.findByRole('tab', { name: 'Disabled (1)' }));
    await user.click(screen.getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(server.calls('POST', '/api/admin/users/u5/enable')).toHaveLength(1));
    expect(await screen.findByText('Enabled gone@example.com')).toBeInTheDocument();
  });

  it('makes someone an admin after explaining what that allows', async () => {
    const { server, user } = open([me, regular], {
      'PATCH /api/admin/users/u4/role': json({ ...regular, role: 'ADMIN' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Make admin' }));
    const dialog = screen.getByRole('dialog', { name: 'Make this person an admin?' });
    expect(dialog).toHaveTextContent("still can't see anyone else's menus");
    await user.click(within(dialog).getByRole('button', { name: 'Make admin' }));
    await waitFor(() => expect(server.calls('PATCH', '/api/admin/users/u4/role')[0]?.body).toEqual({ role: 'ADMIN' }));
  });

  it('offers to make an admin a regular user', async () => {
    const otherAdmin = account({ id: 'u6', email: 'boss@example.com', role: 'ADMIN' });
    const { server, user } = open([me, otherAdmin], {
      'PATCH /api/admin/users/u6/role': json({ ...otherAdmin, role: 'USER' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Make regular user' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make regular user' }));
    await waitFor(() => expect(server.calls('PATCH', '/api/admin/users/u6/role')[0]?.body).toEqual({ role: 'USER' }));
  });

  it("shows the server's reason when it refuses, and refreshes in case the list was stale", async () => {
    const { server, user } = open([me, newcomer], {
      'POST /api/admin/users/u3/approve': { status: 409, text: 'That account is not waiting for approval.' },
    });
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('That account is not waiting for approval.')).toBeInTheDocument();
    await waitFor(() => expect(server.calls('GET', '/api/admin/users').length).toBeGreaterThan(1));
  });

  it('shows a load error and retries', async () => {
    let attempts = 0;
    mockApi({ 'GET /api/admin/users': () => (++attempts === 1 ? status(500) : userList([me, regular])) });
    const { user } = renderApp('/users');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Regular')).toBeInTheDocument();
  });
});
