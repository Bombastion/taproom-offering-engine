import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { adminAuth } from '../../middleware/auth';
import { adminLimiter, expensiveFormatLimiter, generalLimiter } from '../../middleware/rateLimits';
import { basicAuth } from '../helpers';

// Each limiter keeps its counts in memory for the life of the module. Vitest gives every test
// file a fresh module graph, and each test below uses its own client IP (via X-Forwarded-For
// with trust proxy on), so the tests don't eat into each other's budgets.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

function makeApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(generalLimiter);
  app.use(expensiveFormatLimiter);
  app.use(adminLimiter);
  app.use(adminAuth);
  app.all('/{*rest}', (_req, res) => {
    res.send('ok');
  });
  return app;
}

describe('rate limits', () => {
  const app = makeApp();

  beforeEach(() => {
    vi.stubEnv('TOE_ADMIN_PASSWORD', 's3cret');
  });

  describe('adminLimiter', () => {
    it('blocks an address after 30 failed sign-ins, before checking credentials', async () => {
      const ip = nextIp();
      for (let i = 0; i < 30; i++) {
        const res = await request(app).get('/api/menus').set('X-Forwarded-For', ip).set('Authorization', basicAuth('admin', 'wrong'));
        expect(res.status).toBe(401);
      }
      const blocked = await request(app).get('/api/menus').set('X-Forwarded-For', ip).set('Authorization', basicAuth('admin', 's3cret'));
      expect(blocked.status).toBe(429);
      expect(blocked.text).toMatch(/Too many failed sign-in attempts/);
    });

    it("doesn't count successful admin requests", async () => {
      const ip = nextIp();
      for (let i = 0; i < 40; i++) {
        const res = await request(app).get('/api/menus').set('X-Forwarded-For', ip).set('Authorization', basicAuth('admin', 's3cret'));
        expect(res.status).toBe(200);
      }
    });

    it("doesn't apply to public reads", async () => {
      const ip = nextIp();
      for (let i = 0; i < 30; i++) {
        await request(app).get('/api/menus').set('X-Forwarded-For', ip);
      }
      const publicRead = await request(app).get('/menus/abc').set('X-Forwarded-For', ip);
      expect(publicRead.status).toBe(200);
    });

    it('tracks each address separately', async () => {
      const ip = nextIp();
      for (let i = 0; i < 30; i++) {
        await request(app).post('/menus').set('X-Forwarded-For', ip);
      }
      expect((await request(app).post('/menus').set('X-Forwarded-For', ip)).status).toBe(429);
      expect((await request(app).post('/menus').set('X-Forwarded-For', nextIp())).status).toBe(401);
    });
  });

  describe('expensiveFormatLimiter', () => {
    it.each(['digital', 'print'])('allows 10 ?format=%s requests a minute per address', async (format) => {
      const ip = nextIp();
      for (let i = 0; i < 10; i++) {
        expect((await request(app).get(`/menus/abc?format=${format}`).set('X-Forwarded-For', ip)).status).toBe(200);
      }
      const blocked = await request(app).get(`/menus/abc?format=${format}`).set('X-Forwarded-For', ip);
      expect(blocked.status).toBe(429);
      expect(blocked.text).toMatch(/Too many menu-export requests/);
    });

    it('shares one budget between the two PDF-ish formats', async () => {
      const ip = nextIp();
      for (let i = 0; i < 5; i++) {
        await request(app).get('/menus/abc?format=digital').set('X-Forwarded-For', ip);
        await request(app).get('/menus/abc?format=print').set('X-Forwarded-For', ip);
      }
      expect((await request(app).get('/menus/abc?format=print').set('X-Forwarded-For', ip)).status).toBe(429);
    });

    it("doesn't limit the cheap formats", async () => {
      const ip = nextIp();
      for (let i = 0; i < 15; i++) {
        expect((await request(app).get('/menus/abc?format=widget').set('X-Forwarded-For', ip)).status).toBe(200);
        expect((await request(app).get('/menus/abc?format=json').set('X-Forwarded-For', ip)).status).toBe(200);
      }
    });
  });

  describe('generalLimiter', () => {
    it('allows 300 requests per 5 minutes per address, then answers 429', async () => {
      const ip = nextIp();
      for (let i = 0; i < 300; i++) {
        const res = await request(app).get('/menus/abc').set('X-Forwarded-For', ip);
        if (res.status !== 200) throw new Error(`request ${i + 1} got ${res.status}`);
      }
      const blocked = await request(app).get('/menus/abc').set('X-Forwarded-For', ip);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['ratelimit-policy']).toBeDefined();
    });
  });
});
