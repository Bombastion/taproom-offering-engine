import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { AdminRoutes } from '../../routes/admin';
import { requireAdmin, requireSession, sessionMiddleware } from '../../middleware/auth';
import { LocalDataProvider } from '../../storage/providers';
import { User } from '../../models/users';
import { addUser, memoryProvider, sessionCookieFor } from '../helpers';

// User management for admins (routes/admin.ts) over HTTP, with the session middleware in front
// like the real app has.

let provider: LocalDataProvider;
let app: Express;
let admin: User;
let adminCookie: string;

beforeEach(async () => {
  provider = memoryProvider();
  admin = await addUser(provider, { email: 'admin@example.com' });
  adminCookie = await sessionCookieFor(provider, admin);
  app = express();
  app.use(express.json());
  app.use(sessionMiddleware(provider));
  app.use(requireSession);
  app.use('/api/admin', requireAdmin, new AdminRoutes(provider).router);
});

const asAdmin = {
  get: (url: string) => request(app).get(url).set('Cookie', adminCookie),
  post: (url: string) => request(app).post(url).set('Cookie', adminCookie),
  patch: (url: string, body: object) => request(app).patch(url).set('Cookie', adminCookie).send(body),
};

const pending = (email = 'new@example.com') => addUser(provider, { email, role: 'USER', status: 'PENDING' });

describe('who may use it', () => {
  it('turns away signed-out requests', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('turns away regular users on every route', async () => {
    const regular = await addUser(provider, { email: 'regular@example.com', role: 'USER' });
    const cookie = await sessionCookieFor(provider, regular);
    const target = await pending();
    const attempts: Array<[string, string, object?]> = [
      ['get', '/api/admin/users'],
      ['post', `/api/admin/users/${target.id}/approve`],
      ['post', `/api/admin/users/${target.id}/reject`],
      ['post', `/api/admin/users/${target.id}/disable`],
      ['post', `/api/admin/users/${target.id}/enable`],
      ['patch', `/api/admin/users/${regular.id}/role`, { role: 'ADMIN' }],
    ];
    for (const [method, url, body] of attempts) {
      const res = await (request(app) as any)[method](url).set('Cookie', cookie).send(body);
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect((await provider.getUser(target.id))!.status).toBe('PENDING');
    expect((await provider.getUser(regular.id))!.role).toBe('USER');
  });

  it('checks the role as it is now, so a demoted admin is turned away at once', async () => {
    const second = await addUser(provider, { email: 'second@example.com' });
    const cookie = await sessionCookieFor(provider, second);
    expect((await request(app).get('/api/admin/users').set('Cookie', cookie)).status).toBe(200);
    await provider.updateUser(second.id, { role: 'USER' });
    expect((await request(app).get('/api/admin/users').set('Cookie', cookie)).status).toBe(403);
  });
});

describe('GET /api/admin/users', () => {
  it('lists everyone oldest first, with counts by state and no secrets', async () => {
    await pending('p1@example.com');
    await pending('p2@example.com');
    await addUser(provider, { email: 'off@example.com', role: 'USER', status: 'DISABLED' });
    const res = await asAdmin.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ PENDING: 2, ACTIVE: 1, DISABLED: 1 });
    expect(res.body.users.map((u: User) => u.email)).toEqual(['admin@example.com', 'p1@example.com', 'p2@example.com', 'off@example.com']);
    expect(res.body.users[1]).toEqual({
      id: expect.any(String),
      email: 'p1@example.com',
      displayName: null,
      role: 'USER',
      status: 'PENDING',
      createdAt: expect.any(String),
      approvedAt: null,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
  });
});

describe('approving and rejecting', () => {
  it('approves a pending account, recording when and by whom, and the person can then sign in', async () => {
    const user = await pending();
    const res = await asAdmin.post(`/api/admin/users/${user.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, status: 'ACTIVE', role: 'USER', approvedAt: expect.any(String) });
    expect(await provider.getUser(user.id)).toMatchObject({ status: 'ACTIVE', approvedById: admin.id });
  });

  it('rejects a pending account by disabling it, keeping the email taken', async () => {
    const user = await pending();
    const res = await asAdmin.post(`/api/admin/users/${user.id}/reject`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DISABLED');
    await expect(provider.createUser({ email: 'new@example.com' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(['approve', 'reject'])('will not %s an account that is not pending', async (action) => {
    const active = await addUser(provider, { email: 'active@example.com', role: 'USER' });
    const res = await asAdmin.post(`/api/admin/users/${active.id}/${action}`);
    expect(res.status).toBe(409);
    expect((await provider.getUser(active.id))!.status).toBe('ACTIVE');
  });
});

describe('disabling and enabling', () => {
  it('disables an account and ends its sessions', async () => {
    const user = await addUser(provider, { email: 'u@example.com', role: 'USER' });
    const cookie = await sessionCookieFor(provider, user);
    const res = await asAdmin.post(`/api/admin/users/${user.id}/disable`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DISABLED');
    // Locked out straight away, and stays locked out if turned back on: the sessions are gone
    const other = express();
    other.use(sessionMiddleware(provider));
    other.get('/', (req, res) => { res.send(req.user ? 'in' : 'out'); });
    expect((await request(other).get('/').set('Cookie', cookie)).text).toBe('out');
    await asAdmin.post(`/api/admin/users/${user.id}/enable`);
    expect((await request(other).get('/').set('Cookie', cookie)).text).toBe('out');
  });

  it('turns a disabled account back on, approving it if it never was', async () => {
    const user = await addUser(provider, { email: 'u@example.com', role: 'USER', status: 'DISABLED' });
    const res = await asAdmin.post(`/api/admin/users/${user.id}/enable`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ACTIVE', approvedAt: expect.any(String) });
    expect((await provider.getUser(user.id))!.approvedById).toBe(admin.id);
  });

  it('keeps the original approval when turning an account back on', async () => {
    const user = await pending();
    await asAdmin.post(`/api/admin/users/${user.id}/approve`);
    const approvedAt = (await provider.getUser(user.id))!.approvedAt;
    await asAdmin.post(`/api/admin/users/${user.id}/disable`);
    await asAdmin.post(`/api/admin/users/${user.id}/enable`);
    expect((await provider.getUser(user.id))!.approvedAt).toEqual(approvedAt);
  });

  it('will not disable an account that is not active, or enable one that is not disabled', async () => {
    const waiting = await pending();
    expect((await asAdmin.post(`/api/admin/users/${waiting.id}/disable`)).status).toBe(409);
    expect((await asAdmin.post(`/api/admin/users/${waiting.id}/enable`)).status).toBe(409);
    expect((await asAdmin.post(`/api/admin/users/${admin.id}/enable`)).status).toBe(409);
  });

  it('will not let an admin disable themselves', async () => {
    await addUser(provider, { email: 'second@example.com' });
    const res = await asAdmin.post(`/api/admin/users/${admin.id}/disable`);
    expect(res.status).toBe(409);
    expect(res.text).toMatch(/your own/);
    expect((await provider.getUser(admin.id))!.status).toBe('ACTIVE');
  });

  it('lets one admin disable another', async () => {
    const second = await addUser(provider, { email: 'second@example.com' });
    const res = await asAdmin.post(`/api/admin/users/${second.id}/disable`);
    expect(res.status).toBe(200);
    expect((await provider.getUser(second.id))!.status).toBe('DISABLED');
  });

  it('keeps at least one active admin, even if the other admin was turned off since the request began', async () => {
    // The acting admin is always active, so this can only come up in a race; simulate one by
    // having the list of users show the target as the only admin left
    const second = await addUser(provider, { email: 'second@example.com' });
    vi.spyOn(provider, 'getUsers').mockResolvedValueOnce([second]);
    const res = await asAdmin.post(`/api/admin/users/${second.id}/disable`);
    expect(res.status).toBe(409);
    expect(res.text).toMatch(/last active admin/);
    expect((await provider.getUser(second.id))!.status).toBe('ACTIVE');
  });

  it('keeps at least one active admin when changing roles, too', async () => {
    const second = await addUser(provider, { email: 'second@example.com' });
    vi.spyOn(provider, 'getUsers').mockResolvedValueOnce([second]);
    const res = await asAdmin.patch(`/api/admin/users/${second.id}/role`, { role: 'USER' });
    expect(res.status).toBe(409);
    expect((await provider.getUser(second.id))!.role).toBe('ADMIN');
  });

  it('404s for an account that does not exist', async () => {
    expect((await asAdmin.post('/api/admin/users/nobody/approve')).status).toBe(404);
    expect((await asAdmin.post('/api/admin/users/nobody/disable')).status).toBe(404);
    expect((await asAdmin.patch('/api/admin/users/nobody/role', { role: 'USER' })).status).toBe(404);
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('makes a regular user an admin and back', async () => {
    const user = await addUser(provider, { email: 'u@example.com', role: 'USER' });
    expect((await asAdmin.patch(`/api/admin/users/${user.id}/role`, { role: 'ADMIN' })).body.role).toBe('ADMIN');
    expect((await asAdmin.patch(`/api/admin/users/${user.id}/role`, { role: 'USER' })).body.role).toBe('USER');
  });

  it('rejects anything but USER or ADMIN', async () => {
    const user = await addUser(provider, { email: 'u@example.com', role: 'USER' });
    for (const role of ['admin', 'ROOT', '', 5, null, undefined]) {
      expect((await asAdmin.patch(`/api/admin/users/${user.id}/role`, { role })).status, String(role)).toBe(400);
    }
    expect((await provider.getUser(user.id))!.role).toBe('USER');
  });

  it('will not let an admin change their own role', async () => {
    await addUser(provider, { email: 'second@example.com' });
    const res = await asAdmin.patch(`/api/admin/users/${admin.id}/role`, { role: 'USER' });
    expect(res.status).toBe(409);
    expect((await provider.getUser(admin.id))!.role).toBe('ADMIN');
  });
});
