import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, formatPrice, plural } from '../src/api';
import { getCredentials, signIn } from '../src/auth';
import { ADMIN, json, mockApi, status } from './utils';

describe('requests', () => {
  it('sends the stored login as Basic auth and asks for JSON', async () => {
    signIn(ADMIN, false);
    const server = mockApi({ 'GET /api/menus': json([]) });
    await api.menus();
    const [request] = server.requests;
    expect(request.headers.authorization).toBe(`Basic ${btoa('admin:hunter2')}`);
    expect(request.headers.accept).toBe('application/json');
    expect(request.headers['content-type']).toBeUndefined();
  });

  it('sends no Authorization header when signed out', async () => {
    const server = mockApi({ 'GET /api/menus': json([]) });
    await api.menus();
    expect(server.requests[0].headers.authorization).toBeUndefined();
  });

  it('sends bodies as JSON', async () => {
    signIn(ADMIN, false);
    const server = mockApi({ 'POST /api/menus': json({ id: 'm1', displayName: 'Patio' }, 201) });
    const menu = await api.createMenu('Patio');
    expect(menu).toEqual({ id: 'm1', displayName: 'Patio' });
    expect(server.requests[0].headers['content-type']).toBe('application/json');
    expect(server.requests[0].body).toEqual({ displayName: 'Patio' });
  });

  it('escapes IDs in paths', async () => {
    const server = mockApi({ 'GET /api/menus/a%2Fb%3F': json({}) });
    await api.menu('a/b?');
    expect(server.unhandled).toEqual([]);
  });

  it('resolves 204 responses to undefined', async () => {
    mockApi({ 'DELETE /api/sections/s1': status(204) });
    await expect(api.deleteSection('s1')).resolves.toBeUndefined();
  });

  it.each([
    ['saveMenuItem', () => api.saveMenuItem('mi1', { displayName: 'Pils', internalName: null, breweryId: null, style: null, abv: 5, description: null }, [{ containerId: 'c1', price: 6 }]), 'PUT /api/menu-items/mi1', { item: { displayName: 'Pils', internalName: null, breweryId: null, style: null, abv: 5, description: null }, pours: [{ containerId: 'c1', price: 6 }] }],
    ['reorderSections', () => api.reorderSections('m1', ['b', 'a']), 'PUT /api/menus/m1/sections/order', { sectionIds: ['b', 'a'] }],
    ['reorderItems', () => api.reorderItems('s1', ['y', 'x']), 'PUT /api/sections/s1/items/order', { menuItemIds: ['y', 'x'] }],
    ['addExistingItem', () => api.addExistingItem('s1', 'i1'), 'POST /api/sections/s1/items', { itemId: 'i1' }],
    ['updateBrewery', () => api.updateBrewery('b1', 'Zymos', null), 'PATCH /api/breweries/b1', { name: 'Zymos', location: null }],
    ['setMenuLogo', () => api.setMenuLogo('m1', 'abc'), 'PUT /api/menus/m1/logo', { logo: 'abc' }],
  ])('%s calls the right endpoint', async (_name, call, route, body) => {
    const server = mockApi({ [route]: status(204) });
    await call();
    expect(server.unhandled).toEqual([]);
    expect(server.requests[0].body).toEqual(body);
  });
});

describe('errors', () => {
  it('signs out when stored credentials stop working', async () => {
    signIn(ADMIN, true);
    mockApi({ 'GET /api/menus': status(401, 'Authentication required.') });
    const error = await api.menus().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Please sign in again.');
    expect(getCredentials()).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("doesn't sign out when checking a new login fails", async () => {
    signIn(ADMIN, false);
    const server = mockApi({ 'GET /api/session': status(401) });
    await expect(api.checkCredentials({ username: 'admin', password: 'wrong' })).rejects.toMatchObject({ status: 401 });
    expect(getCredentials()).toEqual(ADMIN);
    // The credentials being checked are the ones sent
    expect(server.requests[0].headers.authorization).toBe(`Basic ${btoa('admin:wrong')}`);
  });

  it.each([
    [429, 'Too many failed sign-in attempts from this address.', 'Too many failed sign-in attempts from this address.'],
    [429, '', 'Too many attempts. Please wait a bit and try again.'],
    [500, 'stack trace here', 'Something went wrong on the server. Please try again.'],
    [503, '', 'Something went wrong on the server. Please try again.'],
    [422, 'displayName is required', 'displayName is required'],
    [404, '', 'Request failed (404)'],
  ])('turns a %i into a readable message', async (code, body, message) => {
    mockApi({ 'GET /api/menus': status(code, body) });
    await expect(api.menus()).rejects.toMatchObject({ status: code, message });
  });

  it('cuts very long error bodies short', async () => {
    mockApi({ 'GET /api/menus': status(400, 'x'.repeat(1000)) });
    const error = await api.menus().catch((e) => e);
    expect(error.message).toHaveLength(300);
  });

  it('reports network failures as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.menus()).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/Couldn't reach the server/) });
  });
});

describe('formatting helpers', () => {
  it.each([
    [8, '$8'],
    [0, '$0'],
    [6.5, '$6.50'],
    [7.25, '$7.25'],
  ])('formatPrice(%d) is %s', (price, text) => {
    expect(formatPrice(price)).toBe(text);
  });

  it('pluralizes', () => {
    expect(plural(0, 'item')).toBe('0 items');
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(2, 'section')).toBe('2 sections');
  });

  it('extracts error messages', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
    expect(errorMessage('nope')).toBe('Something went wrong.');
  });
});
