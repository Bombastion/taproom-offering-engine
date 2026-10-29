import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../app';
import { ApiRoutes } from '../routes/api';
import { LocalDataProvider } from '../storage/providers';
import { User } from '../models/users';
import { addUser, Fixture, memoryProvider, seed, sessionCookieFor, TINY_PNG } from './helpers';

/*
Who can see and change whose data. Two users each have a full menu (the same fixture, so the same
shapes) and the tests try everything one of them can do to the other's data through the API.
The answer is always "that doesn't exist" (404; or 400 for the "list every one of these" endpoints,
which find nothing to list), and nothing of the other user's changes.
*/

let storage: LocalDataProvider;
let app: Express;
let alice: User;
let bob: User;
let aliceCookie: string;
let bobCookie: string;
let a: Fixture;
let b: Fixture;

beforeEach(async () => {
  storage = memoryProvider();
  alice = await addUser(storage, { email: 'alice@example.com' });
  bob = await addUser(storage, { email: 'bob@example.com', role: 'USER' });
  a = await seed(storage.forOwner(alice.id));
  b = await seed(storage.forOwner(bob.id));
  // Alice has a print design saved, so an attempt to replace or remove it would show
  await storage.forOwner(alice.id).setMenuDesign(a.menu.id!, 'print', { version: 1, footer: { show: true, text: 'Alice only' } });
  aliceCookie = await sessionCookieFor(storage, alice);
  bobCookie = await sessionCookieFor(storage, bob);
  app = createApp(storage);
});

const as = (cookie: string) => ({
  get: (url: string) => request(app).get(url).set('Cookie', cookie),
  send: (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, body?: object) => {
    const req = request(app)[method](url).set('Cookie', cookie);
    return body ? req.send(body) : req;
  },
});

// Everything of one user's, as the API's own provider sees it, to compare before and after
async function snapshot(user: User) {
  const data = storage.forOwner(user.id);
  const menus = await data.getMenus();
  return {
    menus,
    breweries: await data.getBreweries(),
    items: await data.getItems(),
    containers: await data.getContainers(),
    sections: (await Promise.all(menus.map((m) => data.getSubMenusForMenu(m.id!)))).flat(),
    menuItems: (await Promise.all(menus.map((m) => data.getMenuItemsForMenu(m.id!)))).flat(),
    designs: await Promise.all(menus.map((m) => data.getMenuDesign(m.id!, 'print'))),
    prices: (await Promise.all((await data.getContainers()).map((c) => data.getSaleContainersForContainer(c.id!)))).flat(),
  };
}

describe('lists', () => {
  it.each(['/api/menus', '/api/items', '/api/breweries', '/api/containers'])('%s only has the signed-in user\'s own entries', async (url) => {
    const [mine, theirs] = [(await as(aliceCookie).get(url)).body, (await as(bobCookie).get(url)).body];
    expect(mine.length).toBeGreaterThan(0);
    expect(theirs.length).toBe(mine.length);
    const ids = (list: Array<{ id: string }>) => list.map((entry) => entry.id);
    expect(ids(mine).filter((id) => ids(theirs).includes(id))).toEqual([]);
  });

  it('are empty for a user who has made nothing', async () => {
    const carol = await sessionCookieFor(storage, await addUser(storage, { email: 'carol@example.com', role: 'USER' }));
    for (const url of ['/api/menus', '/api/items', '/api/breweries', '/api/containers']) {
      expect((await as(carol).get(url)).body).toEqual([]);
    }
  });

  it('show the user their own data in full', async () => {
    const res = await as(aliceCookie).get(`/api/menus/${a.menu.id}`);
    expect(res.status).toBe(200);
    expect(res.body.sections).toHaveLength(3);
  });
});

describe("someone else's data", () => {
  // Bob tries to read or change each of Alice's things, by ID
  const attempts = (): Array<[string, 'get' | 'post' | 'put' | 'patch' | 'delete', string, object | undefined, number]> => [
    ['read a menu', 'get', `/api/menus/${a.menu.id}`, undefined, 404],
    ['rename a menu', 'patch', `/api/menus/${a.menu.id}`, { displayName: 'Hacked' }, 404],
    ['set a menu logo', 'put', `/api/menus/${a.menu.id}/logo`, { logo: TINY_PNG }, 404],
    ['remove a menu logo', 'delete', `/api/menus/${a.menu.id}/logo`, undefined, 404],
    ['add a section to a menu', 'post', `/api/menus/${a.menu.id}/sections`, { displayName: 'Hacked' }, 404],
    ['reorder a menu\'s sections', 'put', `/api/menus/${a.menu.id}/sections/order`, { sectionIds: [a.sections.empty.id, a.sections.guestTaps.id, a.sections.drafts.id] }, 400],
    ['read a section', 'get', `/api/sections/${a.sections.drafts.id}`, undefined, 404],
    ['rename a section', 'patch', `/api/sections/${a.sections.drafts.id}`, { displayName: 'Hacked' }, 404],
    ['delete a section', 'delete', `/api/sections/${a.sections.drafts.id}`, undefined, 404],
    ['put an item in a section', 'post', `/api/sections/${a.sections.drafts.id}/items`, { itemId: b.items.hazy.id, pours: [] }, 404],
    ['reorder a section\'s items', 'put', `/api/sections/${a.sections.drafts.id}/items/order`, { menuItemIds: [a.menuItems.pilsOnDrafts.id, a.menuItems.hazyOnDrafts.id] }, 400],
    ['read a menu item', 'get', `/api/menu-items/${a.menuItems.hazyOnDrafts.id}`, undefined, 404],
    ['change a menu item', 'put', `/api/menu-items/${a.menuItems.hazyOnDrafts.id}`, { pours: [] }, 404],
    ['turn a menu item off', 'put', `/api/menu-items/${a.menuItems.hazyOnDrafts.id}/active`, { active: false }, 404],
    ['set a menu item logo', 'put', `/api/menu-items/${a.menuItems.hazyOnDrafts.id}/logo`, { logo: TINY_PNG }, 404],
    ['remove a menu item logo', 'delete', `/api/menu-items/${a.menuItems.hazyOnDrafts.id}/logo`, undefined, 404],
    ['remove a menu item', 'delete', `/api/menu-items/${a.menuItems.hazyOnDrafts.id}`, undefined, 404],
    ['read an item', 'get', `/api/items/${a.items.hazy.id}`, undefined, 404],
    ['change an item', 'put', `/api/items/${a.items.hazy.id}`, { displayName: 'Hacked' }, 404],
    ['delete an item', 'delete', `/api/items/${a.items.pretzel.id}`, undefined, 404],
    ['read a brewery', 'get', `/api/breweries/${a.breweries.zymos.id}`, undefined, 404],
    ['change a brewery', 'patch', `/api/breweries/${a.breweries.zymos.id}`, { name: 'Hacked' }, 404],
    ['set a brewery logo', 'put', `/api/breweries/${a.breweries.zymos.id}/logo`, { logo: TINY_PNG }, 404],
    ['remove a brewery logo', 'delete', `/api/breweries/${a.breweries.guestCo.id}/logo`, undefined, 404],
    ['change a pour size', 'patch', `/api/containers/${a.containers.taster.id}`, { displayName: 'Hacked' }, 404],
    ['see where a pour size is used', 'get', `/api/containers/${a.containers.taster.id}/uses`, undefined, 404],
    ['delete a pour size', 'delete', `/api/containers/${a.containers.crowler.id}`, undefined, 404],
    ['read a menu\'s print design', 'get', `/api/menus/${a.menu.id}/design/print`, undefined, 404],
    ['save a print design on a menu', 'put', `/api/menus/${a.menu.id}/design/print`, { design: { footer: { show: true, text: 'Hacked' } } }, 404],
    ['remove a menu\'s print design', 'delete', `/api/menus/${a.menu.id}/design/print`, undefined, 404],
    ['preview a menu with a design', 'post', `/api/menus/${a.menu.id}/design/print/preview`, { design: {} }, 404],
    ['reorder pour sizes', 'put', '/api/containers/order', { containerIds: [a.containers.crowler.id, a.containers.fullPour.id, a.containers.taster.id] }, 400],
  ];

  it('can neither be read nor changed through the API', async () => {
    const before = await snapshot(alice);
    for (const [what, method, url, body, status] of attempts()) {
      const res = await as(bobCookie).send(method, url, body);
      expect(res.status, `${what}: ${method.toUpperCase()} ${url}`).toBe(status);
      // Nothing of Alice's even shows up in the refusal
      expect(res.text, what).not.toContain(a.menu.displayName!);
    }
    expect(await snapshot(alice)).toEqual(before);
  });

  it('can be reached by its owner with the very same requests', async () => {
    // Guards the test above: those requests must be valid ones, refused only for who sent them
    for (const [what, method, url, body] of attempts().filter(([, m]) => m === 'get')) {
      expect((await as(aliceCookie).send(method, url, body)).status, what).toBe(200);
    }
  });

  it('cannot be linked to from your own data', async () => {
    const before = await snapshot(alice);
    const mine = await snapshot(bob);
    const attempts: Array<[string, 'post' | 'put' | 'patch', string, object]> = [
      ['an item at their brewery', 'post', '/api/items', { displayName: 'Mine', breweryId: a.breweries.zymos.id }],
      ['an item moved to their brewery', 'put', `/api/items/${b.items.hazy.id}`, { displayName: 'Hazy', breweryId: a.breweries.zymos.id }],
      ['their item on my menu', 'post', `/api/sections/${b.sections.drafts.id}/items`, { itemId: a.items.hazy.id, pours: [] }],
      ['a price in their pour size', 'post', `/api/sections/${b.sections.drafts.id}/items`, { item: { displayName: 'Mine' }, pours: [{ containerId: a.containers.taster.id, price: 3 }] }],
      ['their brewery as my menu\'s default brewery', 'patch', `/api/menus/${b.menu.id}`, { defaultBreweryId: a.breweries.zymos.id }],
      ['a menu item priced in their pour size', 'put', `/api/menu-items/${b.menuItems.hazyOnDrafts.id}`, { pours: [{ containerId: a.containers.taster.id, price: 3 }] }],
    ];
    for (const [what, method, url, body] of attempts) {
      const res = await as(bobCookie).send(method, url, body);
      expect(res.status, what).toBe(404);
    }
    expect(await snapshot(alice)).toEqual(before);
    expect(await snapshot(bob)).toEqual(mine);
  });

  it('is not changed by a user making their own things', async () => {
    const before = await snapshot(alice);
    expect((await as(bobCookie).send('post', '/api/menus', { displayName: 'Bob Menu' })).status).toBe(201);
    expect((await as(bobCookie).send('post', '/api/items', { displayName: 'Bob Beer' })).status).toBe(201);
    expect((await as(bobCookie).send('post', '/api/breweries', { name: 'Bob Brewing' })).status).toBe(201);
    expect((await as(bobCookie).send('post', '/api/containers', { displayName: 'Bob Glass' })).status).toBe(201);
    expect(await snapshot(alice)).toEqual(before);
    // ...and what Bob made is Bob's alone
    const names = (await as(aliceCookie).get('/api/menus')).body.map((m: { displayName: string }) => m.displayName);
    expect(names).not.toContain('Bob Menu');
  });
});

describe('menu designs', () => {
  it("are not shared: each user's menu is drawn with that user's own design", async () => {
    await storage.forOwner(bob.id).setMenuDesign(b.menu.id!, 'print', { version: 1, footer: { show: true, text: 'Bob only' } });
    const alicePage = await request(app).get(`/menus/${a.menu.id}?format=print`);
    const bobPage = await request(app).get(`/menus/${b.menu.id}?format=print`);
    expect(alicePage.text).toContain('Alice only');
    expect(alicePage.text).not.toContain('Bob only');
    expect(bobPage.text).toContain('Bob only');
    expect(bobPage.text).not.toContain('Alice only');
  });

  it("show a user their own, and not the other user's, through the API", async () => {
    const res = await as(aliceCookie).get(`/api/menus/${a.menu.id}/design/print`);
    expect(res.body.design.footer.text).toBe('Alice only');
    expect((await as(bobCookie).get(`/api/menus/${b.menu.id}/design/print`)).body.isDefault).toBe(true);
  });

  it('cannot be saved on a menu that is not yours, whatever the design says', async () => {
    const res = await as(bobCookie).send('put', `/api/menus/${a.menu.id}/design/print`, { design: { footer: { text: 'Bob was here' } } });
    expect(res.status).toBe(404);
    expect((await storage.forOwner(alice.id).getMenuDesign(a.menu.id!, 'print'))!.spec).toMatchObject({ footer: { text: 'Alice only' } });
  });
});

describe('what a new thing is owned by', () => {
  it('is the user who made it, whatever the request says', async () => {
    const res = await as(bobCookie).send('post', '/api/menus', { displayName: 'Mine', ownerId: alice.id, owner: alice.id });
    expect(res.status).toBe(201);
    expect(await storage.forOwner(bob.id).getMenu(res.body.id)).not.toBeNull();
    expect(await storage.forOwner(alice.id).getMenu(res.body.id)).toBeNull();
  });
});

describe('the public menu', () => {
  it.each(['json', 'widget'])('is still served to anyone by its link (%s)', async (format) => {
    const res = await request(app).get(`/menus/${a.menu.id}?format=${format}`);
    expect(res.status).toBe(200);
    // ...and works the same when someone else is signed in
    expect((await request(app).get(`/menus/${a.menu.id}?format=${format}`).set('Cookie', bobCookie)).status).toBe(200);
  });

  it('shows the owner\'s items and prices, not a mix', async () => {
    const res = await request(app).get(`/menus/${a.menu.id}?format=widget`);
    expect(JSON.stringify(res.body)).toContain('Hazy Sequence');
    expect(res.body.displayName).toBe('Currently On Tap');
  });

  it('cannot be used to read the admin API', async () => {
    expect((await request(app).get(`/api/menus/${a.menu.id}`)).status).toBe(401);
  });
});

describe('what leaves the server', () => {
  /*
  The database rows carry the owner's ID, which the client has no use for. Wrap the in-memory
  provider so every row it returns has an owner ID on it, as the Prisma one does, and check that no
  response includes it. (The responses spell out their fields to keep it that way.)
  */
  const LEAK = 'owner-id-that-must-not-leak';

  function withOwnerOnEveryRow<T extends object>(provider: T): T {
    const mark = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(mark);
      if (value && typeof value === 'object' && !(value instanceof Date)) return { ...value, ownerId: LEAK };
      return value;
    };
    return new Proxy(provider, {
      get(target, property) {
        const member = Reflect.get(target, property, target);
        if (typeof member !== 'function') return member;
        return (...args: unknown[]) => {
          const result = member.apply(target, args);
          if (property === 'forOwner') return withOwnerOnEveryRow(result);
          return result instanceof Promise ? result.then(mark) : result;
        };
      },
    });
  }

  it('does not include owner IDs in any response', async () => {
    const leaky = createApp(withOwnerOnEveryRow(storage));
    const get = (url: string) => request(leaky).get(url).set('Cookie', aliceCookie);

    const urls = [
      '/api/auth/me',
      '/api/menus', `/api/menus/${a.menu.id}`,
      `/api/sections/${a.sections.drafts.id}`, `/api/sections/${a.sections.empty.id}`,
      `/api/menu-items/${a.menuItems.hazyOnDrafts.id}`,
      '/api/items', `/api/items/${a.items.hazy.id}`,
      '/api/breweries', `/api/breweries/${a.breweries.zymos.id}`,
      '/api/containers', `/api/containers/${a.containers.taster.id}/uses`,
      `/api/menus/${a.menu.id}/design/print`, '/api/design/fonts', '/api/design/presets',
    ];
    const responses = [
      ...(await Promise.all(urls.map(get))),
      ...(await Promise.all(['json', 'widget'].map((format) => request(leaky).get(`/menus/${a.menu.id}?format=${format}`)))),
      await request(leaky).patch(`/api/sections/${a.sections.drafts.id}`).set('Cookie', aliceCookie).send({ displayName: 'Drafts!' }),
      await request(leaky).patch(`/api/menus/${a.menu.id}`).set('Cookie', aliceCookie).send({ displayName: 'Menu!' }),
      await request(leaky).post('/api/items').set('Cookie', aliceCookie).send({ displayName: 'New' }),
      await request(leaky).post('/api/breweries').set('Cookie', aliceCookie).send({ name: 'New' }),
      await request(leaky).post('/api/containers').set('Cookie', aliceCookie).send({ displayName: 'New' }),
      await request(leaky).put(`/api/menus/${a.menu.id}/design/print`).set('Cookie', aliceCookie).send({ design: {} }),
      await request(leaky).post(`/api/menus/${a.menu.id}/design/print/preview`).set('Cookie', aliceCookie).send({ design: {} }),
    ];
    for (const res of responses) {
      expect(res.status, res.request.url).toBeLessThan(300);
      expect(res.text, res.request.url).not.toContain(LEAK);
      expect(res.text, res.request.url).not.toContain('ownerId');
    }
  });
});

describe('the API routes', () => {
  it('only ever work through the provider limited to the signed-in user', () => {
    // routes/api.ts reaches data through this.data, which is the per-request scoped provider.
    // this.dataProvider is the unscoped one; it may only be used to make the scoped one.
    const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'routes', 'api.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const uses = source.match(/^.*\bdataProvider\b.*$/gm) ?? [];
    expect(uses.map((line) => line.trim())).toEqual(['await this.scoped.run(this.dataProvider.forOwner(req.user.id), () => fn(req, res));']);
  });

  it('refuse to hand out data outside a request', () => {
    expect(() => new ApiRoutes(storage).data).toThrow(/signed-in user/);
  });

  it('turn away a request that somehow has no user, rather than guess one', async () => {
    const express = (await import('express')).default;
    const bare = express();
    bare.use('/api', new ApiRoutes(storage).router);
    expect((await request(bare).get('/api/menus')).status).toBe(401);
  });
});
