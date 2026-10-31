import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProviderError, PrismaDataProvider } from '../../storage/providers';
import { PrismaClient } from '../../generated/prisma/client';
import { Brewery } from '../../models/breweries';
import { ItemContainer, SaleContainer } from '../../models/containers';
import { Item } from '../../models/items';
import { Menu, MenuItem, SubMenu } from '../../models/menus';
import fs from 'fs';
import path from 'path';

// PrismaDataProvider's own logic (validation, "keep the original when a field is empty",
// cascading deletes), checked against a mocked Prisma client. These don't talk to Postgres.

function fakeModel() {
  return {
    create: vi.fn(async ({ data }: { data: object }) => ({ id: 'new-id', ...data })),
    findUnique: vi.fn(async (): Promise<unknown> => null),
    findFirst: vi.fn(async (): Promise<unknown> => null),
    findMany: vi.fn(async (): Promise<unknown[]> => []),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({ id: where.id, ...data })),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    count: vi.fn(async () => 0),
  };
}

function fakePrisma() {
  const client = {
    brewery: fakeModel(),
    itemContainer: fakeModel(),
    saleContainer: fakeModel(),
    item: fakeModel(),
    menu: fakeModel(),
    subMenu: fakeModel(),
    menuItem: fakeModel(),
    user: fakeModel(),
    session: fakeModel(),
    menuDesign: { ...fakeModel(), upsert: vi.fn(async ({ create }: { create: object }) => ({ id: 'd1', updatedAt: new Date(), ...create })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return client;
}

const OWNER = 'owner-1';

let prisma: ReturnType<typeof fakePrisma>;
// Limited to one user, like the one the API works through (the unscoped provider is covered below)
let provider: PrismaDataProvider;

beforeEach(() => {
  prisma = fakePrisma();
  provider = new PrismaDataProvider(prisma as unknown as PrismaClient).forOwner(OWNER) as PrismaDataProvider;
});

async function expectProviderError(promise: Promise<unknown>, statusCode: number, message?: RegExp) {
  const error = await promise.then(
    () => { throw new Error('expected a DataProviderError'); },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DataProviderError);
  expect((error as DataProviderError).statusCode).toBe(statusCode);
  if (message) expect((error as DataProviderError).message).toMatch(message);
}

describe('breweries', () => {
  const original = { id: 'b1', name: 'Zymos', location: 'Littleton', defaultLogo: 'logo' };

  it('creates a brewery', async () => {
    await provider.addBrewery(new Brewery(null, 'Zymos', 'logo', 'Littleton'));
    expect(prisma.brewery.create).toHaveBeenCalledWith({ data: { ownerId: OWNER, name: 'Zymos', defaultLogo: 'logo', location: 'Littleton' } });
  });

  it('replace sets every field exactly, so values can be cleared', async () => {
    prisma.brewery.findFirst.mockResolvedValue(original);
    await provider.replaceBrewery('b1', new Brewery(null, 'Zymos', null, null));
    expect(prisma.brewery.update).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'b1' }, data: { name: 'Zymos', location: null, defaultLogo: null } });
  });

  it('replace requires a name', async () => {
    prisma.brewery.findFirst.mockResolvedValue(original);
    await expectProviderError(provider.replaceBrewery('b1', new Brewery(null, null, null, null)), 422);
  });

  it('replace 404s for an unknown brewery', async () => {
    await expectProviderError(provider.replaceBrewery('nope', new Brewery(null, 'x', null, null)), 404);
  });
});

describe('containers', () => {
  it('update keeps the original names when none are given', async () => {
    prisma.itemContainer.findFirst.mockResolvedValue({ id: 'c1', containerName: 'Pint glass', displayName: 'Full Pour', order: 2 });
    await provider.updateContainer('c1', new ItemContainer(null, null, null, null));
    expect(prisma.itemContainer.update).toHaveBeenCalledWith({
      where: { ownerId: OWNER, id: 'c1' },
      data: { containerName: 'Pint glass', displayName: 'Full Pour', order: 2 },
    });
  });

  it('update changes the order on its own', async () => {
    prisma.itemContainer.findFirst.mockResolvedValue({ id: 'c1', containerName: 'Pint glass', displayName: 'Full Pour', order: 2 });
    await provider.updateContainer('c1', new ItemContainer(null, null, null, 5));
    expect(prisma.itemContainer.update).toHaveBeenCalledWith({
      where: { ownerId: OWNER, id: 'c1' },
      data: { containerName: 'Pint glass', displayName: 'Full Pour', order: 5 },
    });
  });

  it('update 404s for an unknown container', async () => {
    await expectProviderError(provider.updateContainer('nope', new ItemContainer(null, 'x', 'x', 1)), 404);
  });

  it('only counts prices on menu items that still exist as uses', async () => {
    prisma.saleContainer.findMany.mockResolvedValue([
      { id: 'sc1', containerId: 'c1', menuItemId: 'mi1', price: 5 },
      { id: 'sc2', containerId: 'c1', menuItemId: 'gone', price: 5 },
    ]);
    prisma.menuItem.findMany.mockResolvedValue([{ id: 'mi1' }]);
    const uses = await provider.getSaleContainersForContainer('c1');
    expect(uses.map((u) => u.id)).toEqual(['sc1']);
    expect(prisma.saleContainer.findMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, containerId: 'c1' } });
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: { in: ['mi1', 'gone'] } } });
  });

  it('refuses to remove a container that prices still use', async () => {
    prisma.saleContainer.findMany.mockResolvedValue([{ id: 'sc1', containerId: 'c1', menuItemId: 'mi1', price: 5 }]);
    prisma.menuItem.findMany.mockResolvedValue([{ id: 'mi1' }]);
    await expectProviderError(provider.removeContainer('c1'), 409, /still used by 1 price\./);
    expect(prisma.itemContainer.deleteMany).not.toHaveBeenCalled();
    expect(prisma.saleContainer.deleteMany).not.toHaveBeenCalled();
  });

  it('removes an unused container, with any leftover prices, in one transaction', async () => {
    prisma.saleContainer.findMany.mockResolvedValue([{ id: 'sc2', containerId: 'c1', menuItemId: 'gone', price: 5 }]);
    expect(await provider.removeContainer('c1')).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.saleContainer.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, containerId: 'c1' } });
    expect(prisma.itemContainer.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'c1' } });
  });

  it('reports false when removing a container that does not exist', async () => {
    prisma.itemContainer.deleteMany.mockResolvedValue({ count: 0 });
    expect(await provider.removeContainer('nope')).toBe(false);
  });
});

describe('sale containers', () => {
  it('checks the container and menu item exist before adding', async () => {
    await expectProviderError(provider.addSaleContainer(new SaleContainer(null, 'c1', 'mi1', 5)), 404, /Container with ID c1/);

    prisma.itemContainer.findFirst.mockResolvedValue({ id: 'c1' });
    await expectProviderError(provider.addSaleContainer(new SaleContainer(null, 'c1', 'mi1', 5)), 404, /MenuItem with ID mi1/);
    expect(prisma.saleContainer.create).not.toHaveBeenCalled();

    prisma.menuItem.findFirst.mockResolvedValue({ id: 'mi1' });
    await provider.addSaleContainer(new SaleContainer(null, 'c1', 'mi1', 5));
    expect(prisma.saleContainer.create).toHaveBeenCalledWith({ data: { ownerId: OWNER, containerId: 'c1', menuItemId: 'mi1', price: 5 } });
  });

  it('finds and removes sale containers', async () => {
    await provider.getSaleContainersForMenuItem('mi1');
    expect(prisma.saleContainer.findMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, menuItemId: 'mi1' } });
    expect(await provider.removeSaleContainer('s1')).toBe(true);
    expect(prisma.saleContainer.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 's1' } });
  });

  it('reports false, rather than throwing, when removing one that does not exist', async () => {
    prisma.saleContainer.deleteMany.mockResolvedValue({ count: 0 });
    expect(await provider.removeSaleContainer('nope')).toBe(false);
  });
});

describe('items', () => {
  const original = { id: 'i1', internalName: 'pils', displayName: 'Pils', breweryId: 'b1', style: 'Pilsner', abv: 4.8, description: 'Crisp', category: 'beer' };

  it('checks the brewery exists when adding an item', async () => {
    await expectProviderError(provider.addItem(new Item(null, 'x', 'X', 'nope', null, null, null, null)), 404, /Brewery with ID nope/);
    expect(prisma.item.create).not.toHaveBeenCalled();
  });

  it('adds an item with no brewery without looking one up', async () => {
    await provider.addItem(new Item(null, 'pretzel', 'Pretzel', null, null, null, 'Salty', 'snacks'));
    expect(prisma.brewery.findFirst).not.toHaveBeenCalled();
    expect(prisma.item.create).toHaveBeenCalledWith({
      data: { ownerId: OWNER, internalName: 'pretzel', displayName: 'Pretzel', breweryId: null, style: null, abv: null, description: 'Salty', category: 'snacks' },
    });
  });

  it('lists items alphabetically', async () => {
    await provider.getItems();
    expect(prisma.item.findMany).toHaveBeenCalledWith({ where: { ownerId: OWNER }, orderBy: [{ displayName: 'asc' }] });
  });

  it('replace sets every field exactly, including falsy ones', async () => {
    prisma.item.findFirst.mockResolvedValue(original);
    await provider.replaceItem('i1', new Item(null, 'pils', 'Pils', null, null, 0, null, 'beer'));
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { ownerId: OWNER, id: 'i1' },
      data: { internalName: 'pils', displayName: 'Pils', breweryId: null, style: null, abv: 0, description: null, category: 'beer' },
    });
  });

  it('replace requires both names', async () => {
    prisma.item.findFirst.mockResolvedValue(original);
    await expectProviderError(provider.replaceItem('i1', new Item(null, 'pils', null, null, null, null, null, null)), 422);
    await expectProviderError(provider.replaceItem('i1', new Item(null, null, 'Pils', null, null, null, null, null)), 422);
  });

  it('replace 404s for an unknown item', async () => {
    await expectProviderError(provider.replaceItem('nope', new Item(null, 'x', 'x', null, null, null, null, null)), 404);
  });
});

describe('removing items', () => {
  it('refuses to remove an item that is still on a menu', async () => {
    prisma.menuItem.count.mockResolvedValue(2);
    await expectProviderError(provider.removeItem('i1'), 409, /still on 2 menu sections/);
    expect(prisma.menuItem.count).toHaveBeenCalledWith({ where: { ownerId: OWNER, itemId: 'i1' } });
    expect(prisma.item.deleteMany).not.toHaveBeenCalled();
  });

  it('removes an item that is on no menu, in a transaction', async () => {
    expect(await provider.removeItem('i1')).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.item.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'i1' } });
  });

  it('reports false when removing an item that does not exist', async () => {
    prisma.item.deleteMany.mockResolvedValue({ count: 0 });
    expect(await provider.removeItem('nope')).toBe(false);
  });
});

describe('menus', () => {
  const original = { id: 'm1', internalName: 'on-tap', displayName: 'On Tap', logo: 'logo' };

  it('update keeps the logo unless a new one is given', async () => {
    prisma.menu.findFirst.mockResolvedValue(original);
    await provider.updateMenu('m1', new Menu(null, null, 'Now Pouring', null));
    expect(prisma.menu.update).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'm1' }, data: { internalName: 'on-tap', displayName: 'Now Pouring', logo: 'logo' } });
  });

  it('replace can remove the logo', async () => {
    prisma.menu.findFirst.mockResolvedValue(original);
    await provider.replaceMenu('m1', new Menu(null, 'on-tap', 'On Tap', null));
    expect(prisma.menu.update).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'm1' }, data: { internalName: 'on-tap', displayName: 'On Tap', logo: null, defaultBreweryId: null } });
  });

  it('replace sets, and can clear, the default brewery', async () => {
    prisma.menu.findFirst.mockResolvedValue({ ...original, defaultBreweryId: 'b1' });
    prisma.brewery.findFirst.mockResolvedValue({ id: 'b2' });
    await provider.replaceMenu('m1', new Menu(null, 'on-tap', 'On Tap', 'logo', 'b2'));
    expect(prisma.menu.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 'm1' }, data: { internalName: 'on-tap', displayName: 'On Tap', logo: 'logo', defaultBreweryId: 'b2' } });
    await provider.replaceMenu('m1', new Menu(null, 'on-tap', 'On Tap', 'logo', null));
    expect(prisma.menu.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 'm1' }, data: { internalName: 'on-tap', displayName: 'On Tap', logo: 'logo', defaultBreweryId: null } });
  });

  it('update keeps the default brewery unless a new one is given', async () => {
    prisma.menu.findFirst.mockResolvedValue({ ...original, defaultBreweryId: 'b1' });
    await provider.updateMenu('m1', new Menu(null, null, 'Now Pouring', null));
    expect(prisma.menu.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 'm1' }, data: expect.objectContaining({ defaultBreweryId: 'b1' }) });
  });

  it('checks the default brewery exists (for this owner) when adding, updating or replacing', async () => {
    prisma.menu.findFirst.mockResolvedValue(original);
    await expectProviderError(provider.addMenu(new Menu(null, 'a', 'A', null, 'nope')), 404, /Brewery with ID nope/);
    await expectProviderError(provider.updateMenu('m1', new Menu(null, null, null, null, 'nope')), 404, /Brewery with ID nope/);
    await expectProviderError(provider.replaceMenu('m1', new Menu(null, 'a', 'A', null, 'nope')), 404, /Brewery with ID nope/);
    expect(prisma.menu.create).not.toHaveBeenCalled();
    expect(prisma.menu.update).not.toHaveBeenCalled();
  });

  it('replace validates names and existence', async () => {
    await expectProviderError(provider.replaceMenu('nope', new Menu(null, 'a', 'b', null)), 404);
    prisma.menu.findFirst.mockResolvedValue(original);
    await expectProviderError(provider.replaceMenu('m1', new Menu(null, null, 'b', null)), 422);
  });

  it('update 404s for an unknown menu', async () => {
    await expectProviderError(provider.updateMenu('nope', new Menu(null, 'a', 'b', null)), 404);
  });
});

describe('sub-menus', () => {
  it('checks the menu exists when adding', async () => {
    await expectProviderError(provider.addSubMenu(new SubMenu(null, 'drafts', 'Drafts', 'nope', 1)), 404, /Menu with ID nope/);
    prisma.menu.findFirst.mockResolvedValue({ id: 'm1' });
    await provider.addSubMenu(new SubMenu(null, 'drafts', 'Drafts', 'm1', 1));
    expect(prisma.subMenu.create).toHaveBeenCalledWith({ data: { ownerId: OWNER, internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 1, hiddenOn: [] } });
  });

  it('stores the views a section is hidden on, replaces them on update, and keeps them when not given', async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: 'm1' });
    await provider.addSubMenu(new SubMenu(null, 'drafts', 'Drafts', 'm1', 1, ['print']));
    expect(prisma.subMenu.create).toHaveBeenCalledWith({ data: expect.objectContaining({ hiddenOn: ['print'] }) });

    prisma.subMenu.findFirst.mockResolvedValue({ id: 's1', internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 3, hiddenOn: ['print'] });
    await provider.updateSubMenu('s1', new SubMenu(null, null, null, null, null));
    expect(prisma.subMenu.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 's1' }, data: expect.objectContaining({ hiddenOn: ['print'] }) });
    await provider.updateSubMenu('s1', new SubMenu(null, null, null, null, null, ['board', 'widget']));
    expect(prisma.subMenu.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 's1' }, data: expect.objectContaining({ hiddenOn: ['board', 'widget'] }) });
    // An empty list is a real answer: show it everywhere again
    await provider.updateSubMenu('s1', new SubMenu(null, null, null, null, null, []));
    expect(prisma.subMenu.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 's1' }, data: expect.objectContaining({ hiddenOn: [] }) });
  });

  it('update keeps the original for empty fields', async () => {
    prisma.subMenu.findFirst.mockResolvedValue({ id: 's1', internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 3 });
    await provider.updateSubMenu('s1', new SubMenu(null, null, null, null, 1));
    expect(prisma.subMenu.update).toHaveBeenCalledWith({
      where: { ownerId: OWNER, id: 's1' },
      data: { internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 1 },
    });
  });

  it('update 404s for an unknown sub-menu', async () => {
    await expectProviderError(provider.updateSubMenu('nope', new SubMenu(null, 'x', 'x', null, null)), 404);
  });

  it('removing an unknown sub-menu returns false without touching anything', async () => {
    expect(await provider.removeSubMenu('nope')).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('removes a sub-menu, its menu items and their prices in one transaction', async () => {
    prisma.subMenu.findFirst.mockResolvedValue({ id: 's1' });
    prisma.menuItem.findMany.mockResolvedValue([{ id: 'mi1' }, { id: 'mi2' }]);

    expect(await provider.removeSubMenu('s1')).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, subMenuId: 's1' } });
    expect(prisma.saleContainer.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, menuItemId: { in: ['mi1', 'mi2'] } } });
    expect(prisma.menuItem.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, subMenuId: 's1' } });
    expect(prisma.subMenu.delete).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 's1' } });
    // Children go before the parent
    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];
    expect(order(prisma.saleContainer.deleteMany)).toBeLessThan(order(prisma.menuItem.deleteMany));
    expect(order(prisma.menuItem.deleteMany)).toBeLessThan(order(prisma.subMenu.delete));
  });
});

describe('menu items', () => {
  it('checks the menu, item and sub-menu exist', async () => {
    const menuItem = new MenuItem(null, 'm1', 'i1', 's1', null, 1);
    await expectProviderError(provider.addMenuItem(menuItem), 404, /Menu with ID m1/);
    prisma.menu.findFirst.mockResolvedValue({ id: 'm1' });
    await expectProviderError(provider.addMenuItem(menuItem), 404, /Item with ID i1/);
    prisma.item.findFirst.mockResolvedValue({ id: 'i1' });
    await expectProviderError(provider.addMenuItem(menuItem), 404, /Sub Menu with ID s1/);
    prisma.subMenu.findFirst.mockResolvedValue({ id: 's1' });
    await provider.addMenuItem(menuItem);
    expect(prisma.menuItem.create).toHaveBeenCalledWith({ data: { ownerId: OWNER, menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: null, order: 1, active: true } });
  });

  it('update keeps the original for empty fields', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'mi1', menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: 'logo', order: 4 });
    await provider.updateMenuItem('mi1', new MenuItem(null, null, null, null, null, 2));
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { ownerId: OWNER, id: 'mi1' },
      data: { menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: 'logo', order: 2 },
    });
  });

  it('update 404s for an unknown menu item', async () => {
    await expectProviderError(provider.updateMenuItem('nope', new MenuItem(null, null, null, null, null, 1)), 404);
  });

  it('creates menu items inactive only when asked to', async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.item.findFirst.mockResolvedValue({ id: 'i1' });
    prisma.subMenu.findFirst.mockResolvedValue({ id: 's1' });
    await provider.addMenuItem(new MenuItem(null, 'm1', 'i1', 's1', null, 1, false));
    expect(prisma.menuItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ active: false }) });
  });

  it('sets a menu item active or inactive without touching anything else', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'mi1', menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: null, order: 4, active: true });
    await provider.setMenuItemActive('mi1', false);
    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'mi1' }, data: { active: false } });
  });

  it('sets or clears a menu item logo without touching anything else', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 'mi1', menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: null, order: 4, active: true });
    await provider.setMenuItemLogo('mi1', 'abc');
    expect(prisma.menuItem.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 'mi1' }, data: { itemLogo: 'abc' } });
    await provider.setMenuItemLogo('mi1', null);
    expect(prisma.menuItem.update).toHaveBeenLastCalledWith({ where: { ownerId: OWNER, id: 'mi1' }, data: { itemLogo: null } });
  });

  it('setting the logo 404s for an unknown menu item', async () => {
    await expectProviderError(provider.setMenuItemLogo('nope', 'abc'), 404);
  });

  it('setting active 404s for an unknown menu item', async () => {
    await expectProviderError(provider.setMenuItemActive('nope', true), 404);
  });

  it('queries placements by menu, sub-menu and item', async () => {
    await provider.getMenuItemsForMenu('m1');
    await provider.getMenuItemsForSubMenu('s1');
    await provider.getMenuItemsForItem('i1');
    expect(prisma.menuItem.findMany).toHaveBeenNthCalledWith(1, { where: { ownerId: OWNER, menuId: 'm1' } });
    expect(prisma.menuItem.findMany).toHaveBeenNthCalledWith(2, { where: { ownerId: OWNER, subMenuId: 's1' } });
    // An item's placements come oldest first, with the ID breaking ties
    expect(prisma.menuItem.findMany).toHaveBeenNthCalledWith(3, {
      where: { ownerId: OWNER, itemId: 'i1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('removes a menu item', async () => {
    expect(await provider.removeMenuItem('mi1')).toBe(true);
    expect(prisma.menuItem.deleteMany).toHaveBeenCalledWith({ where: { ownerId: OWNER, id: 'mi1' } });
  });

  it('reports false, rather than throwing, when removing a menu item that does not exist', async () => {
    prisma.menuItem.deleteMany.mockResolvedValue({ count: 0 });
    expect(await provider.removeMenuItem('nope')).toBe(false);
  });
});

describe('menu designs', () => {
  const stored = { id: 'd1', menuId: 'm1', view: 'print', version: 1, spec: { version: 1 }, updatedAt: new Date('2026-01-01T00:00:00Z'), ownerId: OWNER };

  it('reads the design for a menu and view, limited to its owner', async () => {
    prisma.menuDesign.findFirst.mockResolvedValue(stored);
    expect(await provider.getMenuDesign('m1', 'print')).toEqual({ id: 'd1', menuId: 'm1', view: 'print', version: 1, spec: { version: 1 }, updatedAt: stored.updatedAt });
    expect(prisma.menuDesign.findFirst).toHaveBeenCalledWith({ where: { menuId: 'm1', view: 'print', ownerId: OWNER } });
  });

  it('has none when nothing is stored', async () => {
    expect(await provider.getMenuDesign('m1', 'print')).toBeNull();
  });

  it('refuses a stored view it does not know, rather than treating text as a view', async () => {
    prisma.menuDesign.findFirst.mockResolvedValue({ ...stored, view: 'poster' });
    await expect(provider.getMenuDesign('m1', 'print')).rejects.toThrow(/unknown view "poster"/);
  });

  it('does not hand back the owner', async () => {
    prisma.menuDesign.findFirst.mockResolvedValue(stored);
    expect(await provider.getMenuDesign('m1', 'print')).not.toHaveProperty('ownerId');
  });

  it('saves a design by creating it or replacing the one for that menu and view', async () => {
    prisma.menu.findFirst.mockResolvedValue({ id: 'm1' });
    const saved = await provider.setMenuDesign('m1', 'print', { version: 1, footer: { show: true } });
    expect(prisma.menuDesign.upsert).toHaveBeenCalledWith({
      where: { menuId_view: { menuId: 'm1', view: 'print' } },
      create: { ownerId: OWNER, menuId: 'm1', view: 'print', version: 1, spec: { version: 1, footer: { show: true } } },
      update: { version: 1, spec: { version: 1, footer: { show: true } } },
    });
    expect(saved).toMatchObject({ menuId: 'm1', view: 'print', spec: { version: 1, footer: { show: true } } });
  });

  it("will not save onto a menu it does not own, so the owner filter on the menu lookup is what stops it", async () => {
    // The lookup is owner-limited and finds nothing
    await expectProviderError(provider.setMenuDesign('someone-elses', 'print', { version: 1 }), 404, /Menu/);
    expect(prisma.menu.findFirst).toHaveBeenCalledWith({ where: { id: 'someone-elses', ownerId: OWNER } });
    expect(prisma.menuDesign.upsert).not.toHaveBeenCalled();
  });

  it('removes a design, limited to its owner, saying whether there was one', async () => {
    expect(await provider.deleteMenuDesign('m1', 'print')).toBe(true);
    expect(prisma.menuDesign.deleteMany).toHaveBeenCalledWith({ where: { menuId: 'm1', view: 'print', ownerId: OWNER } });
    prisma.menuDesign.deleteMany.mockResolvedValueOnce({ count: 0 });
    expect(await provider.deleteMenuDesign('m1', 'print')).toBe(false);
  });

  it('cannot save without an owner', async () => {
    const unscoped = new PrismaDataProvider(prisma as unknown as PrismaClient);
    await expect(unscoped.setMenuDesign('m1', 'print', {})).rejects.toThrow(/forOwner/);
    expect(prisma.menuDesign.upsert).not.toHaveBeenCalled();
  });
});

describe('users and sessions', () => {
  it('creates a user with a normalized email and the defaults', async () => {
    await provider.createUser({ email: '  Brewer@Example.COM ' });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'brewer@example.com', displayName: null, passwordHash: null, role: 'USER', status: 'PENDING' },
    });
  });

  it('passes along the role, status and password hash it is given', async () => {
    await provider.createUser({ email: 'a@b.co', displayName: 'A', passwordHash: 'h', role: 'ADMIN', status: 'ACTIVE' });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'a@b.co', displayName: 'A', passwordHash: 'h', role: 'ADMIN', status: 'ACTIVE' },
    });
  });

  it('turns a duplicate email (Prisma P2002) into a 409', async () => {
    prisma.user.create.mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    await expectProviderError(provider.createUser({ email: 'a@b.co' }), 409, /already exists/);
  });

  it('lets other database errors through untouched', async () => {
    const failure = new Error('connection lost');
    prisma.user.create.mockRejectedValueOnce(failure);
    await expect(provider.createUser({ email: 'a@b.co' })).rejects.toBe(failure);
  });

  it('looks users up by id, and by normalized email', async () => {
    await provider.getUser('u1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
    await provider.getUserByEmail(' A@B.co ');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.co' } });
  });

  it('counts users', async () => {
    prisma.user.count.mockResolvedValueOnce(3);
    expect(await provider.countUsers()).toBe(3);
  });

  it('creates, finds and deletes sessions by id', async () => {
    const expiresAt = new Date();
    await provider.createSession({ id: 'hash', userId: 'u1', createdAt: new Date(), expiresAt });
    expect(prisma.session.create).toHaveBeenCalledWith({ data: { id: 'hash', userId: 'u1', expiresAt } });
    await provider.getSession('hash');
    expect(prisma.session.findUnique).toHaveBeenCalledWith({ where: { id: 'hash' } });
    await provider.deleteSession('hash');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { id: 'hash' } });
  });

  it('deletes all of a user\'s sessions, or all but one', async () => {
    await provider.deleteSessionsForUser('u1');
    expect(prisma.session.deleteMany).toHaveBeenLastCalledWith({ where: { userId: 'u1' } });
    await provider.deleteSessionsForUser('u1', 'keep');
    expect(prisma.session.deleteMany).toHaveBeenLastCalledWith({ where: { userId: 'u1', id: { not: 'keep' } } });
  });

  it('deletes sessions that expired before now and reports how many', async () => {
    const now = new Date();
    prisma.session.deleteMany.mockResolvedValueOnce({ count: 4 });
    expect(await provider.deleteExpiredSessions(now)).toBe(4);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });
});

describe('limited to one user (forOwner)', () => {
  it('looks things up by ID and owner together, so another user\'s row is just not found', async () => {
    expect(await provider.getMenu('m1')).toBeNull();
    expect(prisma.menu.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', ownerId: OWNER } });
    expect(prisma.menu.findUnique).not.toHaveBeenCalled();
  });

  it('lists only its own rows', async () => {
    await provider.getMenus();
    expect(prisma.menu.findMany).toHaveBeenCalledWith({ where: { ownerId: OWNER } });
  });

  it('404s when updating a row it does not own, because the owner filter matched nothing', async () => {
    prisma.menu.update.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }));
    await expectProviderError(provider.updateMenu('someone-elses', new Menu(null, null, 'x', null)), 404);
  });

  it('will not link to a row it does not own', async () => {
    // The brewery lookup is owner-limited and finds nothing
    await expectProviderError(provider.addItem(new Item(null, 'x', 'X', 'someone-elses-brewery', null, null, null, 'beer')), 404, /Brewery/);
    expect(prisma.item.create).not.toHaveBeenCalled();
  });

  it('stamps what it creates with its owner, whatever the model carries', async () => {
    const menu = new Menu(null, 'a', 'A', null) as Menu & { ownerId?: string };
    menu.ownerId = 'someone-else';
    await provider.addMenu(menu);
    expect(prisma.menu.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ownerId: OWNER }) });
  });

  it('can be narrowed to the same user again but not switched to another', () => {
    expect(provider.forOwner(OWNER)).toBe(provider);
    expect(() => provider.forOwner('someone-else')).toThrow(/already limited/);
  });
});

describe('the unscoped provider', () => {
  const unscoped = () => new PrismaDataProvider(prisma as unknown as PrismaClient);

  it('cannot create anything, since everything created needs an owner', async () => {
    await expect(unscoped().addMenu(new Menu(null, 'a', 'A', null))).rejects.toThrow(/forOwner/);
    await expect(unscoped().addBrewery(new Brewery(null, 'Z', null, null))).rejects.toThrow(/forOwner/);
    expect(prisma.menu.create).not.toHaveBeenCalled();
  });

  it('looks things up by ID alone, which is how the public menu is found', async () => {
    await unscoped().getMenu('m1');
    expect(prisma.menu.findFirst).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });
});

describe('users', () => {
  it('lists them oldest first', async () => {
    await provider.getUsers();
    expect(prisma.user.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  });

  it('updates the fields given, normalizing the email', async () => {
    await provider.updateUser('u1', { email: ' A@B.co ', status: 'ACTIVE' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { email: 'a@b.co', status: 'ACTIVE' } });
  });

  it('turns database clashes and misses into 409 and 404', async () => {
    prisma.user.update.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expectProviderError(provider.updateUser('u1', { email: 'a@b.co' }), 409, /already exists/);
    prisma.user.update.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'P2025' }));
    await expectProviderError(provider.updateUser('u1', { status: 'ACTIVE' }), 404);
  });
});

describe('every query on an owned table', () => {
  /*
  A source-level backstop for the tests above: any call on one of the tables that belong to a
  user must say which user (an owner filter, or the owner to stamp a new row with). A query that
  forgets to would quietly work on everyone's data. If this fails, add the owner to the query.
  */
  it('is limited to the owner or stamps it', () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'storage', 'providers.ts'), 'utf8');
    const start = source.indexOf('class PrismaDataProvider');
    const end = source.indexOf('class LocalDataProvider');
    const prismaClass = source.slice(start, end);

    const calls = [...prismaClass.matchAll(/\b(?:prismaClient|tx)\.(brewery|itemContainer|saleContainer|item|menu|subMenu|menuItem|menuDesign)\.(\w+)\(/g)];
    expect(calls.length).toBeGreaterThan(30);

    const unlimited: string[] = [];
    for (const call of calls) {
      let depth = 1;
      let i = call.index! + call[0].length;
      while (depth > 0 && i < prismaClass.length) {
        depth += (prismaClass[i] === '(' ? 1 : 0) - (prismaClass[i] === ')' ? 1 : 0);
        i++;
      }
      const text = prismaClass.slice(call.index!, i);
      if (!/this\.owned\(\)|ownerId/.test(text)) {
        unlimited.push(`${call[1]}.${call[2]} near character ${call.index}`);
      }
    }
    expect(unlimited).toEqual([]);
  });
});
