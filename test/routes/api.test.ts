import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { ApiRoutes } from '../../routes/api';
import { LocalDataProvider } from '../../storage/providers';
import { ItemContainer } from '../../models/containers';
import { appWith, Fixture, GIF_HEADER, JPEG_HEADER, memoryProvider, seed, TINY_PNG } from '../helpers';

// The admin JSON API (routes/api.ts), exercised over HTTP against the in-memory data provider.
// Auth and rate limiting sit in front of this router in the real app; they're covered in
// test/middleware and test/app.test.ts.

let provider: LocalDataProvider;
let data: Fixture;
let app: Express;

beforeEach(async () => {
  provider = memoryProvider();
  data = await seed(provider);
  app = appWith('/api', new ApiRoutes(provider).router);
});

describe('GET /api/session', () => {
  it('answers ok', async () => {
    const res = await request(app).get('/api/session');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('menus', () => {
  it('lists menus alphabetically with section and item counts', async () => {
    await provider.addMenu({ id: null, internalName: 'a', displayName: 'Anniversary', logo: null });
    const res = await request(app).get('/api/menus');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: expect.any(String), displayName: 'Anniversary', internalName: 'a', sectionCount: 0, itemCount: 0 },
      { id: data.menu.id, displayName: 'Currently On Tap', internalName: 'on-tap', sectionCount: 3, itemCount: 3 },
    ]);
  });

  it('creates a menu, deriving the internal name from the display name', async () => {
    const res = await request(app).post('/api/menus').send({ displayName: '  Summer Séasonals! ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), displayName: 'Summer Séasonals!', internalName: 'summer-seasonals' });
    expect((await provider.getMenu(res.body.id))?.displayName).toBe('Summer Séasonals!');
  });

  it('keeps an explicit internal name', async () => {
    const res = await request(app).post('/api/menus').send({ displayName: 'Summer', internalName: 'summer-2026' });
    expect(res.body.internalName).toBe('summer-2026');
  });

  it('falls back to "untitled" when the name has nothing slug-able in it', async () => {
    const res = await request(app).post('/api/menus').send({ displayName: '🍺🍺' });
    expect(res.body.internalName).toBe('untitled');
  });

  it.each([
    [{}, 422, 'displayName is required'],
    [{ displayName: '   ' }, 422, 'displayName is required'],
    [{ displayName: 12 }, 400, 'displayName must be a string'],
    [{ displayName: 'x'.repeat(201) }, 400, 'displayName must be at most 200 characters'],
  ])('rejects a bad new menu %j', async (body, status, message) => {
    const res = await request(app).post('/api/menus').send(body);
    expect(res.status).toBe(status);
    expect(res.text).toBe(message);
  });

  it('shows a menu with its sections in order and the item names in each', async () => {
    const res = await request(app).get(`/api/menus/${data.menu.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: data.menu.id,
      displayName: 'Currently On Tap',
      internalName: 'on-tap',
      hasLogo: true,
      logo: `data:image/png;base64,${TINY_PNG}`,
      sections: [
        { id: data.sections.drafts.id, displayName: 'Drafts', internalName: 'on-tap-drafts', order: 1, itemCount: 2, itemNames: ['Hazy Sequence', 'Pils'] },
        { id: data.sections.guestTaps.id, displayName: 'Guest Taps', internalName: 'on-tap-guest', order: 2, itemCount: 1, itemNames: ['Guest Sour'] },
        { id: data.sections.empty.id, displayName: 'Empty', internalName: 'on-tap-empty', order: 3, itemCount: 0, itemNames: [] },
      ],
    });
  });

  it('puts sections without an order last', async () => {
    await provider.addSubMenu({ id: null, internalName: 'x', displayName: 'Unordered', menuId: data.menu.id, order: null });
    const res = await request(app).get(`/api/menus/${data.menu.id}`);
    expect(res.body.sections.map((s: { displayName: string }) => s.displayName)).toEqual(['Drafts', 'Guest Taps', 'Empty', 'Unordered']);
  });

  it('reports a menu without a logo', async () => {
    await provider.replaceMenu(data.menu.id!, { ...data.menu, logo: null });
    const res = await request(app).get(`/api/menus/${data.menu.id}`);
    expect(res.body.hasLogo).toBe(false);
    expect(res.body.logo).toBeNull();
  });

  it('labels a JPEG logo as a JPEG', async () => {
    await provider.replaceMenu(data.menu.id!, { ...data.menu, logo: JPEG_HEADER });
    const res = await request(app).get(`/api/menus/${data.menu.id}`);
    expect(res.body.logo).toBe(`data:image/jpeg;base64,${JPEG_HEADER}`);
  });

  it('404s for an unknown menu', async () => {
    const res = await request(app).get('/api/menus/nope');
    expect(res.status).toBe(404);
    expect(res.text).toBe('Menu not found');
  });

  it('renames a menu', async () => {
    const res = await request(app).patch(`/api/menus/${data.menu.id}`).send({ displayName: 'On Tap Now' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: data.menu.id, displayName: 'On Tap Now', internalName: 'on-tap' });
    // The logo isn't touched by a rename
    expect((await provider.getMenu(data.menu.id!))?.logo).toBe(TINY_PNG);
  });

  it('404s when renaming an unknown menu', async () => {
    const res = await request(app).patch('/api/menus/nope').send({ displayName: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('menu logos', () => {
  it('stores an uploaded PNG as bare base64', async () => {
    await provider.replaceMenu(data.menu.id!, { ...data.menu, logo: null });
    const res = await request(app).put(`/api/menus/${data.menu.id}/logo`).send({ logo: TINY_PNG });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ logo: `data:image/png;base64,${TINY_PNG}` });
    expect((await provider.getMenu(data.menu.id!))?.logo).toBe(TINY_PNG);
  });

  it('accepts a data: URL and strips whitespace', async () => {
    const wrapped = `data:image/png;base64,${TINY_PNG.slice(0, 20)}\n${TINY_PNG.slice(20)}`;
    const res = await request(app).put(`/api/menus/${data.menu.id}/logo`).send({ logo: wrapped });
    expect(res.status).toBe(200);
    expect((await provider.getMenu(data.menu.id!))?.logo).toBe(TINY_PNG);
  });

  it('accepts a JPEG', async () => {
    const res = await request(app).put(`/api/menus/${data.menu.id}/logo`).send({ logo: JPEG_HEADER });
    expect(res.status).toBe(200);
    expect(res.body.logo).toBe(`data:image/jpeg;base64,${JPEG_HEADER}`);
  });

  it.each([
    ['missing', {}, 'logo must be a base64-encoded PNG or JPEG image'],
    ['not a string', { logo: 5 }, 'logo must be a base64-encoded PNG or JPEG image'],
    ['not base64', { logo: 'not*base64!' }, 'logo must be base64-encoded'],
    ['a GIF', { logo: GIF_HEADER }, 'Logos must be PNG or JPEG images'],
    ['random bytes', { logo: Buffer.from('hello world').toString('base64') }, 'Logos must be PNG or JPEG images'],
  ])('rejects a logo that is %s', async (_label, body, message) => {
    const res = await request(app).put(`/api/menus/${data.menu.id}/logo`).send(body);
    expect(res.status).toBe(400);
    expect(res.text).toBe(message);
    expect((await provider.getMenu(data.menu.id!))?.logo).toBe(TINY_PNG);
  });

  it('rejects logos over 3 MB', async () => {
    const big = Buffer.concat([Buffer.from(TINY_PNG, 'base64'), Buffer.alloc(3 * 1024 * 1024)]).toString('base64');
    const res = await request(app).put(`/api/menus/${data.menu.id}/logo`).send({ logo: big });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/at most 3 MB/);
  });

  it('removes a logo', async () => {
    const res = await request(app).delete(`/api/menus/${data.menu.id}/logo`);
    expect(res.status).toBe(204);
    const menu = await provider.getMenu(data.menu.id!);
    expect(menu?.logo).toBeNull();
    expect(menu?.displayName).toBe('Currently On Tap');
  });

  it('404s for an unknown menu', async () => {
    expect((await request(app).put('/api/menus/nope/logo').send({ logo: TINY_PNG })).status).toBe(404);
    expect((await request(app).delete('/api/menus/nope/logo')).status).toBe(404);
  });
});

describe('sections', () => {
  it('adds a section to the end of a menu', async () => {
    const res = await request(app).post(`/api/menus/${data.menu.id}/sections`).send({ displayName: 'Bottles & Cans' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ displayName: 'Bottles & Cans', internalName: 'on-tap-bottles-cans', menuId: data.menu.id, order: 4 });
  });

  it('starts ordering at 1 on an empty menu', async () => {
    const menu = await provider.addMenu({ id: null, internalName: 'new', displayName: 'New', logo: null });
    const res = await request(app).post(`/api/menus/${menu.id}/sections`).send({ displayName: 'First' });
    expect(res.body.order).toBe(1);
  });

  it('validates new sections', async () => {
    expect((await request(app).post(`/api/menus/${data.menu.id}/sections`).send({})).status).toBe(422);
    expect((await request(app).post('/api/menus/nope/sections').send({ displayName: 'x' })).status).toBe(404);
  });

  it('reorders sections', async () => {
    const { drafts, guestTaps, empty } = data.sections;
    const res = await request(app)
      .put(`/api/menus/${data.menu.id}/sections/order`)
      .send({ sectionIds: [empty.id, drafts.id, guestTaps.id] });
    expect(res.status).toBe(204);
    expect((await provider.getSubMenu(empty.id!))?.order).toBe(1);
    expect((await provider.getSubMenu(drafts.id!))?.order).toBe(2);
    expect((await provider.getSubMenu(guestTaps.id!))?.order).toBe(3);
  });

  it.each([
    ['is not a list', () => ({ sectionIds: 'abc' }), 'sectionIds must be a list of IDs'],
    ['has non-strings', () => ({ sectionIds: [1, 2, 3] }), 'sectionIds must be a list of IDs'],
    ['is missing a section', () => ({ sectionIds: [data.sections.drafts.id, data.sections.guestTaps.id] }), 'sectionIds must list every section of this menu exactly once'],
    ['has an unknown section', () => ({ sectionIds: [data.sections.drafts.id, data.sections.guestTaps.id, 'other'] }), 'sectionIds must list every section of this menu exactly once'],
  ])('rejects a section order that %s', async (_label, body, message) => {
    const res = await request(app).put(`/api/menus/${data.menu.id}/sections/order`).send(body());
    expect(res.status).toBe(400);
    expect(res.text).toBe(message);
    expect((await provider.getSubMenu(data.sections.drafts.id!))?.order).toBe(1);
  });

  it('shows a section with its items, breweries and pours in menu order', async () => {
    const res = await request(app).get(`/api/sections/${data.sections.drafts.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: data.sections.drafts.id,
      displayName: 'Drafts',
      internalName: 'on-tap-drafts',
      menu: { id: data.menu.id, displayName: 'Currently On Tap' },
      items: [
        {
          menuItemId: data.menuItems.hazyOnDrafts.id,
          order: 1,
          item: {
            id: data.items.hazy.id,
            displayName: 'Hazy Sequence',
            internalName: 'hazy-sequence',
            breweryId: data.breweries.zymos.id,
            breweryName: 'Zymos Brewing',
            style: 'NEIPA',
            abv: 6.5,
            description: 'Juicy',
            category: 'beer',
          },
          pours: [
            { containerId: data.containers.taster.id, displayName: 'Taster', order: 1, price: 3 },
            { containerId: data.containers.fullPour.id, displayName: 'Full Pour', order: 2, price: 8 },
          ],
        },
        expect.objectContaining({ menuItemId: data.menuItems.pilsOnDrafts.id, order: 2 }),
      ],
    });
  });

  it('shows items with no brewery', async () => {
    await provider.addMenuItem({ id: null, menuId: data.menu.id, itemId: data.items.pretzel.id, subMenuId: data.sections.empty.id, itemLogo: null, order: 1 });
    const res = await request(app).get(`/api/sections/${data.sections.empty.id}`);
    expect(res.body.items[0].item).toMatchObject({ displayName: 'Pretzel', breweryId: null, breweryName: null });
    expect(res.body.items[0].pours).toEqual([]);
  });

  it('404s for an unknown section', async () => {
    const res = await request(app).get('/api/sections/nope');
    expect(res.status).toBe(404);
    expect(res.text).toBe('Section not found');
  });

  it('renames a section', async () => {
    const res = await request(app).patch(`/api/sections/${data.sections.drafts.id}`).send({ displayName: 'On Draft' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: 'On Draft', internalName: 'on-tap-drafts', order: 1, menuId: data.menu.id });
  });

  it('deletes a section along with its placements and prices, but keeps the items', async () => {
    const res = await request(app).delete(`/api/sections/${data.sections.drafts.id}`);
    expect(res.status).toBe(204);
    expect(await provider.getSubMenu(data.sections.drafts.id!)).toBeNull();
    expect(await provider.getMenuItem(data.menuItems.hazyOnDrafts.id!)).toBeNull();
    expect(await provider.getSaleContainersForMenuItem(data.menuItems.hazyOnDrafts.id!)).toEqual([]);
    expect(await provider.getItem(data.items.hazy.id!)).not.toBeNull();
    // Other sections are untouched
    expect(await provider.getMenuItem(data.menuItems.sourOnGuest.id!)).not.toBeNull();
  });

  it('404s when deleting an unknown section', async () => {
    expect((await request(app).delete('/api/sections/nope')).status).toBe(404);
  });
});

describe('adding items to a section', () => {
  it('places an existing item at the end, copying its prices from another placement', async () => {
    const res = await request(app).post(`/api/sections/${data.sections.guestTaps.id}/items`).send({ itemId: data.items.hazy.id });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ menuItemId: expect.any(String), itemId: data.items.hazy.id });

    const placed = await provider.getMenuItem(res.body.menuItemId);
    expect(placed).toMatchObject({ menuId: data.menu.id, subMenuId: data.sections.guestTaps.id, order: 2 });
    const pours = await provider.getSaleContainersForMenuItem(res.body.menuItemId);
    expect(pours.map((p) => `${p.containerId}=${p.price}`).sort()).toEqual(
      [`${data.containers.fullPour.id}=8`, `${data.containers.taster.id}=3`].sort(),
    );
  });

  it("copies prices from the item's most recent placement", async () => {
    // Hazy is on Drafts with Taster $3 / Full Pour $8. Put it on another menu with new prices.
    const patio = await provider.addMenu({ id: null, internalName: 'patio', displayName: 'Patio', logo: null });
    const patioDrafts = await provider.addSubMenu({ id: null, internalName: 'p', displayName: 'Patio Drafts', menuId: patio.id, order: 1 });
    const later = await provider.addMenuItem({ id: null, menuId: patio.id, itemId: data.items.hazy.id, subMenuId: patioDrafts.id, itemLogo: null, order: 1 });
    await provider.addSaleContainer({ id: null, containerId: data.containers.crowler.id!, menuItemId: later.id!, price: 14 });

    const res = await request(app).post(`/api/sections/${data.sections.guestTaps.id}/items`).send({ itemId: data.items.hazy.id });
    const pours = await provider.getSaleContainersForMenuItem(res.body.menuItemId);
    expect(pours.map((p) => [p.containerId, p.price])).toEqual([[data.containers.crowler.id, 14]]);
  });

  it('places an item that is on no menu yet with no prices', async () => {
    const res = await request(app).post(`/api/sections/${data.sections.empty.id}/items`).send({ itemId: data.items.pretzel.id });
    expect(res.status).toBe(201);
    expect(await provider.getSaleContainersForMenuItem(res.body.menuItemId)).toEqual([]);
    expect((await provider.getMenuItem(res.body.menuItemId))?.order).toBe(1);
  });

  it('404s for an unknown existing item or section', async () => {
    expect((await request(app).post(`/api/sections/${data.sections.drafts.id}/items`).send({ itemId: 'nope' })).status).toBe(404);
    expect((await request(app).post('/api/sections/nope/items').send({ itemId: data.items.hazy.id })).status).toBe(404);
  });

  it('creates a brand new item with prices in one step', async () => {
    const res = await request(app)
      .post(`/api/sections/${data.sections.drafts.id}/items`)
      .send({
        item: { displayName: 'Dark Lager', breweryId: data.breweries.zymos.id, style: 'Schwarzbier', abv: '5.1', description: '  Roasty  ' },
        pours: [{ containerId: data.containers.fullPour.id, price: 7.255 }, { containerId: data.containers.taster.id, price: '2.5' }],
      });
    expect(res.status).toBe(201);

    const item = await provider.getItem(res.body.itemId);
    expect(item).toMatchObject({
      displayName: 'Dark Lager',
      internalName: 'dark-lager',
      breweryId: data.breweries.zymos.id,
      style: 'Schwarzbier',
      abv: 5.1,
      description: 'Roasty',
      category: null,
    });
    expect((await provider.getMenuItem(res.body.menuItemId))?.order).toBe(3);
    const pours = await provider.getSaleContainersForMenuItem(res.body.menuItemId);
    // Prices are rounded to cents
    expect(pours.map((p) => p.price).sort()).toEqual([2.5, 7.26]);
  });

  it.each([
    ['no item or itemId', {}, 400, 'Either itemId or item must be provided'],
    ['a nameless item', { item: {} }, 422, 'displayName is required'],
    ['an ABV over 100', { item: { displayName: 'x', abv: 101 } }, 400, 'abv must be between 0 and 100'],
    ['a negative ABV', { item: { displayName: 'x', abv: -1 } }, 400, 'abv must be between 0 and 100'],
    ['a non-numeric ABV', { item: { displayName: 'x', abv: 'strong' } }, 400, 'abv must be a number'],
    ['an unknown brewery', { item: { displayName: 'x', breweryId: 'nope' } }, 404, 'Brewery not found'],
    ['pours that are not a list', { item: { displayName: 'x' }, pours: {} }, 400, 'pours must be a list'],
    ['a pour with no container', { item: { displayName: 'x' }, pours: [{ price: 1 }] }, 400, 'Each pour needs a containerId'],
    ['a pour with no price', { item: { displayName: 'x' }, pours: [{ containerId: 'c' }] }, 400, 'Each pour needs a price of 0 or more'],
    ['a negative price', { item: { displayName: 'x' }, pours: [{ containerId: 'c', price: -1 }] }, 400, 'Each pour needs a price of 0 or more'],
    ['an unknown pour size', { item: { displayName: 'x' }, pours: [{ containerId: 'nope', price: 1 }] }, 404, 'Pour size not found'],
  ])('rejects %s without saving anything', async (_label, body, status, message) => {
    const itemsBefore = (await provider.getItems()).length;
    const placementsBefore = (await provider.getMenuItemsForSubMenu(data.sections.drafts.id!)).length;
    const res = await request(app).post(`/api/sections/${data.sections.drafts.id}/items`).send(body);
    expect(res.status).toBe(status);
    expect(res.text).toBe(message);
    expect((await provider.getItems()).length).toBe(itemsBefore);
    expect((await provider.getMenuItemsForSubMenu(data.sections.drafts.id!)).length).toBe(placementsBefore);
  });

  it('rejects the same pour size twice', async () => {
    const pour = { containerId: data.containers.taster.id, price: 1 };
    const res = await request(app).post(`/api/sections/${data.sections.drafts.id}/items`).send({ item: { displayName: 'x' }, pours: [pour, pour] });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Each pour size can only be listed once');
  });

  it('allows free pours (price 0)', async () => {
    const res = await request(app)
      .post(`/api/sections/${data.sections.drafts.id}/items`)
      .send({ item: { displayName: 'Water' }, pours: [{ containerId: data.containers.taster.id, price: 0 }] });
    expect(res.status).toBe(201);
    expect((await provider.getSaleContainersForMenuItem(res.body.menuItemId))[0].price).toBe(0);
  });

  it('reorders the items in a section', async () => {
    const { hazyOnDrafts, pilsOnDrafts } = data.menuItems;
    const res = await request(app)
      .put(`/api/sections/${data.sections.drafts.id}/items/order`)
      .send({ menuItemIds: [pilsOnDrafts.id, hazyOnDrafts.id] });
    expect(res.status).toBe(204);
    expect((await provider.getMenuItem(pilsOnDrafts.id!))?.order).toBe(1);
    expect((await provider.getMenuItem(hazyOnDrafts.id!))?.order).toBe(2);
  });

  it('rejects an item order that leaves an item out', async () => {
    const res = await request(app)
      .put(`/api/sections/${data.sections.drafts.id}/items/order`)
      .send({ menuItemIds: [data.menuItems.pilsOnDrafts.id] });
    expect(res.status).toBe(400);
    expect(res.text).toBe('menuItemIds must list every item in this section exactly once');
  });
});

describe('menu items', () => {
  it('shows a placement with its item, prices and where else the item appears', async () => {
    const other = await provider.addMenu({ id: null, internalName: 'patio', displayName: 'Patio', logo: null });
    const patioSection = await provider.addSubMenu({ id: null, internalName: 'p', displayName: 'Patio Drafts', menuId: other.id, order: 1 });
    await provider.addMenuItem({ id: null, menuId: other.id, itemId: data.items.hazy.id, subMenuId: patioSection.id, itemLogo: null, order: 1 });

    const res = await request(app).get(`/api/menu-items/${data.menuItems.hazyOnDrafts.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      menuItemId: data.menuItems.hazyOnDrafts.id,
      section: { id: data.sections.drafts.id, displayName: 'Drafts' },
      menu: { id: data.menu.id, displayName: 'Currently On Tap' },
      item: { displayName: 'Hazy Sequence', breweryName: 'Zymos Brewing' },
      pours: [{ displayName: 'Taster', price: 3 }, { displayName: 'Full Pour', price: 8 }],
      otherPlacementCount: 1,
    });
  });

  it('404s for an unknown placement', async () => {
    expect((await request(app).get('/api/menu-items/nope')).status).toBe(404);
    expect((await request(app).put('/api/menu-items/nope').send({})).status).toBe(404);
    expect((await request(app).delete('/api/menu-items/nope')).status).toBe(404);
  });

  it("saves an item's details and this placement's prices together", async () => {
    const res = await request(app)
      .put(`/api/menu-items/${data.menuItems.hazyOnDrafts.id}`)
      .send({
        item: { displayName: 'Hazy Sequence v2', breweryId: null, style: '', abv: 0 },
        pours: [{ containerId: data.containers.crowler.id, price: 15 }],
      });
    expect(res.status).toBe(204);

    const item = await provider.getItem(data.items.hazy.id!);
    // Fields can be cleared or set to falsy values; category (not edited in the client) is kept
    expect(item).toMatchObject({
      displayName: 'Hazy Sequence v2',
      internalName: 'hazy-sequence-v2',
      breweryId: null,
      style: null,
      abv: 0,
      description: null,
      category: 'beer',
    });
    const pours = await provider.getSaleContainersForMenuItem(data.menuItems.hazyOnDrafts.id!);
    expect(pours.map((p) => [p.containerId, p.price])).toEqual([[data.containers.crowler.id, 15]]);
  });

  it('leaves prices alone when no pours are sent', async () => {
    await request(app).put(`/api/menu-items/${data.menuItems.hazyOnDrafts.id}`).send({ item: { displayName: 'Renamed' } });
    expect(await provider.getSaleContainersForMenuItem(data.menuItems.hazyOnDrafts.id!)).toHaveLength(2);
  });

  it('can update just the prices', async () => {
    const res = await request(app).put(`/api/menu-items/${data.menuItems.hazyOnDrafts.id}`).send({ pours: [] });
    expect(res.status).toBe(204);
    expect(await provider.getSaleContainersForMenuItem(data.menuItems.hazyOnDrafts.id!)).toEqual([]);
    expect((await provider.getItem(data.items.hazy.id!))?.displayName).toBe('Hazy Sequence');
  });

  it("doesn't change anything when a pour size is unknown", async () => {
    const res = await request(app)
      .put(`/api/menu-items/${data.menuItems.hazyOnDrafts.id}`)
      .send({ item: { displayName: 'Should not save' }, pours: [{ containerId: 'nope', price: 1 }] });
    expect(res.status).toBe(404);
    expect((await provider.getItem(data.items.hazy.id!))?.displayName).toBe('Hazy Sequence');
    expect(await provider.getSaleContainersForMenuItem(data.menuItems.hazyOnDrafts.id!)).toHaveLength(2);
  });

  it('takes an item off a section, keeping the item in the library', async () => {
    const res = await request(app).delete(`/api/menu-items/${data.menuItems.hazyOnDrafts.id}`);
    expect(res.status).toBe(204);
    expect(await provider.getMenuItem(data.menuItems.hazyOnDrafts.id!)).toBeNull();
    expect(await provider.getSaleContainersForMenuItem(data.menuItems.hazyOnDrafts.id!)).toEqual([]);
    expect(await provider.getItem(data.items.hazy.id!)).not.toBeNull();
  });
});

describe('library', () => {
  it('lists items alphabetically with brewery names', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(200);
    expect(res.body.map((i: { displayName: string }) => i.displayName)).toEqual(['Guest Sour', 'Hazy Sequence', 'Pils', 'Pretzel']);
    expect(res.body[1]).toEqual({
      id: data.items.hazy.id,
      displayName: 'Hazy Sequence',
      internalName: 'hazy-sequence',
      breweryId: data.breweries.zymos.id,
      breweryName: 'Zymos Brewing',
      style: 'NEIPA',
      abv: 6.5,
    });
    expect(res.body[3].breweryName).toBeNull();
  });

  it('lists pour sizes in menu order, unordered ones last', async () => {
    await provider.addContainer(new ItemContainer(null, 'Snifter', 'Snifter', 0.5));
    const res = await request(app).get('/api/containers');
    expect(res.body.map((c: { displayName: string }) => c.displayName)).toEqual(['Snifter', 'Taster', 'Full Pour', 'Crowler']);
    expect(res.body[1]).toEqual({ id: data.containers.taster.id, displayName: 'Taster', containerName: 'Taster glass', order: 1, priceCount: 1 });
    expect(res.body[2].priceCount).toBe(2);
  });
});

describe('library items', () => {
  it('adds an item to the library without placing it on a menu', async () => {
    const res = await request(app)
      .post('/api/items')
      .send({ displayName: ' Cold IPA ', breweryId: data.breweries.zymos.id, style: 'IPA', abv: '6.8', description: '' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      displayName: 'Cold IPA',
      internalName: 'cold-ipa',
      breweryId: data.breweries.zymos.id,
      breweryName: 'Zymos Brewing',
      style: 'IPA',
      abv: 6.8,
      description: null,
      category: null,
    });
    expect(await provider.getMenuItemsForItem(res.body.id)).toEqual([]);
    expect((await request(app).get('/api/items')).body).toHaveLength(5);
  });

  it('validates a new item', async () => {
    expect((await request(app).post('/api/items').send({ style: 'IPA' })).status).toBe(422);
    expect((await request(app).post('/api/items').send({ displayName: 'x', abv: 120 })).status).toBe(400);
    expect((await request(app).post('/api/items').send({ displayName: 'x', breweryId: 'nope' })).status).toBe(404);
  });

  it('shows an item with how many menus it is on', async () => {
    const res = await request(app).get(`/api/items/${data.items.hazy.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: data.items.hazy.id, displayName: 'Hazy Sequence', breweryName: 'Zymos Brewing', placementCount: 1 });
    expect(res.body.placements).toEqual([
      { menuItemId: data.menuItems.hazyOnDrafts.id, menuId: data.menu.id, menuName: 'Currently On Tap', sectionId: data.sections.drafts.id, sectionName: 'Drafts' },
    ]);
    const pretzel = (await request(app).get(`/api/items/${data.items.pretzel.id}`)).body;
    expect(pretzel.placementCount).toBe(0);
    expect(pretzel.placements).toEqual([]);
    expect((await request(app).get('/api/items/nope')).status).toBe(404);
  });

  it('saves an item, clearing fields and keeping its category', async () => {
    const res = await request(app)
      .put(`/api/items/${data.items.hazy.id}`)
      .send({ displayName: 'Hazy Sequence v2', internalName: 'hazy-v2', breweryId: null, style: null, abv: 0, description: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayName: 'Hazy Sequence v2', breweryId: null, style: null, abv: 0, description: null });
    const saved = await provider.getItem(data.items.hazy.id!);
    expect(saved).toMatchObject({ displayName: 'Hazy Sequence v2', internalName: 'hazy-v2', abv: 0, category: 'beer' });
  });

  it('404s when saving an unknown item', async () => {
    expect((await request(app).put('/api/items/nope').send({ displayName: 'x' })).status).toBe(404);
  });

  it('deletes an item that is on no menu', async () => {
    const res = await request(app).delete(`/api/items/${data.items.pretzel.id}`);
    expect(res.status).toBe(204);
    expect(await provider.getItem(data.items.pretzel.id!)).toBeNull();
    expect((await request(app).delete(`/api/items/${data.items.pretzel.id}`)).status).toBe(404);
  });

  it('refuses to delete an item that is still on a menu', async () => {
    const res = await request(app).delete(`/api/items/${data.items.hazy.id}`);
    expect(res.status).toBe(409);
    expect(res.text).toBe('This item is still on 1 menu section. Take it off first.');
    expect(await provider.getItem(data.items.hazy.id!)).not.toBeNull();
  });
});

describe('pour sizes', () => {
  it('adds a pour size to the end of the list', async () => {
    const res = await request(app).post('/api/containers').send({ displayName: 'Half Pour', containerName: 'Half pint glass' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), displayName: 'Half Pour', containerName: 'Half pint glass', order: 3, priceCount: 0 });
  });

  it('uses the display name as the container name when none is given', async () => {
    const res = await request(app).post('/api/containers').send({ displayName: 'Growler', containerName: '  ' });
    expect(res.body).toMatchObject({ displayName: 'Growler', containerName: 'Growler' });
  });

  it('requires a display name', async () => {
    expect((await request(app).post('/api/containers').send({ containerName: 'Glass' })).status).toBe(422);
  });

  it('renames a pour size, keeping its place in the order', async () => {
    const res = await request(app).patch(`/api/containers/${data.containers.taster.id}`).send({ displayName: 'Sampler', containerName: 'Sampler glass' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: data.containers.taster.id, displayName: 'Sampler', containerName: 'Sampler glass', order: 1, priceCount: 1 });
    expect((await request(app).patch('/api/containers/nope').send({ displayName: 'x' })).status).toBe(404);
  });

  it('reorders pour sizes', async () => {
    const { crowler, fullPour, taster } = data.containers;
    const res = await request(app).put('/api/containers/order').send({ containerIds: [crowler.id, fullPour.id, taster.id] });
    expect(res.status).toBe(204);
    const list = (await request(app).get('/api/containers')).body;
    expect(list.map((c: { id: string; order: number }) => [c.id, c.order])).toEqual([[crowler.id, 1], [fullPour.id, 2], [taster.id, 3]]);
  });

  it('lists the items priced in a pour size, and where', async () => {
    const res = await request(app).get(`/api/containers/${data.containers.fullPour.id}/uses`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { menuItemId: data.menuItems.hazyOnDrafts.id, menuId: data.menu.id, menuName: 'Currently On Tap', sectionId: data.sections.drafts.id, sectionName: 'Drafts', itemName: 'Hazy Sequence', price: 8 },
      { menuItemId: data.menuItems.pilsOnDrafts.id, menuId: data.menu.id, menuName: 'Currently On Tap', sectionId: data.sections.drafts.id, sectionName: 'Drafts', itemName: 'Pils', price: 6.5 },
    ]);
    expect((await request(app).get('/api/containers/nope/uses')).status).toBe(404);
  });

  it('refuses to delete a pour size that prices still use', async () => {
    const res = await request(app).delete(`/api/containers/${data.containers.fullPour.id}`);
    expect(res.status).toBe(409);
    expect(res.text).toBe('This pour size is still used by 2 prices. Remove it from those items first.');
    expect(await provider.getContainer(data.containers.fullPour.id!)).not.toBeNull();
  });

  it('deletes a pour size once nothing uses it', async () => {
    await request(app).delete(`/api/menu-items/${data.menuItems.sourOnGuest.id}`).expect(204);
    const res = await request(app).delete(`/api/containers/${data.containers.crowler.id}`);
    expect(res.status).toBe(204);
    expect((await request(app).get('/api/containers')).body).toHaveLength(2);
    expect((await request(app).delete(`/api/containers/${data.containers.crowler.id}`)).status).toBe(404);
  });

  it('rejects a reorder that leaves out or repeats a pour size', async () => {
    const { crowler, fullPour, taster } = data.containers;
    expect((await request(app).put('/api/containers/order').send({ containerIds: [crowler.id, fullPour.id] })).status).toBe(400);
    expect((await request(app).put('/api/containers/order').send({ containerIds: [crowler.id, crowler.id, taster.id] })).status).toBe(400);
  });
});

describe('breweries', () => {
  it('lists breweries alphabetically', async () => {
    const res = await request(app).get('/api/breweries');
    expect(res.body).toEqual([
      { id: data.breweries.guestCo.id, name: 'Guest Co', location: null, hasLogo: true },
      { id: data.breweries.zymos.id, name: 'Zymos Brewing', location: 'Littleton, CO', hasLogo: false },
    ]);
  });

  it('creates a brewery', async () => {
    const res = await request(app).post('/api/breweries').send({ name: ' Odell ', location: 'Fort Collins, CO' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: 'Odell', location: 'Fort Collins, CO', hasLogo: false });
  });

  it('requires a name for a new brewery', async () => {
    expect((await request(app).post('/api/breweries').send({ location: 'x' })).status).toBe(422);
  });

  it('shows a brewery with its beers', async () => {
    const res = await request(app).get(`/api/breweries/${data.breweries.zymos.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: data.breweries.zymos.id,
      name: 'Zymos Brewing',
      location: 'Littleton, CO',
      logo: null,
      items: [
        { id: data.items.hazy.id, displayName: 'Hazy Sequence', style: 'NEIPA', abv: 6.5 },
        { id: data.items.pils.id, displayName: 'Pils', style: 'Pilsner', abv: 4.8 },
      ],
    });
  });

  it('404s for an unknown brewery', async () => {
    expect((await request(app).get('/api/breweries/nope')).status).toBe(404);
    expect((await request(app).patch('/api/breweries/nope').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).put('/api/breweries/nope/logo').send({ logo: TINY_PNG })).status).toBe(404);
    expect((await request(app).delete('/api/breweries/nope/logo')).status).toBe(404);
  });

  it('updates name and location, and can clear the location, keeping the logo', async () => {
    const res = await request(app).patch(`/api/breweries/${data.breweries.guestCo.id}`).send({ name: 'Guest Brewing Co', location: '' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Guest Brewing Co', location: null, logo: `data:image/png;base64,${TINY_PNG}` });
  });

  it('requires a name when updating', async () => {
    const res = await request(app).patch(`/api/breweries/${data.breweries.zymos.id}`).send({ location: 'Denver' });
    expect(res.status).toBe(422);
    expect((await provider.getBrewery(data.breweries.zymos.id!))?.location).toBe('Littleton, CO');
  });

  it('sets and removes a brewery logo', async () => {
    const put = await request(app).put(`/api/breweries/${data.breweries.zymos.id}/logo`).send({ logo: TINY_PNG });
    expect(put.status).toBe(200);
    expect(put.body.logo).toBe(`data:image/png;base64,${TINY_PNG}`);
    expect((await provider.getBrewery(data.breweries.zymos.id!))?.defaultLogo).toBe(TINY_PNG);

    const del = await request(app).delete(`/api/breweries/${data.breweries.zymos.id}/logo`);
    expect(del.status).toBe(204);
    const brewery = await provider.getBrewery(data.breweries.zymos.id!);
    expect(brewery).toMatchObject({ name: 'Zymos Brewing', location: 'Littleton, CO', defaultLogo: null });
  });

  it('rejects a GIF brewery logo', async () => {
    const res = await request(app).put(`/api/breweries/${data.breweries.zymos.id}/logo`).send({ logo: GIF_HEADER });
    expect(res.status).toBe(400);
  });
});

describe('errors', () => {
  it('answers unknown API routes with a 404 instead of falling through', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.text).toBe('API route not found');
  });

  it("doesn't leak internal error details", async () => {
    vi.spyOn(provider, 'getMenus').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const res = await request(app).get('/api/menus');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Unexpected error occurred');
  });
});
