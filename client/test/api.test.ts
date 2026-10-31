import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, formatPrice, plural } from '../src/api';
import { getSession, setSignedIn } from '../src/auth';
import { ADMIN, json, mockApi, status } from './utils';

describe('requests', () => {
  it('asks for JSON and lets the browser send the session cookie, with no credentials of its own', async () => {
    const server = mockApi({ 'GET /api/menus': json([]) });
    await api.menus();
    const [request] = server.requests;
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers.accept).toBe('application/json');
    expect(request.headers['content-type']).toBeUndefined();
    expect(server.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('sends bodies as JSON', async () => {
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
    ['setMenuItemLogo', () => api.setMenuItemLogo('mi1', 'abc'), 'PUT /api/menu-items/mi1/logo', { logo: 'abc' }],
    ['removeMenuItemLogo', () => api.removeMenuItemLogo('mi1'), 'DELETE /api/menu-items/mi1/logo', undefined],
  ])('%s calls the right endpoint', async (_name, call, route, body) => {
    const server = mockApi({ [route]: status(204) });
    await call();
    expect(server.unhandled).toEqual([]);
    expect(server.requests[0].body).toEqual(body);
  });
});

describe('print designs', () => {
  const design = { version: 1 } as never;

  it('calls the right endpoints', async () => {
    const server = mockApi({
      'GET /api/design/fonts': json([]),
      'GET /api/menus/m1/design/print': json({}),
      'PUT /api/menus/m1/design/print': json({}),
      'DELETE /api/menus/m1/design/print': status(204),
    });
    await api.designFonts();
    await api.printDesign('m1');
    await api.savePrintDesign('m1', design);
    await api.resetPrintDesign('m1');
    expect(server.unhandled).toEqual([]);
    expect(server.calls('PUT', '/api/menus/m1/design/print')[0].body).toEqual({ design });
  });

  it('gets the preview as text, with the design in the body', async () => {
    const server = mockApi({ 'POST /api/menus/m1/design/print/preview': { text: '<html>page</html>' } });
    await expect(api.previewPrintDesign('m1', design)).resolves.toBe('<html>page</html>');
    expect(server.requests[0].headers.accept).toBe('text/html');
    expect(server.requests[0].body).toEqual({ design });
  });

  it('explains what is wrong with a design, field by field', async () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({ path: `footer.field${i}`, message: 'Not a setting a design has' }));
    mockApi({ 'PUT /api/menus/m1/design/print': json({ error: 'The design has problems. footer.field0: Not a setting a design has', issues }, 400) });
    const error = await api.savePrintDesign('m1', design).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.message).toBe('The design has problems. footer.field0: Not a setting a design has');
    // The whole list, however long (the message is cut short; the problems are not)
    expect(error.issues).toEqual(issues);
  });

  it('lets a request be cancelled without calling it a failure to reach the server', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = api.previewPrintDesign('m1', design, controller.signal);
    controller.abort();
    const error = await pending.catch((e) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
  });
});

describe('errors', () => {
  it('signs out when the session stops working', async () => {
    setSignedIn(ADMIN);
    mockApi({ 'GET /api/menus': status(401, 'Authentication required.') });
    const error = await api.menus().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(error.message).toBe('Please sign in again.');
    expect(getSession()).toEqual({ status: 'signedOut' });
  });

  it("doesn't sign out when a sign-in attempt is refused", async () => {
    setSignedIn(ADMIN);
    mockApi({ 'POST /api/auth/login': status(401, 'Incorrect email or password.') });
    await expect(api.login('admin@example.com', 'wrong', false)).rejects.toMatchObject({ status: 401 });
    expect(getSession().status).toBe('signedIn');
  });

  it('reads the code and message from errors the server explains as JSON', async () => {
    mockApi({ 'POST /api/auth/login': json({ code: 'pending', message: 'Your account is waiting for an admin to approve it.' }, 403) });
    const error = await api.login('new@example.com', 'pw', false).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'pending', message: 'Your account is waiting for an admin to approve it.' });
  });

  it('has no code on plain-text errors', async () => {
    mockApi({ 'GET /api/menus': status(404, 'Menu not found') });
    const error = await api.menus().catch((e) => e);
    expect(error.code).toBeUndefined();
  });

  it('copes with a JSON content type and a body that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops {', { status: 400, headers: { 'Content-Type': 'application/json' } })));
    await expect(api.menus()).rejects.toMatchObject({ status: 400, message: 'oops {' });
  });

  it('calls the sign-in, sign-out and who-am-I routes', async () => {
    const server = mockApi({
      'POST /api/auth/login': json({ user: ADMIN }),
      'POST /api/auth/logout': status(204),
      'GET /api/auth/me': json({ user: ADMIN }),
    });
    await expect(api.login('admin@example.com', 'pw', true)).resolves.toEqual({ user: ADMIN });
    await expect(api.logout()).resolves.toBeUndefined();
    await expect(api.me()).resolves.toEqual({ user: ADMIN });
    expect(server.requests[0].body).toEqual({ email: 'admin@example.com', password: 'pw', remember: true });
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
