import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { Request } from 'express';
import request from 'supertest';
import { adminAuth, isApiPath, requiresAuth } from '../../middleware/auth';
import { basicAuth } from '../helpers';

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

describe('adminAuth', () => {
  const app = express();
  app.use(adminAuth);
  app.all('/{*rest}', (_req, res) => {
    res.send('reached');
  });

  beforeEach(() => {
    vi.stubEnv('TOE_ADMIN_USERNAME', 'admin');
    vi.stubEnv('TOE_ADMIN_PASSWORD', 's3cret');
  });

  it('lets public reads through without credentials', async () => {
    const res = await request(app).get('/menus/abc');
    expect(res.status).toBe(200);
    expect(res.text).toBe('reached');
  });

  it('fails closed with 503 when no admin password is configured', async () => {
    vi.stubEnv('TOE_ADMIN_PASSWORD', '');
    const res = await request(app).post('/menus').set('Authorization', basicAuth('admin', ''));
    expect(res.status).toBe(503);
    expect(res.text).toMatch(/TOE_ADMIN_PASSWORD/);
  });

  it('still lets public reads through when no password is configured', async () => {
    vi.stubEnv('TOE_ADMIN_PASSWORD', '');
    const res = await request(app).get('/menus/abc');
    expect(res.status).toBe(200);
  });

  it('accepts the right credentials', async () => {
    const res = await request(app).post('/menus').set('Authorization', basicAuth('admin', 's3cret'));
    expect(res.status).toBe(200);
    expect(res.text).toBe('reached');
  });

  it('defaults the username to "admin" when TOE_ADMIN_USERNAME is unset', async () => {
    vi.stubEnv('TOE_ADMIN_USERNAME', '');
    const res = await request(app).get('/api/menus').set('Authorization', basicAuth('admin', 's3cret'));
    expect(res.status).toBe(200);
  });

  it('uses a custom username when one is set', async () => {
    vi.stubEnv('TOE_ADMIN_USERNAME', 'taproom');
    expect((await request(app).get('/api/menus').set('Authorization', basicAuth('taproom', 's3cret'))).status).toBe(200);
    expect((await request(app).get('/api/menus').set('Authorization', basicAuth('admin', 's3cret'))).status).toBe(401);
  });

  it('reads the password at request time rather than at import time', async () => {
    vi.stubEnv('TOE_ADMIN_PASSWORD', 'changed');
    expect((await request(app).post('/x').set('Authorization', basicAuth('admin', 's3cret'))).status).toBe(401);
    expect((await request(app).post('/x').set('Authorization', basicAuth('admin', 'changed'))).status).toBe(200);
  });

  it.each([
    ['wrong password', basicAuth('admin', 'nope')],
    ['wrong username', basicAuth('root', 's3cret')],
    ['password prefix', basicAuth('admin', 's3cre')],
    ['password with extra characters', basicAuth('admin', 's3cret!')],
    // Both sides are zero-padded to the same length before the constant-time compare, so this
    // only fails because the real lengths are checked too
    ['password with trailing NUL bytes', basicAuth('admin', 's3cret\u0000\u0000')],
    ['no separator', `Basic ${Buffer.from('admins3cret').toString('base64')}`],
    ['non-basic scheme', 'Bearer s3cret'],
    ['empty header', ''],
  ])('rejects %s', async (_label, header) => {
    const res = await request(app).post('/menus').set('Authorization', header);
    expect(res.status).toBe(401);
    expect(res.text).toBe('Authentication required.');
  });

  it('rejects requests with no Authorization header', async () => {
    const res = await request(app).delete('/menus/abc');
    expect(res.status).toBe(401);
  });

  it('handles passwords containing colons and non-ASCII characters', async () => {
    vi.stubEnv('TOE_ADMIN_PASSWORD', 'pa:ss:wörd🍺');
    const res = await request(app).post('/menus').set('Authorization', basicAuth('admin', 'pa:ss:wörd🍺'));
    expect(res.status).toBe(200);
  });

  it('sends a Basic challenge outside /api', async () => {
    const res = await request(app).post('/menus');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Basic realm="Taproom Admin", charset="UTF-8"');
  });

  it('leaves out the challenge header for /api so the admin client can show its own sign-in', async () => {
    const res = await request(app).get('/api/menus');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBeUndefined();
  });
});
