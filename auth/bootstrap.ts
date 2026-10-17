import { DataProvider } from '../storage/providers';
import { hashPassword } from './passwords';
import { normalizeEmail } from '../models/users';

/*
Creates the first admin so there's someone to sign in. Runs at startup, and only does anything
while there are no users at all. After that the environment variables are ignored: changing
TOE_ADMIN_PASSWORD later does not change an existing admin's password.

The admin's sign-in name is TOE_ADMIN_EMAIL. TOE_ADMIN_USERNAME (what the shared admin login used
before accounts existed) is still honored as a fallback, so an existing .env keeps working, and
it defaults to "admin". Unlike accounts created through signup, it doesn't have to look like an
email address.
*/
export async function ensureBootstrapAdmin(
  dataProvider: DataProvider,
  env: NodeJS.ProcessEnv = process.env,
  log: Pick<Console, 'log' | 'warn'> = console,
): Promise<void> {
  if ((await dataProvider.countUsers()) > 0) {
    return;
  }
  const password = env.TOE_ADMIN_PASSWORD;
  if (!password) {
    log.warn('There are no users yet and TOE_ADMIN_PASSWORD is not set, so nobody can sign in. Set it and restart to create the first admin.');
    return;
  }
  const email = normalizeEmail(env.TOE_ADMIN_EMAIL || env.TOE_ADMIN_USERNAME || 'admin');
  await dataProvider.createUser({
    email,
    displayName: 'Admin',
    passwordHash: await hashPassword(password),
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  log.log(`Created the first admin account (${email}).`);
}
