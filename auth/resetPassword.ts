import { DataProvider } from '../storage/providers';
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './passwords';
import { normalizeEmail, User } from '../models/users';

/*
The logic behind `npm run user:reset-password`, for when somebody is locked out and there's no
"forgot password" email: whoever can run commands on the server sets a new password for an
account. It signs the account out everywhere, since a reset usually means somebody else may have
had access. It changes nothing else about the account (not its role or status), so a pending or
disabled account stays that way.
*/

// A problem the operator can fix, worded for them
export class ResetPasswordError extends Error {}

export async function resetPassword(dataProvider: DataProvider, emailInput: string, password: string): Promise<User> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ResetPasswordError(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ResetPasswordError(`The password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  const user = await dataProvider.getUserByEmail(normalizeEmail(emailInput));
  if (!user) {
    // This only runs for someone with access to the server, so it's fine to help them find the account
    const admins = (await dataProvider.getUsers()).filter((u) => u.role === 'ADMIN').map((u) => u.email);
    throw new ResetPasswordError(
      `There is no account with the email ${normalizeEmail(emailInput)}.` +
        (admins.length > 0 ? ` Admin accounts: ${admins.join(', ')}.` : ' There are no accounts yet.'),
    );
  }
  const updated = await dataProvider.updateUser(user.id, { passwordHash: await hashPassword(password) });
  await dataProvider.deleteSessionsForUser(user.id);
  return updated;
}

export type ResetArgs = { email: string; passwordFromStdin: boolean };

// The command line: an email, and optionally --password-stdin to read the password from standard
// input instead of asking for it. (The password is never taken as an argument: that would leave
// it in shell history and the process list.)
export function parseResetArgs(argv: string[]): ResetArgs | { error: string } {
  let passwordFromStdin = false;
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg === '--password-stdin') passwordFromStdin = true;
    else if (arg.startsWith('--')) return { error: `Unknown option ${arg}.` };
    else positional.push(arg);
  }
  if (positional.length !== 1 || !positional[0].trim()) {
    return { error: 'Give the email of the account to reset.' };
  }
  return { email: positional[0], passwordFromStdin };
}
