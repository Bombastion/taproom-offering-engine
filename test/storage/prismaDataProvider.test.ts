import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProviderError, PrismaDataProvider } from '../../storage/providers';
import { PrismaClient } from '../../generated/prisma/client';
import { Brewery } from '../../models/breweries';
import { ItemContainer, SaleContainer } from '../../models/containers';
import { Item } from '../../models/items';
import { Menu, MenuItem, SubMenu } from '../../models/menus';

// PrismaDataProvider's own logic (validation, "keep the original when a field is empty",
// cascading deletes), checked against a mocked Prisma client. These don't talk to Postgres.

function fakeModel() {
  return {
    create: vi.fn(async ({ data }: { data: object }) => ({ id: 'new-id', ...data })),
    findUnique: vi.fn(async (): Promise<unknown> => null),
    findMany: vi.fn(async (): Promise<unknown[]> => []),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({ id: where.id, ...data })),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
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
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  };
  return client;
}

let prisma: ReturnType<typeof fakePrisma>;
let provider: PrismaDataProvider;

beforeEach(() => {
  prisma = fakePrisma();
  provider = new PrismaDataProvider(prisma as unknown as PrismaClient);
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
    expect(prisma.brewery.create).toHaveBeenCalledWith({ data: { name: 'Zymos', defaultLogo: 'logo', location: 'Littleton' } });
  });

  it('update keeps the original value for any empty field', async () => {
    prisma.brewery.findUnique.mockResolvedValue(original);
    await provider.updateBrewery('b1', new Brewery(null, 'Zymos Brewing', null, ''));
    expect(prisma.brewery.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { name: 'Zymos Brewing', location: 'Littleton', defaultLogo: 'logo' },
    });
  });

  it('update 404s for an unknown brewery', async () => {
    await expectProviderError(provider.updateBrewery('nope', new Brewery(null, 'x', null, null)), 404, /nope/);
    expect(prisma.brewery.update).not.toHaveBeenCalled();
  });

  it('replace sets every field exactly, so values can be cleared', async () => {
    prisma.brewery.findUnique.mockResolvedValue(original);
    await provider.replaceBrewery('b1', new Brewery(null, 'Zymos', null, null));
    expect(prisma.brewery.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { name: 'Zymos', location: null, defaultLogo: null } });
  });

  it('replace requires a name', async () => {
    prisma.brewery.findUnique.mockResolvedValue(original);
    await expectProviderError(provider.replaceBrewery('b1', new Brewery(null, null, null, null)), 422);
  });

  it('replace 404s for an unknown brewery', async () => {
    await expectProviderError(provider.replaceBrewery('nope', new Brewery(null, 'x', null, null)), 404);
  });
});

describe('containers', () => {
  it('update keeps the original names when none are given', async () => {
    prisma.itemContainer.findUnique.mockResolvedValue({ id: 'c1', containerName: 'Pint glass', displayName: 'Full Pour', order: 2 });
    await provider.updateContainer('c1', new ItemContainer(null, null, null, null));
    expect(prisma.itemContainer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { containerName: 'Pint glass', displayName: 'Full Pour', order: 2 },
    });
  });

  it('update changes the order on its own', async () => {
    prisma.itemContainer.findUnique.mockResolvedValue({ id: 'c1', containerName: 'Pint glass', displayName: 'Full Pour', order: 2 });
    await provider.updateContainer('c1', new ItemContainer(null, null, null, 5));
    expect(prisma.itemContainer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { containerName: 'Pint glass', displayName: 'Full Pour', order: 5 },
    });
  });

  it('update 404s for an unknown container', async () => {
    await expectProviderError(provider.updateContainer('nope', new ItemContainer(null, 'x', 'x', 1)), 404);
  });
});

describe('sale containers', () => {
  it('checks the container and menu item exist before adding', async () => {
    await expectProviderError(provider.addSaleContainer(new SaleContainer(null, 'c1', 'mi1', 5)), 404, /Container with ID c1/);

    prisma.itemContainer.findUnique.mockResolvedValue({ id: 'c1' });
    await expectProviderError(provider.addSaleContainer(new SaleContainer(null, 'c1', 'mi1', 5)), 404, /MenuItem with ID mi1/);
    expect(prisma.saleContainer.create).not.toHaveBeenCalled();

    prisma.menuItem.findUnique.mockResolvedValue({ id: 'mi1' });
    await provider.addSaleContainer(new SaleContainer(null, 'c1', 'mi1', 5));
    expect(prisma.saleContainer.create).toHaveBeenCalledWith({ data: { containerId: 'c1', menuItemId: 'mi1', price: 5 } });
  });

  it('finds and removes sale containers', async () => {
    await provider.getSaleContainersForMenuItem('mi1');
    expect(prisma.saleContainer.findMany).toHaveBeenCalledWith({ where: { menuItemId: 'mi1' } });
    expect(await provider.removeSaleContainer('s1')).toBe(true);
    expect(prisma.saleContainer.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
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
    expect(prisma.brewery.findUnique).not.toHaveBeenCalled();
    expect(prisma.item.create).toHaveBeenCalledWith({
      data: { internalName: 'pretzel', displayName: 'Pretzel', breweryId: null, style: null, abv: null, description: 'Salty', category: 'snacks' },
    });
  });

  it('lists items alphabetically', async () => {
    await provider.getItems();
    expect(prisma.item.findMany).toHaveBeenCalledWith({ orderBy: [{ displayName: 'asc' }] });
  });

  it('update keeps the original for empty fields (including an ABV of 0)', async () => {
    prisma.item.findUnique.mockResolvedValue(original);
    await provider.updateItem('i1', new Item(null, null, 'Pils v2', null, '', 0, null, null));
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { ...original, id: undefined, displayName: 'Pils v2' },
    });
  });

  it('replace sets every field exactly, including falsy ones', async () => {
    prisma.item.findUnique.mockResolvedValue(original);
    await provider.replaceItem('i1', new Item(null, 'pils', 'Pils', null, null, 0, null, 'beer'));
    expect(prisma.item.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { internalName: 'pils', displayName: 'Pils', breweryId: null, style: null, abv: 0, description: null, category: 'beer' },
    });
  });

  it('replace requires both names', async () => {
    prisma.item.findUnique.mockResolvedValue(original);
    await expectProviderError(provider.replaceItem('i1', new Item(null, 'pils', null, null, null, null, null, null)), 422);
    await expectProviderError(provider.replaceItem('i1', new Item(null, null, 'Pils', null, null, null, null, null)), 422);
  });

  it('update and replace 404 for an unknown item', async () => {
    await expectProviderError(provider.updateItem('nope', new Item(null, 'x', 'x', null, null, null, null, null)), 404);
    await expectProviderError(provider.replaceItem('nope', new Item(null, 'x', 'x', null, null, null, null, null)), 404);
  });
});

describe('menus', () => {
  const original = { id: 'm1', internalName: 'on-tap', displayName: 'On Tap', logo: 'logo' };

  it('update keeps the logo unless a new one is given', async () => {
    prisma.menu.findUnique.mockResolvedValue(original);
    await provider.updateMenu('m1', new Menu(null, null, 'Now Pouring', null));
    expect(prisma.menu.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { internalName: 'on-tap', displayName: 'Now Pouring', logo: 'logo' } });
  });

  it('replace can remove the logo', async () => {
    prisma.menu.findUnique.mockResolvedValue(original);
    await provider.replaceMenu('m1', new Menu(null, 'on-tap', 'On Tap', null));
    expect(prisma.menu.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { internalName: 'on-tap', displayName: 'On Tap', logo: null } });
  });

  it('replace validates names and existence', async () => {
    await expectProviderError(provider.replaceMenu('nope', new Menu(null, 'a', 'b', null)), 404);
    prisma.menu.findUnique.mockResolvedValue(original);
    await expectProviderError(provider.replaceMenu('m1', new Menu(null, null, 'b', null)), 422);
  });

  it('update 404s for an unknown menu', async () => {
    await expectProviderError(provider.updateMenu('nope', new Menu(null, 'a', 'b', null)), 404);
  });
});

describe('sub-menus', () => {
  it('checks the menu exists when adding', async () => {
    await expectProviderError(provider.addSubMenu(new SubMenu(null, 'drafts', 'Drafts', 'nope', 1)), 404, /Menu with ID nope/);
    prisma.menu.findUnique.mockResolvedValue({ id: 'm1' });
    await provider.addSubMenu(new SubMenu(null, 'drafts', 'Drafts', 'm1', 1));
    expect(prisma.subMenu.create).toHaveBeenCalledWith({ data: { internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 1 } });
  });

  it('update keeps the original for empty fields', async () => {
    prisma.subMenu.findUnique.mockResolvedValue({ id: 's1', internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 3 });
    await provider.updateSubMenu('s1', new SubMenu(null, null, null, null, 1));
    expect(prisma.subMenu.update).toHaveBeenCalledWith({
      where: { id: 's1' },
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
    prisma.subMenu.findUnique.mockResolvedValue({ id: 's1' });
    prisma.menuItem.findMany.mockResolvedValue([{ id: 'mi1' }, { id: 'mi2' }]);

    expect(await provider.removeSubMenu('s1')).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({ where: { subMenuId: 's1' } });
    expect(prisma.saleContainer.deleteMany).toHaveBeenCalledWith({ where: { menuItemId: { in: ['mi1', 'mi2'] } } });
    expect(prisma.menuItem.deleteMany).toHaveBeenCalledWith({ where: { subMenuId: 's1' } });
    expect(prisma.subMenu.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
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
    prisma.menu.findUnique.mockResolvedValue({ id: 'm1' });
    await expectProviderError(provider.addMenuItem(menuItem), 404, /Item with ID i1/);
    prisma.item.findUnique.mockResolvedValue({ id: 'i1' });
    await expectProviderError(provider.addMenuItem(menuItem), 404, /Sub Menu with ID s1/);
    prisma.subMenu.findUnique.mockResolvedValue({ id: 's1' });
    await provider.addMenuItem(menuItem);
    expect(prisma.menuItem.create).toHaveBeenCalledWith({ data: { menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: null, order: 1 } });
  });

  it('update keeps the original for empty fields', async () => {
    prisma.menuItem.findUnique.mockResolvedValue({ id: 'mi1', menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: 'logo', order: 4 });
    await provider.updateMenuItem('mi1', new MenuItem(null, null, null, null, null, 2));
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'mi1' },
      data: { menuId: 'm1', itemId: 'i1', subMenuId: 's1', itemLogo: 'logo', order: 2 },
    });
  });

  it('update 404s for an unknown menu item', async () => {
    await expectProviderError(provider.updateMenuItem('nope', new MenuItem(null, null, null, null, null, 1)), 404);
  });

  it('queries placements by menu, sub-menu and item', async () => {
    await provider.getMenuItemsForMenu('m1');
    await provider.getMenuItemsForSubMenu('s1');
    await provider.getMenuItemsForItem('i1');
    expect(prisma.menuItem.findMany).toHaveBeenNthCalledWith(1, { where: { menuId: 'm1' } });
    expect(prisma.menuItem.findMany).toHaveBeenNthCalledWith(2, { where: { subMenuId: 's1' } });
    // An item's placements come oldest first, with the ID breaking ties
    expect(prisma.menuItem.findMany).toHaveBeenNthCalledWith(3, {
      where: { itemId: 'i1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('removes a menu item', async () => {
    expect(await provider.removeMenuItem('mi1')).toBe(true);
    expect(prisma.menuItem.deleteMany).toHaveBeenCalledWith({ where: { id: 'mi1' } });
  });

  it('reports false, rather than throwing, when removing a menu item that does not exist', async () => {
    prisma.menuItem.deleteMany.mockResolvedValue({ count: 0 });
    expect(await provider.removeMenuItem('nope')).toBe(false);
  });
});
