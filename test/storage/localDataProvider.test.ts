import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataProviderError, LocalDataProvider } from '../../storage/providers';
import { Brewery } from '../../models/breweries';
import { ItemContainer, SaleContainer } from '../../models/containers';
import { Item } from '../../models/items';
import { Menu, MenuItem, SubMenu } from '../../models/menus';
import { memoryProvider } from '../helpers';

// The JSON-file-backed, in-memory provider. The other server tests use it as their data store,
// so its behavior is pinned down here.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('loading from a data folder', () => {
  let folder: string;

  beforeEach(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'toe-data-'));
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  const write = (name: string, entries: object[]) => fs.writeFileSync(path.join(folder, name), JSON.stringify(entries));

  it('starts empty when the folder does not exist', async () => {
    const provider = memoryProvider();
    expect(await provider.getBreweries()).toEqual([]);
    expect(await provider.getMenus()).toEqual([]);
  });

  it('loads every file, keeping IDs and mapping JSON field names onto the models', async () => {
    write('breweries.json', [{ id: 'b1', name: 'Zymos', location: 'Littleton', b64EncodedLogo: 'logo' }]);
    write('items.json', [{ id: 'i1', internalName: 'pils', displayName: 'Pils', breweryId: 'b1', style: 'Pilsner', abv: 4.8, description: null, category: 'beer' }]);
    write('containers.json', [{ id: 'c1', containerName: 'Pint', displayName: 'Full Pour', order: 1 }]);
    write('menus.json', [{ id: 'm1', internalName: 'beer', displayName: 'Beer', logo: null }]);
    write('subMenus.json', [{ id: 's1', internalName: 'drafts', displayName: 'Drafts', menuId: 'm1', order: 1 }]);
    write('menuItems.json', [{ id: 'mi1', menuId: 'm1', itemId: 'i1', subMenuId: 's1', order: 1 }]);
    write('saleContainers.json', [{ id: 'sc1', containerId: 'c1', menuItemId: 'mi1', price: 7 }]);

    const provider = new LocalDataProvider(folder);
    expect(await provider.getBrewery('b1')).toEqual(new Brewery('b1', 'Zymos', 'logo', 'Littleton'));
    expect((await provider.getItem('i1'))?.displayName).toBe('Pils');
    expect((await provider.getContainer('c1'))?.displayName).toBe('Full Pour');
    expect((await provider.getSubMenusForMenu('m1')).map((s) => s.id)).toEqual(['s1']);
    expect((await provider.getMenuItemsForSubMenu('s1')).map((m) => m.id)).toEqual(['mi1']);
    expect(await provider.getSaleContainersForMenuItem('mi1')).toEqual([new SaleContainer('sc1', 'c1', 'mi1', 7)]);
  });

  it('ignores files it does not know and tolerates missing ones', async () => {
    write('breweries.json', [{ id: 'b1', name: 'Zymos' }]);
    write('notes.json', [{ anything: true }]);
    const provider = new LocalDataProvider(folder);
    expect(await provider.getBreweries()).toHaveLength(1);
    expect(await provider.getItems()).toEqual([]);
  });

  it("loads the repo's sample data", async () => {
    const provider = new LocalDataProvider(path.resolve(import.meta.dirname, '../../data'));
    const count = async (list: Promise<unknown[]>) => (await list).length;
    const expected = (file: string) => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../data', file), 'utf-8')).length;
    expect(await count(provider.getBreweries())).toBe(expected('breweries.json'));
    expect(await count(provider.getItems())).toBe(expected('items.json'));
    expect(await count(provider.getContainers())).toBe(expected('containers.json'));
    expect(await count(provider.getMenus())).toBe(expected('menus.json'));
    // Every placement and price points at something real
    for (const menu of await provider.getMenus()) {
      for (const menuItem of await provider.getMenuItemsForMenu(menu.id!)) {
        expect(await provider.getItem(menuItem.itemId!)).not.toBeNull();
        expect(await provider.getSubMenu(menuItem.subMenuId!)).not.toBeNull();
        for (const pour of await provider.getSaleContainersForMenuItem(menuItem.id!)) {
          expect(await provider.getContainer(pour.containerId)).not.toBeNull();
        }
      }
    }
  });
});

describe('adding and reading', () => {
  it('assigns a UUID when no ID is given', async () => {
    const provider = memoryProvider();
    const empty = await provider.addBrewery(new Brewery('', 'A', null, null));
    const nulled = await provider.addBrewery(new Brewery(null, 'B', null, null));
    expect(empty.id).toMatch(UUID);
    expect(nulled.id).toMatch(UUID);
    expect(empty.id).not.toBe(nulled.id);
  });

  it('keeps an explicit ID', async () => {
    const provider = memoryProvider();
    await provider.addMenu(new Menu('m1', 'a', 'A', null));
    expect((await provider.getMenu('m1'))?.displayName).toBe('A');
  });

  it('returns null for unknown IDs', async () => {
    const provider = memoryProvider();
    expect(await provider.getItem('nope')).toBeNull();
    expect(await provider.getMenuItem('nope')).toBeNull();
  });

  it('returns sub-menus for a menu in order, unordered ones last', async () => {
    const provider = memoryProvider();
    await provider.addMenu(new Menu('m1', 'a', 'A', null));
    await provider.addMenu(new Menu('m2', 'b', 'B', null));
    await provider.addSubMenu(new SubMenu('s3', 'x', 'Third', 'm1', null));
    await provider.addSubMenu(new SubMenu('s2', 'x', 'Second', 'm1', 2));
    await provider.addSubMenu(new SubMenu('s1', 'x', 'First', 'm1', 1));
    await provider.addSubMenu(new SubMenu('other', 'x', 'Other menu', 'm2', 1));
    expect((await provider.getSubMenusForMenu('m1')).map((s) => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('finds placements by menu, sub-menu and item', async () => {
    const provider = memoryProvider();
    await provider.addMenuItem(new MenuItem('a', 'm1', 'i1', 's1', null, 1));
    await provider.addMenuItem(new MenuItem('b', 'm1', 'i2', 's2', null, 1));
    await provider.addMenuItem(new MenuItem('c', 'm2', 'i1', 's3', null, 1));
    expect((await provider.getMenuItemsForMenu('m1')).map((m) => m.id)).toEqual(['a', 'b']);
    expect((await provider.getMenuItemsForSubMenu('s2')).map((m) => m.id)).toEqual(['b']);
    expect((await provider.getMenuItemsForItem('i1')).map((m) => m.id)).toEqual(['a', 'c']);
  });

  it("lists an item's placements oldest first, even after one is updated", async () => {
    const provider = memoryProvider();
    await provider.addMenuItem(new MenuItem('z', 'm1', 'i1', 's1', null, 1));
    await provider.addMenuItem(new MenuItem('a', 'm1', 'i1', 's2', null, 1));
    await provider.updateMenuItem('z', new MenuItem(null, null, null, null, null, 5));
    expect((await provider.getMenuItemsForItem('i1')).map((m) => m.id)).toEqual(['z', 'a']);
  });
});

describe('updating', () => {
  it('only overwrites the fields that are given', async () => {
    const provider = memoryProvider();
    await provider.addSubMenu(new SubMenu('s1', 'drafts', 'Drafts', 'm1', 2));
    const updated = await provider.updateSubMenu('s1', new SubMenu(null, null, 'On Draft', null, null));
    expect(updated).toEqual(new SubMenu('s1', 'drafts', 'On Draft', 'm1', 2));
    expect(await provider.getSubMenu('s1')).toEqual(updated);
  });

  it('refuses to change an ID', async () => {
    const provider = memoryProvider();
    await provider.addContainer(new ItemContainer('c1', 'Pint', 'Full Pour', 1));
    const error = await provider.updateContainer('c1', new ItemContainer('c2', null, null, null)).catch((e) => e);
    expect(error).toBeInstanceOf(DataProviderError);
    expect(error.statusCode).toBe(400);
  });

  it('404s for unknown IDs', async () => {
    const provider = memoryProvider();
    const error = await provider.updateMenu('nope', new Menu(null, 'a', 'b', null)).catch((e) => e);
    expect(error.statusCode).toBe(404);
  });

  it('replace sets every field exactly, so values can be cleared', async () => {
    const provider = memoryProvider();
    await provider.addBrewery(new Brewery('b1', 'Zymos', 'logo', 'Littleton'));
    await provider.replaceBrewery('b1', new Brewery(null, 'Zymos', null, null));
    expect(await provider.getBrewery('b1')).toEqual(new Brewery('b1', 'Zymos', null, null));

    await provider.addItem(new Item('i1', 'pils', 'Pils', 'b1', 'Pilsner', 4.8, 'Crisp', 'beer'));
    await provider.replaceItem('i1', new Item(null, 'pils', 'Pils', null, null, 0, null, null));
    expect(await provider.getItem('i1')).toEqual(new Item('i1', 'pils', 'Pils', null, null, 0, null, null));

    await provider.addMenu(new Menu('m1', 'a', 'A', 'logo'));
    await provider.replaceMenu('m1', new Menu(null, 'a', 'A', null));
    expect((await provider.getMenu('m1'))?.logo).toBeNull();
  });

  it('replace 404s for unknown IDs', async () => {
    const provider = memoryProvider();
    for (const attempt of [
      provider.replaceBrewery('nope', new Brewery(null, 'x', null, null)),
      provider.replaceItem('nope', new Item(null, 'x', 'x', null, null, null, null, null)),
      provider.replaceMenu('nope', new Menu(null, 'x', 'x', null)),
    ]) {
      expect((await attempt.catch((e) => e)).statusCode).toBe(404);
    }
  });
});

describe('removing', () => {
  it('reports whether something was removed', async () => {
    const provider = memoryProvider();
    await provider.addSaleContainer(new SaleContainer('sc1', 'c1', 'mi1', 5));
    await provider.addMenuItem(new MenuItem('mi1', 'm1', 'i1', 's1', null, 1));
    expect(await provider.removeSaleContainer('sc1')).toBe(true);
    expect(await provider.removeSaleContainer('sc1')).toBe(false);
    expect(await provider.removeMenuItem('mi1')).toBe(true);
    expect(await provider.removeMenuItem('mi1')).toBe(false);
  });

  it('removes a sub-menu with its placements and their prices, leaving everything else', async () => {
    const provider = memoryProvider();
    await provider.addSubMenu(new SubMenu('s1', 'a', 'A', 'm1', 1));
    await provider.addSubMenu(new SubMenu('s2', 'b', 'B', 'm1', 2));
    await provider.addMenuItem(new MenuItem('mi1', 'm1', 'i1', 's1', null, 1));
    await provider.addMenuItem(new MenuItem('mi2', 'm1', 'i1', 's2', null, 1));
    await provider.addSaleContainer(new SaleContainer('sc1', 'c1', 'mi1', 5));
    await provider.addSaleContainer(new SaleContainer('sc2', 'c1', 'mi2', 5));

    expect(await provider.removeSubMenu('s1')).toBe(true);
    expect(await provider.getSubMenu('s1')).toBeNull();
    expect(await provider.getMenuItem('mi1')).toBeNull();
    expect(await provider.getSaleContainersForMenuItem('mi1')).toEqual([]);
    expect(await provider.getMenuItem('mi2')).not.toBeNull();
    expect((await provider.getSaleContainersForMenuItem('mi2')).map((p) => p.id)).toEqual(['sc2']);

    expect(await provider.removeSubMenu('s1')).toBe(false);
  });

  it('only removes a container once no live prices use it, clearing leftovers', async () => {
    const provider = memoryProvider();
    await provider.addContainer(new ItemContainer('c1', 'Pint glass', 'Full Pour', 1));
    await provider.addMenuItem(new MenuItem('mi1', 'm1', 'i1', 's1', null, 1));
    await provider.addSaleContainer(new SaleContainer('sc1', 'c1', 'mi1', 5));
    // A price whose menu item is already gone doesn't count as a use
    await provider.addSaleContainer(new SaleContainer('sc2', 'c1', 'gone', 5));
    expect((await provider.getSaleContainersForContainer('c1')).map((u) => u.id)).toEqual(['sc1']);

    const error = await provider.removeContainer('c1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataProviderError);
    expect((error as DataProviderError).statusCode).toBe(409);
    expect(await provider.getContainer('c1')).not.toBeNull();

    await provider.removeMenuItem('mi1');
    expect(await provider.removeContainer('c1')).toBe(true);
    expect(await provider.getContainer('c1')).toBeNull();
    expect(await provider.getSaleContainersForMenuItem('mi1')).toEqual([]);
    expect(await provider.getSaleContainersForMenuItem('gone')).toEqual([]);
    expect(await provider.removeContainer('c1')).toBe(false);
  });

  it('only removes an item once it is off every menu', async () => {
    const provider = memoryProvider();
    await provider.addItem(new Item('i1', 'pils', 'Pils', null, null, null, null, null));
    await provider.addMenuItem(new MenuItem('mi1', 'm1', 'i1', 's1', null, 1));

    const error = await provider.removeItem('i1').catch((e: unknown) => e);
    expect((error as DataProviderError).statusCode).toBe(409);
    expect(await provider.getItem('i1')).not.toBeNull();

    await provider.removeMenuItem('mi1');
    expect(await provider.removeItem('i1')).toBe(true);
    expect(await provider.getItem('i1')).toBeNull();
    expect(await provider.removeItem('i1')).toBe(false);
  });
});
