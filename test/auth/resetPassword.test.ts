import { beforeEach, describe, expect, it } from 'vitest';
import { parseResetArgs, resetPassword, ResetPasswordError } from '../../auth/resetPassword';
import { verifyPassword } from '../../auth/passwords';
import { LocalDataProvider } from '../../storage/providers';
import { addUser, memoryProvider, sessionCookieFor } from '../helpers';

// What `npm run user:reset-password` does (auth/resetPassword.ts), without the terminal handling.

let provider: LocalDataProvider;

beforeEach(() => {
  provider = memoryProvider();
});

describe('resetPassword', () => {
  it('sets the new password, which then verifies, and the old one no longer does', async () => {
    const user = await addUser(provider, { email: 'owner@example.com', password: 'old-password-123' });
    await resetPassword(provider, 'owner@example.com', 'a-brand-new-password');
    const stored = (await provider.getUser(user.id))!.passwordHash;
    expect(await verifyPassword('a-brand-new-password', stored)).toBe(true);
    expect(await verifyPassword('old-password-123', stored)).toBe(false);
  });

  it('finds the account whatever the capitalization or spacing of the email', async () => {
    await addUser(provider, { email: 'owner@example.com' });
    const user = await resetPassword(provider, '  Owner@Example.COM ', 'a-brand-new-password');
    expect(user.email).toBe('owner@example.com');
  });

  it('signs the account out everywhere and leaves other accounts alone', async () => {
    const owner = await addUser(provider, { email: 'owner@example.com' });
    const other = await addUser(provider, { email: 'other@example.com', role: 'USER' });
    const mine = await sessionCookieFor(provider, owner);
    const theirs = await sessionCookieFor(provider, other);
    await resetPassword(provider, 'owner@example.com', 'a-brand-new-password');
    const sessionIdOf = (cookie: string) => cookie.split('=')[1];
    const { sessionIdForToken } = await import('../../auth/sessions');
    expect(await provider.getSession(sessionIdForToken(sessionIdOf(mine)))).toBeNull();
    expect(await provider.getSession(sessionIdForToken(sessionIdOf(theirs)))).not.toBeNull();
  });

  it('changes nothing else: a pending or disabled account stays that way, and roles are kept', async () => {
    const pending = await addUser(provider, { email: 'p@example.com', role: 'USER', status: 'PENDING' });
    const disabled = await addUser(provider, { email: 'd@example.com', role: 'USER', status: 'DISABLED' });
    const admin = await addUser(provider, { email: 'a@example.com' });
    for (const user of [pending, disabled, admin]) {
      await resetPassword(provider, user.email, 'a-brand-new-password');
    }
    expect(await provider.getUser(pending.id)).toMatchObject({ role: 'USER', status: 'PENDING' });
    expect(await provider.getUser(disabled.id)).toMatchObject({ role: 'USER', status: 'DISABLED' });
    expect(await provider.getUser(admin.id)).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
  });

  it('can set a password on an account that had none', async () => {
    const user = await addUser(provider, { email: 'owner@example.com', password: null });
    await resetPassword(provider, 'owner@example.com', 'a-brand-new-password');
    expect(await verifyPassword('a-brand-new-password', (await provider.getUser(user.id))!.passwordHash)).toBe(true);
  });

  it('names the admin accounts when the email is not found', async () => {
    await addUser(provider, { email: 'boss@example.com' });
    await addUser(provider, { email: 'regular@example.com', role: 'USER' });
    const error = await resetPassword(provider, 'bos@example.com', 'a-brand-new-password').catch((e) => e);
    expect(error).toBeInstanceOf(ResetPasswordError);
    expect(error.message).toContain('bos@example.com');
    expect(error.message).toContain('boss@example.com');
    expect(error.message).not.toContain('regular@example.com');
  });

  it('says when there are no accounts at all', async () => {
    await expect(resetPassword(provider, 'x@example.com', 'a-brand-new-password')).rejects.toThrow(/no accounts yet/);
  });

  it.each([
    ['too short', 'short', /at least 10/],
    ['too long', 'x'.repeat(2000), /at most 1024/],
  ])('refuses a password that is %s, changing nothing', async (_what, password, message) => {
    const user = await addUser(provider, { email: 'owner@example.com', password: 'old-password-123' });
    const before = (await provider.getUser(user.id))!.passwordHash;
    await expect(resetPassword(provider, 'owner@example.com', password)).rejects.toThrow(message);
    expect((await provider.getUser(user.id))!.passwordHash).toBe(before);
  });
});

describe('parseResetArgs', () => {
  it('takes one email', () => {
    expect(parseResetArgs(['owner@example.com'])).toEqual({ email: 'owner@example.com', passwordFromStdin: false });
  });

  it('accepts --password-stdin before or after the email', () => {
    expect(parseResetArgs(['--password-stdin', 'a@b.co'])).toEqual({ email: 'a@b.co', passwordFromStdin: true });
    expect(parseResetArgs(['a@b.co', '--password-stdin'])).toEqual({ email: 'a@b.co', passwordFromStdin: true });
  });

  it.each([
    ['nothing', [], /email/],
    ['two emails', ['a@b.co', 'c@d.co'], /email/],
    ['a blank email', ['  '], /email/],
    ['an unknown option', ['a@b.co', '--password=hunter2'], /Unknown option --password=hunter2/],
  ])('refuses %s', (_what, argv, message) => {
    const result = parseResetArgs(argv);
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toMatch(message);
  });
});
