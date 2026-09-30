import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';
import { basicAuth, Fixture, memoryProvider, seed } from './helpers';

// The whole middleware stack from app.ts (helmet, rate limits, auth, CORS, caching headers,
// routers, error handler) wired together, backed by the in-memory data provider.

let app: Express;
let data: Fixture;
const admin = basicAuth('admin', 's3cret');

beforeEach(async () => {
  vi.stubEnv('TOE_ADMIN_USERNAME', 'admin');
  vi.stubEnv('TOE_ADMIN_PASSWORD', 's3cret');
  const provider = memoryProvider();
  data = await seed(provider);
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

  it('still requires a login to change menu data through the classic routes', async () => {
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

  it('works with the admin login', async () => {
    const res = await request(app).get('/api/menus').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('parses JSON bodies', async () => {
    const res = await request(app).post('/api/menus').set('Authorization', admin).send({ displayName: 'Patio' });
    expect(res.status).toBe(201);
    expect(res.body.internalName).toBe('patio');
  });

  it('is never cached and gets no CORS headers', async () => {
    const res = await request(app).get('/api/menus').set('Authorization', admin).set('Origin', 'https://evil.example');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it("doesn't answer CORS preflights for /api", async () => {
    const res = await request(app).options('/api/menus').set('Authorization', admin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('404s unknown API routes', async () => {
    const res = await request(app).get('/api/nope').set('Authorization', admin);
    expect(res.status).toBe(404);
    expect(res.text).toBe('API route not found');
  });

  it('fails closed when no admin password is configured', async () => {
    vi.stubEnv('TOE_ADMIN_PASSWORD', '');
    const res = await request(app).get('/api/menus').set('Authorization', basicAuth('admin', ''));
    expect(res.status).toBe(503);
  });
});

describe('proxy trust', () => {
  // The rate limiters are module-level, so every app built in this file shares their counters.
  // These tests use their own client addresses (or run last for localhost) to stay independent.
  it('ignores X-Forwarded-For unless TOE_TRUST_PROXY is set', async () => {
    // With no trusted proxy, spoofed X-Forwarded-For values all count as the same client
    for (let i = 0; i < 30; i++) {
      await request(app).get('/api/menus').set('X-Forwarded-For', `192.0.2.${i}`);
    }
    const res = await request(app).get('/api/menus').set('X-Forwarded-For', '192.0.2.200').set('Authorization', admin);
    expect(res.status).toBe(429);
  });

  it('uses X-Forwarded-For from the proxy when TOE_TRUST_PROXY=true', async () => {
    vi.stubEnv('TOE_TRUST_PROXY', 'true');
    const proxied = createApp(memoryProvider());
    for (let i = 0; i < 30; i++) {
      await request(proxied).get('/api/menus').set('X-Forwarded-For', '198.51.100.1');
    }
    expect((await request(proxied).get('/api/menus').set('X-Forwarded-For', '198.51.100.1').set('Authorization', admin)).status).toBe(429);
    expect((await request(proxied).get('/api/menus').set('X-Forwarded-For', '198.51.100.2').set('Authorization', admin)).status).toBe(200);
  });
});
