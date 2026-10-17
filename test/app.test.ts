import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';
import { addUser, Fixture, memoryProvider, seed, signedInAs } from './helpers';
import { LocalDataProvider } from '../storage/providers';

// The whole middleware stack from app.ts (helmet, rate limits, auth, CORS, caching headers,
// routers, error handler) wired together, backed by the in-memory data provider.

let app: Express;
let data: Fixture;
let provider: LocalDataProvider;
// The Cookie header for being signed in as an admin
let admin: string;

beforeEach(async () => {
  provider = memoryProvider();
  data = await seed(provider);
  admin = await signedInAs(provider);
  app = createApp(provider);
});

describe('public menu data', () => {
  it('serves the widget JSON without a login, with open CORS', async () => {
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`).set('Origin', 'https://www.example-wix-site.com');
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Currently On Tap');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
  });

  it('answers CORS preflights', async () => {
    const res = await request(app).options(`/menus/${data.menu.id}`);
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('sends the standard security headers', async () => {
    const res = await request(app).get(`/menus/${data.menu.id}`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('requires a login for any write outside the admin API', async () => {
    const res = await request(app).patch(`/menus/${data.menu.id}`).send({ displayName: 'Hacked' });
    expect(res.status).toBe(401);
  });
});

describe('admin API', () => {
  it('requires a login, even to read', async () => {
    const res = await request(app).get('/api/menus');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('works when signed in', async () => {
    const res = await request(app).get('/api/menus').set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('parses JSON bodies', async () => {
    const res = await request(app).post('/api/menus').set('Cookie', admin).send({ displayName: 'Patio' });
    expect(res.status).toBe(201);
    expect(res.body.internalName).toBe('patio');
  });

  it('is never cached and gets no CORS headers', async () => {
    const res = await request(app).get('/api/menus').set('Cookie', admin).set('Origin', 'https://evil.example');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it("doesn't answer CORS preflights for /api", async () => {
    const res = await request(app).options('/api/menus').set('Cookie', admin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('404s unknown API routes', async () => {
    const res = await request(app).get('/api/nope').set('Cookie', admin);
    expect(res.status).toBe(404);
    expect(res.text).toBe('API route not found');
  });

  it('rejects writes the browser says came from another site, even when signed in', async () => {
    const res = await request(app).post('/api/menus').set('Cookie', admin).set('Origin', 'https://evil.example').send({ displayName: 'Patio' });
    expect(res.status).toBe(403);
    expect((await provider.getMenus()).map((m) => m.displayName)).toEqual(['Currently On Tap']);
  });

  it('accepts writes from its own origin', async () => {
    const res = await request(app).post('/api/menus').set('Cookie', admin).set('Host', 'taproom.example').set('Origin', 'https://taproom.example').send({ displayName: 'Patio' });
    expect(res.status).toBe(201);
  });
});

describe('signing in', () => {
  it('works end to end: sign in, use the API, sign out, lose access', async () => {
    await addUser(provider, { email: 'owner@example.com', password: 'a-good-password' });
    const agent = request.agent(app);
    expect((await agent.get('/api/menus')).status).toBe(401);

    const login = await agent.post('/api/auth/login').set('X-Forwarded-For', '203.0.113.7').send({ email: 'owner@example.com', password: 'a-good-password' });
    expect(login.status).toBe(200);
    expect(login.headers['cache-control']).toBe('no-store');

    expect((await agent.get('/api/menus')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('owner@example.com');

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/menus')).status).toBe(401);
  });

  it('lets anyone reach the sign-in route, and no other part of /api/auth', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'x', password: 'y' })).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/nope')).status).toBe(401);
  });

  it('404s unknown /api/auth routes once signed in', async () => {
    const res = await request(app).get('/api/auth/nope').set('Cookie', admin);
    expect(res.status).toBe(404);
  });

  it("doesn't accept the old shared Basic Auth login any more", async () => {
    const basic = `Basic ${Buffer.from('admin:pw-for-tests').toString('base64')}`;
    const res = await request(app).get('/api/menus').set('Authorization', basic);
    expect(res.status).toBe(401);
  });
});

describe('proxy trust', () => {
  // The rate limiters are module-level, so every app built in this file shares their counters.
  // These tests use their own client addresses (or run last for localhost) to stay independent.
  const failedLogin = (target: Express, forwardedFor: string) =>
    request(target).post('/api/auth/login').set('X-Forwarded-For', forwardedFor).send({ email: 'admin@example.com', password: 'wrong' });

  it('ignores X-Forwarded-For unless TOE_TRUST_PROXY is set', async () => {
    // With no trusted proxy, spoofed X-Forwarded-For values all count as the same client. (Other
    // tests in this file may already have used a few of localhost's 30 failed sign-ins.)
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) {
      statuses.push((await failedLogin(app, `192.0.2.${i}`)).status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(30);
  });

  it('uses X-Forwarded-For from the proxy when TOE_TRUST_PROXY=true', async () => {
    vi.stubEnv('TOE_TRUST_PROXY', 'true');
    const proxied = createApp(provider);
    for (let i = 0; i < 30; i++) {
      await failedLogin(proxied, '198.51.100.1');
    }
    expect((await failedLogin(proxied, '198.51.100.1')).status).toBe(429);
    expect((await failedLogin(proxied, '198.51.100.2')).status).toBe(401);
  });
});
