import { beforeEach, describe, expect, it } from 'vitest';
import express, { Request } from 'express';
import request from 'supertest';
import { isApiPath, requireSession, requiresAuth, sameOriginWrites, sessionMiddleware } from '../../middleware/auth';
import { LocalDataProvider } from '../../storage/providers';
import { addUser, memoryProvider, sessionCookieFor } from '../helpers';
import { SESSION_COOKIE, sessionIdForToken } from '../../auth/sessions';

function fakeRequest(method: string, path: string): Request {
  return { method, path } as Request;
}

describe('isApiPath', () => {
  it.each([
    ['/api', true],
    ['/api/', true],
    ['/api/menus', true],
    ['/api/menus/123/sections', true],
    ['/apis', false],
    ['/apiary', false],
    ['/menus/api', false],
    ['/', false],
  ])('%s -> %s', (path, expected) => {
    expect(isApiPath(fakeRequest('GET', path))).toBe(expected);
  });
});

describe('requiresAuth', () => {
  it('requires auth for every /api request, reads included', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(requiresAuth(fakeRequest(method, '/api/menus'))).toBe(true);
    }
  });

  it('leaves signing in and out open, but not the rest of /api/auth', () => {
    expect(requiresAuth(fakeRequest('POST', '/api/auth/login'))).toBe(false);
    expect(requiresAuth(fakeRequest('POST', '/api/auth/signup'))).toBe(false);
    expect(requiresAuth(fakeRequest('GET', '/api/auth/config'))).toBe(false);
    expect(requiresAuth(fakeRequest('POST', '/api/auth/password'))).toBe(true);
    expect(requiresAuth(fakeRequest('GET', '/api/admin/users'))).toBe(true);
    expect(requiresAuth(fakeRequest('POST', '/api/auth/logout'))).toBe(false);
    expect(requiresAuth(fakeRequest('GET', '/api/auth/me'))).toBe(true);
    expect(requiresAuth(fakeRequest('POST', '/api/auth/login/extra'))).toBe(true);
  });

  it('leaves public reads open', () => {
    expect(requiresAuth(fakeRequest('GET', '/'))).toBe(false);
    expect(requiresAuth(fakeRequest('GET', '/menus/abc'))).toBe(false);
    expect(requiresAuth(fakeRequest('HEAD', '/menus/abc'))).toBe(false);
    expect(requiresAuth(fakeRequest('OPTIONS', '/menus/abc'))).toBe(false);
  });

  it('protects every write outside /api too', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(requiresAuth(fakeRequest(method, '/menus/abc'))).toBe(true);
    }
  });
});

describe('sessionMiddleware and requireSession', () => {
  let provider: LocalDataProvider;
  let app: express.Express;

  beforeEach(() => {
    provider = memoryProvider();
    app = express();
    app.use(sessionMiddleware(provider));
    app.use(requireSession);
    app.all('/{*rest}', (req, res) => {
      res.json({ reached: true, user: req.user ?? null });
    });
  });

  it('lets public reads through without a session', async () => {
    const res = await request(app).get('/menus/abc');
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it('lets signing in and out through without a session', async () => {
    expect((await request(app).post('/api/auth/login')).status).toBe(200);
    expect((await request(app).post('/api/auth/logout')).status).toBe(200);
  });

  it('rejects /api requests with no session, with no browser login challenge', async () => {
    const res = await request(app).get('/api/menus');
    expect(res.status).toBe(401);
    expect(res.text).toBe('Authentication required.');
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('rejects writes outside /api with no session', async () => {
    for (const send of [() => request(app).post('/menus'), () => request(app).delete('/menus/abc')]) {
      expect((await send()).status).toBe(401);
    }
  });

  it('accepts a live session and puts the user on the request, without secrets', async () => {
    const user = await addUser(provider, { email: 'Brewer@Example.com' });
    const cookie = await sessionCookieFor(provider, user);
    const res = await request(app).get('/api/menus').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: user.id, email: 'brewer@example.com', displayName: null, role: 'ADMIN' });
  });

  it('finds the session cookie among other cookies', async () => {
    const cookie = await sessionCookieFor(provider, await addUser(provider));
    const res = await request(app).get('/api/menus').set('Cookie', `theme=dark; ${cookie}; other=1`);
    expect(res.status).toBe(200);
  });

  it('rejects a token that was never issued', async () => {
    const res = await request(app).get('/api/menus').set('Cookie', `${SESSION_COOKIE}=not-a-real-token`);
    expect(res.status).toBe(401);
  });

  it('rejects the stored session id used as if it were the token', async () => {
    // The database holds only the hash, so the hash itself must not sign anyone in
    const cookie = await sessionCookieFor(provider, await addUser(provider));
    const token = cookie.slice(SESSION_COOKIE.length + 1);
    const res = await request(app).get('/api/menus').set('Cookie', `${SESSION_COOKIE}=${sessionIdForToken(token)}`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired session and deletes it', async () => {
    const user = await addUser(provider);
    const cookie = await sessionCookieFor(provider, user, { expiresInMs: -1000 });
    const token = cookie.slice(SESSION_COOKIE.length + 1);
    const res = await request(app).get('/api/menus').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(await provider.getSession(sessionIdForToken(token))).toBeNull();
  });

  it.each(['PENDING', 'DISABLED'] as const)('rejects a session whose user is %s', async (status) => {
    const user = await addUser(provider, { email: `${status}@example.com`, status });
    const cookie = await sessionCookieFor(provider, user);
    const res = await request(app).get('/api/menus').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('rejects a session whose user no longer exists', async () => {
    const cookie = await sessionCookieFor(provider, { id: 'ghost' } as never);
    const res = await request(app).get('/api/menus').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('ignores a malformed cookie header', async () => {
    const res = await request(app).get('/api/menus').set('Cookie', `;;=;${SESSION_COOKIE}=%E0%A4%A`);
    expect(res.status).toBe(401);
  });
});

describe('sameOriginWrites', () => {
  const app = express();
  app.use(sameOriginWrites);
  app.all('/{*rest}', (_req, res) => {
    res.send('reached');
  });
  const HOST = 'taproom.example';

  it('never blocks reads', async () => {
    const res = await request(app).get('/api/menus').set('Host', HOST).set('Origin', 'https://evil.example').set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(200);
  });

  it('allows writes from the same origin', async () => {
    const res = await request(app).post('/api/menus').set('Host', HOST).set('Origin', `https://${HOST}`).set('Sec-Fetch-Site', 'same-origin');
    expect(res.status).toBe(200);
  });

  it('allows writes with no Origin header, like scripts and curl', async () => {
    expect((await request(app).post('/api/menus').set('Host', HOST)).status).toBe(200);
  });

  it('allows a same-origin write on a non-standard port', async () => {
    const res = await request(app).put('/api/menus/1').set('Host', `${HOST}:8443`).set('Origin', `https://${HOST}:8443`);
    expect(res.status).toBe(200);
  });

  it.each([
    ['another site', 'https://evil.example'],
    ['a sibling subdomain', `https://other.${HOST}`],
    ['the same host on another port', `https://${HOST}:8443`],
    ['an opaque origin', 'null'],
    ['garbage', 'not a url'],
  ])('refuses writes from %s', async (_label, origin) => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await request(app)[method]('/api/menus').set('Host', HOST).set('Origin', origin);
      expect(res.status).toBe(403);
    }
  });

  it('refuses writes the browser marks as cross-site, even without an Origin', async () => {
    const res = await request(app).post('/api/menus').set('Host', HOST).set('Sec-Fetch-Site', 'cross-site');
    expect(res.status).toBe(403);
  });
});
