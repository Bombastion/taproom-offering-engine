import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { AuthRoutes } from '../../routes/auth';
import { requireSession, sessionMiddleware } from '../../middleware/auth';
import { LocalDataProvider } from '../../storage/providers';
import { SESSION_COOKIE, sessionIdForToken } from '../../auth/sessions';
import { addUser, memoryProvider, sessionCookieFor } from '../helpers';

// Signing in and out (routes/auth.ts) over HTTP against the in-memory provider, with the session
// middleware in front like the real app has. The login rate limit is covered in
// test/middleware/rateLimits.test.ts and test/app.test.ts.

let provider: LocalDataProvider;
let app: Express;

function buildApp(trustProxy = false): Express {
  const built = express();
  if (trustProxy) built.set('trust proxy', 1);
  built.use(express.json());
  built.use(sessionMiddleware(provider));
  built.use(requireSession);
  built.use('/api/auth', new AuthRoutes(provider).router);
  return built;
}

const PASSWORD = 'pw-for-tests';

beforeEach(async () => {
  provider = memoryProvider();
  await addUser(provider, { email: 'admin@example.com', displayName: 'Admin', password: PASSWORD });
  app = buildApp();
});

function setCookie(res: request.Response): string {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error('no session cookie was set');
  return cookie;
}

function tokenFrom(cookie: string): string {
  return cookie.slice(SESSION_COOKIE.length + 1).split(';')[0];
}

describe('POST /api/auth/login', () => {
  it('signs in and returns the user, without secrets', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: expect.any(String), email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);
  });

  it('sets an httpOnly, SameSite=Lax cookie that lasts until the browser closes', async () => {
    const cookie = setCookie(await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }));
    expect(cookie).toMatch(/; HttpOnly/);
    expect(cookie).toMatch(/; SameSite=Lax/);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).not.toMatch(/Max-Age|Expires/i);
    // Plain http, as in local development: a Secure cookie would never come back
    expect(cookie).not.toMatch(/; Secure/);
  });

  it('marks the cookie Secure when the request came in over https through the proxy', async () => {
    const proxied = buildApp(true);
    const res = await request(proxied).post('/api/auth/login').set('X-Forwarded-Proto', 'https').send({ email: 'admin@example.com', password: PASSWORD });
    expect(setCookie(res)).toMatch(/; Secure/);
  });

  it('keeps the cookie for 30 days when asked to remember', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD, remember: true });
    expect(setCookie(res)).toMatch(/Max-Age=2592000/);
  });

  it('stores only a hash of the cookie secret, with a matching expiry', async () => {
    const before = Date.now();
    const cookie = setCookie(await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }));
    const token = tokenFrom(cookie);
    expect(await provider.getSession(token)).toBeNull();
    const session = await provider.getSession(sessionIdForToken(token));
    expect(session).not.toBeNull();
    const lifetime = session!.expiresAt.getTime() - before;
    expect(lifetime).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(lifetime).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it('keeps a remembered session for 30 days on the server too', async () => {
    const before = Date.now();
    const cookie = setCookie(await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD, remember: true }));
    const session = await provider.getSession(sessionIdForToken(tokenFrom(cookie)));
    const days = (session!.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('ignores case and surrounding spaces in the email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: '  Admin@Example.COM ', password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it('gives a working session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }).expect(200);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('admin@example.com');
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.text).toBe('Incorrect email or password.');
    expect(unknownEmail.text).toBe(wrongPassword.text);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it("can't sign in to an account that has no password", async () => {
    await addUser(provider, { email: 'locked@example.com', password: null });
    const res = await request(app).post('/api/auth/login').send({ email: 'locked@example.com', password: '' });
    expect(res.status).toBe(400);
    const second = await request(app).post('/api/auth/login').send({ email: 'locked@example.com', password: 'anything' });
    expect(second.status).toBe(401);
  });

  it('tells a pending user their account is waiting, once the password is right', async () => {
    await addUser(provider, { email: 'new@example.com', status: 'PENDING', role: 'USER', password: 'newpass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'new@example.com', password: 'newpass' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'pending', message: expect.stringMatching(/waiting/) });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('tells a disabled user their account is disabled, once the password is right', async () => {
    await addUser(provider, { email: 'gone@example.com', status: 'DISABLED', role: 'USER', password: 'gonepass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'gone@example.com', password: 'gonepass' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('disabled');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it("doesn't reveal pending or disabled status for a wrong password", async () => {
    await addUser(provider, { email: 'new@example.com', status: 'PENDING', role: 'USER', password: 'newpass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'new@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.text).toBe('Incorrect email or password.');
  });

  it.each([
    ['no body', undefined],
    ['no password', { email: 'admin@example.com' }],
    ['no email', { password: PASSWORD }],
    ['blank email', { email: '   ', password: PASSWORD }],
    ['non-string password', { email: 'admin@example.com', password: 12345 }],
    ['non-string email', { email: ['admin@example.com'], password: PASSWORD }],
    ['huge password', { email: 'admin@example.com', password: 'a'.repeat(5000) }],
    ['huge email', { email: 'a'.repeat(400) + '@example.com', password: PASSWORD }],
  ])('rejects %s with a 400', async (_label, body) => {
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Enter your email and password.');
  });

  it('only remembers when remember is exactly true', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD, remember: 'true' });
    expect(setCookie(res)).not.toMatch(/Max-Age/);
  });

  it('replaces the session the browser already had', async () => {
    const agent = request.agent(app);
    const first = setCookie(await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }));
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }).expect(200);
    expect(await provider.getSession(sessionIdForToken(tokenFrom(first)))).toBeNull();
  });

  it('clears out expired sessions while it is there', async () => {
    const stale = await sessionCookieFor(provider, (await provider.getUserByEmail('admin@example.com'))!, { expiresInMs: -1000 });
    const staleId = sessionIdForToken(stale.slice(SESSION_COOKIE.length + 1));
    expect(await provider.getSession(staleId)).not.toBeNull();
    await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }).expect(200);
    await vi.waitFor(async () => expect(await provider.getSession(staleId)).toBeNull());
  });
});

describe('GET /api/auth/me', () => {
  it('needs a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('answers with the signed-in user', async () => {
    const cookie = await sessionCookieFor(provider, (await provider.getUserByEmail('admin@example.com'))!);
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.body).toEqual({ user: { id: expect.any(String), email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' } });
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session on the server and clears the cookie', async () => {
    const agent = request.agent(app);
    const cookie = setCookie(await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD }));
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(setCookie(out)).toMatch(/^toe_session=;/);
    expect(setCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(await provider.getSession(sessionIdForToken(tokenFrom(cookie)))).toBeNull();
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('kills the session even if someone kept a copy of the cookie', async () => {
    const cookie = await sessionCookieFor(provider, (await provider.getUserByEmail('admin@example.com'))!);
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it("works when there's no session to end", async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });

  it('leaves other sessions alone', async () => {
    const user = (await provider.getUserByEmail('admin@example.com'))!;
    const phone = await sessionCookieFor(provider, user);
    const laptop = await sessionCookieFor(provider, user);
    await request(app).post('/api/auth/logout').set('Cookie', laptop).expect(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', phone)).status).toBe(200);
  });
});
