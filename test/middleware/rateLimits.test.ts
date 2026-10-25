import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { expensiveFormatLimiter, generalLimiter, loginLimiter, passwordLimiter, signupLimiter } from '../../middleware/rateLimits';

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
  app.use(express.json());
  app.use(generalLimiter);
  app.use(expensiveFormatLimiter);
  // Stands in for the real login route: the body picks the status code
  app.post('/api/auth/login', loginLimiter, (req, res) => {
    res.status(req.body?.status ?? 401).send('login');
  });
  // Stand-ins for signing up and changing a password: the body picks the status code
  app.post('/api/auth/signup', signupLimiter, (req, res) => {
    res.status(req.body?.status ?? 202).send('signup');
  });
  app.post('/api/auth/password', passwordLimiter, (req, res) => {
    res.status(req.body?.status ?? 204).send('password');
  });
  app.all('/{*rest}', (_req, res) => {
    res.send('ok');
  });
  return app;
}

describe('rate limits', () => {
  const app = makeApp();
  const login = (ip: string, status: number) =>
    request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ status });

  describe('loginLimiter', () => {
    it('blocks an address after 30 failed sign-ins, before looking at the next one', async () => {
      const ip = nextIp();
      for (let i = 0; i < 30; i++) {
        expect((await login(ip, 401)).status).toBe(401);
      }
      const blocked = await login(ip, 200);
      expect(blocked.status).toBe(429);
      expect(blocked.text).toMatch(/Too many failed sign-in attempts/);
    });

    it("doesn't count successful sign-ins", async () => {
      const ip = nextIp();
      for (let i = 0; i < 40; i++) {
        expect((await login(ip, 200)).status).toBe(200);
      }
    });

    it("doesn't count pending or disabled accounts, which only get that answer after a correct password", async () => {
      const ip = nextIp();
      for (let i = 0; i < 40; i++) {
        expect((await login(ip, 403)).status).toBe(403);
      }
    });

    it('tracks each address separately', async () => {
      const ip = nextIp();
      for (let i = 0; i < 30; i++) {
        await login(ip, 401);
      }
      expect((await login(ip, 401)).status).toBe(429);
      expect((await login(nextIp(), 401)).status).toBe(401);
    });

    it("applies only to signing in, so unauthenticated requests elsewhere don't use up the budget", async () => {
      const ip = nextIp();
      for (let i = 0; i < 40; i++) {
        await request(app).get('/api/auth/me').set('X-Forwarded-For', ip);
        await request(app).post('/menus').set('X-Forwarded-For', ip);
      }
      expect((await login(ip, 200)).status).toBe(200);
    });
  });

  describe('signupLimiter', () => {
    const signup = (ip: string) => request(app).post('/api/auth/signup').set('X-Forwarded-For', ip).send({});

    it('allows 5 requests per address per hour, however they went, and blocks the sixth', async () => {
      const ip = nextIp();
      for (let i = 0; i < 5; i++) expect((await signup(ip)).status).toBe(202);
      expect((await signup(ip)).status).toBe(429);
    });

    it('counts each address separately', async () => {
      const busy = nextIp();
      for (let i = 0; i < 6; i++) await signup(busy);
      expect((await signup(nextIp())).status).toBe(202);
    });
  });

  describe('passwordLimiter', () => {
    const change = (ip: string, status: number) => request(app).post('/api/auth/password').set('X-Forwarded-For', ip).send({ status });

    it('blocks an address after 10 wrong current passwords', async () => {
      const ip = nextIp();
      for (let i = 0; i < 10; i++) expect((await change(ip, 403)).status).toBe(403);
      expect((await change(ip, 403)).status).toBe(429);
    });

    it('does not count successful changes or validation errors', async () => {
      const ip = nextIp();
      for (let i = 0; i < 15; i++) expect((await change(ip, i % 2 ? 204 : 422)).status).toBe(i % 2 ? 204 : 422);
      expect((await change(ip, 403)).status).toBe(403);
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
