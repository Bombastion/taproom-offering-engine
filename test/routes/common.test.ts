import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Request, Response } from 'express';
import Routes from '../../routes/common';
import { DataProviderError } from '../../storage/providers';
import { appWith, memoryProvider } from '../helpers';

// A minimal router that exposes the shared error handler on Routes
class TestRoutes extends Routes {
  registerRoutes(): void {
    this.router.get('/throw/:kind', (req: Request, res: Response) => {
      const errors: Record<string, unknown> = {
        notFound: new DataProviderError('Menu not found', 404),
        unprocessable: new DataProviderError('Name required', 422),
        serverWithStatus: new DataProviderError('db password is hunter2', 503),
        plain: new Error('column "secret" does not exist'),
        string: 'just a string',
        nullish: null,
      };
      this.handleError(res, errors[req.params.kind as string]);
    });
  }
}

const app = appWith('/', new TestRoutes(memoryProvider()).router);

describe('Routes.handleError', () => {
  it.each([
    ['notFound', 404, 'Menu not found'],
    ['unprocessable', 422, 'Name required'],
  ])('relays the message of intentional client errors (%s)', async (kind, status, message) => {
    const res = await request(app).get(`/throw/${kind}`);
    expect(res.status).toBe(status);
    expect(res.text).toBe(message);
  });

  it.each(['serverWithStatus', 'plain', 'string', 'nullish'])(
    'hides internal details for anything that is not a 4xx (%s)',
    async (kind) => {
      const res = await request(app).get(`/throw/${kind}`);
      expect(res.status).toBe(kind === 'serverWithStatus' ? 503 : 500);
      expect(res.text).toBe('Unexpected error occurred');
    },
  );
});
