import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureBootstrapAdmin } from '../../auth/bootstrap';
import { verifyPassword } from '../../auth/passwords';
import { LocalDataProvider } from '../../storage/providers';
import { addUser, memoryProvider } from '../helpers';

let provider: LocalDataProvider;
const log = { log: vi.fn(), warn: vi.fn() };

beforeEach(() => {
  provider = memoryProvider();
  log.log.mockClear();
  log.warn.mockClear();
});

describe('ensureBootstrapAdmin', () => {
  it('creates an active admin on an empty database', async () => {
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_EMAIL: 'Owner@Example.com', TOE_ADMIN_PASSWORD: 's3cret' }, log);
    const admin = await provider.getUserByEmail('owner@example.com');
    expect(admin).toMatchObject({ email: 'owner@example.com', role: 'ADMIN', status: 'ACTIVE' });
    expect(admin!.passwordHash).not.toBe('s3cret');
    expect(await verifyPassword('s3cret', admin!.passwordHash)).toBe(true);
    expect(await provider.countUsers()).toBe(1);
  });

  it('falls back to the old TOE_ADMIN_USERNAME so an existing .env keeps working', async () => {
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_USERNAME: 'taproom', TOE_ADMIN_PASSWORD: 'pw' }, log);
    expect(await provider.getUserByEmail('taproom')).not.toBeNull();
  });

  it('prefers TOE_ADMIN_EMAIL over TOE_ADMIN_USERNAME', async () => {
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_EMAIL: 'a@b.co', TOE_ADMIN_USERNAME: 'old', TOE_ADMIN_PASSWORD: 'pw' }, log);
    expect(await provider.getUserByEmail('a@b.co')).not.toBeNull();
    expect(await provider.getUserByEmail('old')).toBeNull();
  });

  it('signs in as "admin" when neither is set, like the old shared login', async () => {
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_PASSWORD: 'pw' }, log);
    expect(await provider.getUserByEmail('admin')).not.toBeNull();
  });

  it('does nothing once any user exists, even with a different password in the environment', async () => {
    const existing = await addUser(provider, { email: 'someone@example.com', password: 'original' });
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_EMAIL: 'owner@example.com', TOE_ADMIN_PASSWORD: 'changed' }, log);
    expect(await provider.countUsers()).toBe(1);
    expect(await verifyPassword('original', (await provider.getUser(existing.id))!.passwordHash)).toBe(true);
  });

  it('warns and creates nobody when no password is configured', async () => {
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_EMAIL: 'owner@example.com' }, log);
    expect(await provider.countUsers()).toBe(0);
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/TOE_ADMIN_PASSWORD/));
  });

  it('does not log the password', async () => {
    await ensureBootstrapAdmin(provider, { TOE_ADMIN_PASSWORD: 'super-secret-value' }, log);
    expect(JSON.stringify(log.log.mock.calls)).not.toContain('super-secret-value');
  });
});
