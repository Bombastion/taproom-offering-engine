import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Request, Response } from 'express';
import Routes from '../../routes/common';
import { DataProviderError } from '../../storage/providers';
import { appWith, memoryProvider } from '../helpers';

// A minimal router that exposes the shared helpers on Routes
class TestRoutes extends Routes {
  registerRoutes(): void {
    this.router.post('/validate', (req: Request, res: Response) => {
      if (this.validateInput(req, res, { name: 'string', abv: 'number' })) {
        res.send('valid');
      }
    });
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

describe('Routes.validateInput', () => {
  it('passes when every required field is present', async () => {
    const res = await request(app).post('/validate').send({ name: 'Pils', abv: 5 });
    expect(res.status).toBe(200);
    expect(res.text).toBe('valid');
  });

  it('accepts numbers sent as strings (form posts)', async () => {
    const res = await request(app).post('/validate').send({ name: 'Pils', abv: '5.2' });
    expect(res.status).toBe(200);
  });

  it('lists every missing field with a 422', async () => {
    const res = await request(app).post('/validate').send({});
    expect(res.status).toBe(422);
    expect(res.text).toBe('All of [name, abv] must be provided');
  });

  it('treats empty values as missing', async () => {
    const res = await request(app).post('/validate').send({ name: '', abv: 5 });
    expect(res.status).toBe(422);
    expect(res.text).toBe('All of [name] must be provided');
  });

  it('reports wrong types with a 400', async () => {
    const res = await request(app).post('/validate').send({ name: 42, abv: 5 });
    expect(res.status).toBe(400);
    expect(res.text).toBe('The following type errors were found: [name must be of type string]');
  });
});

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
