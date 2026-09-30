import { Request, Response } from 'express';
import Routes from './common';
import { DataProviderError } from '../storage/providers';
import { Menu, MenuItem, SubMenu } from '../models/menus';
import { Item } from '../models/items';
import { Brewery } from '../models/breweries';
import { SaleContainer } from '../models/containers';

/*
JSON API for the admin client app (see /client). Everything under /api requires the admin login
(see middleware/auth.ts), including GETs, since this is the editing surface rather than the
public menu data.

The shapes returned here are tailored to the client's screens (menu list -> menu -> section ->
item editor) so each screen needs a single request, rather than mirroring the database tables
one-to-one like the older routes do.
*/

type Ordered = { order: number | null };

function byOrder<T extends Ordered>(a: T, b: T): number {
  if (a.order === null && b.order === null) return 0;
  if (a.order === null) return 1;
  if (b.order === null) return -1;
  return a.order - b.order;
}

function badRequest(message: string): DataProviderError {
  return new DataProviderError(message, 400);
}

function notFound(what: string): DataProviderError {
  return new DataProviderError(`${what} not found`, 404);
}

// Reads an optional string field from a request body. Empty/whitespace-only strings become null.
function optionalString(body: any, field: string, maxLength = 500): string | null {
  const value = body?.[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw badRequest(`${field} must be at most ${maxLength} characters`);
  return trimmed === '' ? null : trimmed;
}

function requiredString(body: any, field: string, maxLength = 200): string {
  const value = optionalString(body, field, maxLength);
  if (value === null) throw new DataProviderError(`${field} is required`, 422);
  return value;
}

function optionalNumber(body: any, field: string): number | null {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${field} must be a number`);
  return parsed;
}

function idList(body: any, field: string): string[] {
  const value = body?.[field];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw badRequest(`${field} must be a list of IDs`);
  }
  return value;
}

// Turns a display name into a default internal name, e.g. "Hazy Sequence" -> "hazy-sequence".
function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

// ---- Logos ----
// Menus and breweries store their logo as a bare base64 string (no "data:" prefix). The PDF
// menu board renders them with pdfkit, which only understands PNG and JPEG, so uploads are
// limited to those (the admin client converts whatever image is picked to a PNG first).

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

function sniffImageType(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && bytes.subarray(0, 6).toString('ascii').startsWith('GIF8')) return 'image/gif';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// Turns a stored logo into something an <img> can show directly
function logoDataUrl(base64: string | null): string | null {
  if (!base64) return null;
  const head = Buffer.from(base64.slice(0, 32), 'base64');
  return `data:${sniffImageType(head) ?? 'image/png'};base64,${base64}`;
}

// Validates an uploaded logo (base64, optionally as a data: URL) and returns the bare base64
function parseLogo(body: any): string {
  let value = body?.logo;
  if (typeof value !== 'string' || !value) throw badRequest('logo must be a base64-encoded PNG or JPEG image');
  const dataUrl = /^data:[^;,]+;base64,/.exec(value);
  if (dataUrl) value = value.slice(dataUrl[0].length);
  value = value.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw badRequest('logo must be base64-encoded');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_LOGO_BYTES) throw badRequest('That image is too large; logos can be at most 3 MB');
  const type = sniffImageType(bytes);
  if (type !== 'image/png' && type !== 'image/jpeg') throw badRequest('Logos must be PNG or JPEG images');
  return value;
}

type PourInput = { containerId: string; price: number };

function parsePours(body: any): PourInput[] | null {
  const value = body?.pours;
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw badRequest('pours must be a list');
  const seen = new Set<string>();
  return value.map((pour: any) => {
    if (typeof pour?.containerId !== 'string') throw badRequest('Each pour needs a containerId');
    if (seen.has(pour.containerId)) throw badRequest('Each pour size can only be listed once');
    seen.add(pour.containerId);
    const price = optionalNumber(pour, 'price');
    if (price === null || price < 0) throw badRequest('Each pour needs a price of 0 or more');
    return { containerId: pour.containerId, price: Math.round(price * 100) / 100 };
  });
}

export class ApiRoutes extends Routes {
  registerRoutes(): void {
    // Wraps a handler so thrown DataProviderErrors become proper 4xx responses.
    const handle = (fn: (req: Request, res: Response) => Promise<void>) => {
      return async (req: Request, res: Response) => {
        try {
          await fn(req, res);
        } catch (e: any) {
          this.handleError(res, e);
        }
      };
    };

    // Lets the client check a username/password before storing them. Reaching this handler at
    // all means the admin auth middleware accepted the credentials.
    this.router.get('/session', handle(async (_req, res) => {
      res.json({ ok: true });
    }));

    // ---- Menus ----

    this.router.get('/menus', handle(async (_req, res) => {
      const menus = await this.dataProvider.getMenus();
      const result = [];
      for (const menu of menus) {
        const sections = await this.dataProvider.getSubMenusForMenu(menu.id!);
        const menuItems = await this.dataProvider.getMenuItemsForMenu(menu.id!);
        result.push({
          id: menu.id,
          displayName: menu.displayName,
          internalName: menu.internalName,
          sectionCount: sections.length,
          itemCount: menuItems.length,
        });
      }
      result.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
      res.json(result);
    }));

    this.router.post('/menus', handle(async (req, res) => {
      const displayName = requiredString(req.body, 'displayName');
      const internalName = optionalString(req.body, 'internalName') ?? slugify(displayName);
      const menu = await this.dataProvider.addMenu(new Menu(null, internalName, displayName, null));
      res.status(201).json({ id: menu.id, displayName: menu.displayName, internalName: menu.internalName });
    }));

    this.router.get('/menus/:menuId', handle(async (req, res) => {
      const menu = await this.dataProvider.getMenu(req.params.menuId as string);
      if (!menu) throw notFound('Menu');
      const sections = (await this.dataProvider.getSubMenusForMenu(menu.id!)).sort(byOrder);
      const items = new Map<string, Item | null>();
      const sectionResults = [];
      for (const section of sections) {
        const menuItems = (await this.dataProvider.getMenuItemsForSubMenu(section.id!)).sort(byOrder);
        const names: string[] = [];
        for (const menuItem of menuItems) {
          if (!items.has(menuItem.itemId!)) {
            items.set(menuItem.itemId!, await this.dataProvider.getItem(menuItem.itemId!));
          }
          const name = items.get(menuItem.itemId!)?.displayName;
          if (name) names.push(name);
        }
        sectionResults.push({
          id: section.id,
          displayName: section.displayName,
          internalName: section.internalName,
          order: section.order,
          itemCount: menuItems.length,
          itemNames: names,
        });
      }
      res.json({
        id: menu.id,
        displayName: menu.displayName,
        internalName: menu.internalName,
        hasLogo: Boolean(menu.logo),
        logo: logoDataUrl(menu.logo),
        sections: sectionResults,
      });
    }));

    this.router.patch('/menus/:menuId', handle(async (req, res) => {
      const displayName = optionalString(req.body, 'displayName', 200);
      const internalName = optionalString(req.body, 'internalName', 200);
      const menu = await this.dataProvider.updateMenu(req.params.menuId as string, new Menu(null, internalName, displayName, null));
      res.json({ id: menu.id, displayName: menu.displayName, internalName: menu.internalName });
    }));

    // Sets or replaces a menu's logo (shown on the print view, the menu board PDF and the widget)
    this.router.put('/menus/:menuId/logo', handle(async (req, res) => {
      const menu = await this.dataProvider.getMenu(req.params.menuId as string);
      if (!menu) throw notFound('Menu');
      const logo = parseLogo(req.body);
      await this.dataProvider.replaceMenu(menu.id!, new Menu(null, menu.internalName, menu.displayName, logo));
      res.json({ logo: logoDataUrl(logo) });
    }));

    this.router.delete('/menus/:menuId/logo', handle(async (req, res) => {
      const menu = await this.dataProvider.getMenu(req.params.menuId as string);
      if (!menu) throw notFound('Menu');
      await this.dataProvider.replaceMenu(menu.id!, new Menu(null, menu.internalName, menu.displayName, null));
      res.sendStatus(204);
    }));

    // Adds a new section to the end of a menu
    this.router.post('/menus/:menuId/sections', handle(async (req, res) => {
      const menu = await this.dataProvider.getMenu(req.params.menuId as string);
      if (!menu) throw notFound('Menu');
      const displayName = requiredString(req.body, 'displayName');
      const internalName = optionalString(req.body, 'internalName') ?? slugify(`${menu.internalName}-${displayName}`);
      const existing = await this.dataProvider.getSubMenusForMenu(menu.id!);
      const nextOrder = existing.reduce((max, s) => Math.max(max, s.order ?? 0), 0) + 1;
      const section = await this.dataProvider.addSubMenu(new SubMenu(null, internalName, displayName, menu.id, nextOrder));
      res.status(201).json(section);
    }));

    // Reorders a menu's sections to match the given list of section IDs
    this.router.put('/menus/:menuId/sections/order', handle(async (req, res) => {
      const ids = idList(req.body, 'sectionIds');
      const existing = await this.dataProvider.getSubMenusForMenu(req.params.menuId as string);
      const existingIds = new Set(existing.map((s) => s.id));
      if (ids.length !== existing.length || ids.some((id) => !existingIds.has(id))) {
        throw badRequest('sectionIds must list every section of this menu exactly once');
      }
      // Orders start at 1: the data layer treats a falsy order as "unchanged"
      for (let i = 0; i < ids.length; i++) {
        await this.dataProvider.updateSubMenu(ids[i], new SubMenu(null, null, null, null, i + 1));
      }
      res.sendStatus(204);
    }));

    // ---- Sections (sub-menus) ----

    const loadSection = async (sectionId: string) => {
      const section = await this.dataProvider.getSubMenu(sectionId);
      if (!section) throw notFound('Section');
      const menu = await this.dataProvider.getMenu(section.menuId!);
      if (!menu) throw notFound('Menu');
      return { section, menu };
    };

    const describePours = async (menuItemId: string) => {
      const saleContainers = await this.dataProvider.getSaleContainersForMenuItem(menuItemId);
      const pours = [];
      for (const saleContainer of saleContainers) {
        const container = await this.dataProvider.getContainer(saleContainer.containerId);
        pours.push({
          containerId: saleContainer.containerId,
          displayName: container?.displayName ?? 'Pour',
          order: container?.order ?? null,
          price: saleContainer.price,
        });
      }
      return pours.sort(byOrder);
    };

    const describeItem = async (item: Item | null) => {
      if (!item) return null;
      let brewery: Brewery | null = null;
      if (item.breweryId) brewery = await this.dataProvider.getBrewery(item.breweryId);
      return {
        id: item.id,
        displayName: item.displayName,
        internalName: item.internalName,
        breweryId: item.breweryId,
        breweryName: brewery?.name ?? null,
        style: item.style,
        abv: item.abv,
        description: item.description,
        category: item.category,
      };
    };

    this.router.get('/sections/:sectionId', handle(async (req, res) => {
      const { section, menu } = await loadSection(req.params.sectionId as string);
      const menuItems = (await this.dataProvider.getMenuItemsForSubMenu(section.id!)).sort(byOrder);
      const entries = [];
      for (const menuItem of menuItems) {
        entries.push({
          menuItemId: menuItem.id,
          order: menuItem.order,
          item: await describeItem(await this.dataProvider.getItem(menuItem.itemId!)),
          pours: await describePours(menuItem.id!),
        });
      }
      res.json({
        id: section.id,
        displayName: section.displayName,
        internalName: section.internalName,
        menu: { id: menu.id, displayName: menu.displayName },
        items: entries,
      });
    }));

    this.router.patch('/sections/:sectionId', handle(async (req, res) => {
      const displayName = optionalString(req.body, 'displayName', 200);
      const internalName = optionalString(req.body, 'internalName', 200);
      const section = await this.dataProvider.updateSubMenu(req.params.sectionId as string, new SubMenu(null, internalName, displayName, null, null));
      res.json(section);
    }));

    this.router.delete('/sections/:sectionId', handle(async (req, res) => {
      const removed = await this.dataProvider.removeSubMenu(req.params.sectionId as string);
      if (!removed) throw notFound('Section');
      res.sendStatus(204);
    }));

    // Checked up front, before anything is written, so a bad request doesn't half-save
    const validatePours = async (pours: PourInput[] | null) => {
      for (const pour of pours ?? []) {
        if (!(await this.dataProvider.getContainer(pour.containerId))) throw notFound('Pour size');
      }
    };

    const replacePours = async (menuItemId: string, pours: PourInput[]) => {
      for (const existing of await this.dataProvider.getSaleContainersForMenuItem(menuItemId)) {
        await this.dataProvider.removeSaleContainer(existing.id!);
      }
      for (const pour of pours) {
        await this.dataProvider.addSaleContainer(new SaleContainer(null, pour.containerId, menuItemId, pour.price));
      }
    };

    const itemFromBody = async (body: any): Promise<Item> => {
      const displayName = requiredString(body, 'displayName');
      const internalName = optionalString(body, 'internalName', 200) ?? slugify(displayName);
      const breweryId = optionalString(body, 'breweryId', 100);
      if (breweryId && !(await this.dataProvider.getBrewery(breweryId))) throw notFound('Brewery');
      const abv = optionalNumber(body, 'abv');
      if (abv !== null && (abv < 0 || abv > 100)) throw badRequest('abv must be between 0 and 100');
      return new Item(
        null,
        internalName,
        displayName,
        breweryId,
        optionalString(body, 'style', 200),
        abv,
        optionalString(body, 'description', 2000),
        optionalString(body, 'category', 100),
      );
    };

    /*
    Puts an item on a section. The body is either:
      { itemId }             — an existing item from the library. Its prices are copied from
                               the most recent other menu it appears on, if any.
      { item: {...}, pours } — a brand new item, created and placed in one step.
    */
    this.router.post('/sections/:sectionId/items', handle(async (req, res) => {
      const { section } = await loadSection(req.params.sectionId as string);
      const existingItems = await this.dataProvider.getMenuItemsForSubMenu(section.id!);
      const nextOrder = existingItems.reduce((max, m) => Math.max(max, m.order ?? 0), 0) + 1;

      let itemId: string;
      let pours: PourInput[] = [];
      if (typeof req.body?.itemId === 'string') {
        const item = await this.dataProvider.getItem(req.body.itemId);
        if (!item) throw notFound('Item');
        itemId = item.id!;
        const otherPlacements = await this.dataProvider.getMenuItemsForItem(itemId);
        const source = otherPlacements[otherPlacements.length - 1];
        if (source) {
          pours = (await this.dataProvider.getSaleContainersForMenuItem(source.id!)).map((s) => ({ containerId: s.containerId, price: s.price }));
        }
      } else if (req.body?.item) {
        pours = parsePours(req.body) ?? [];
        await validatePours(pours);
        const created = await this.dataProvider.addItem(await itemFromBody(req.body.item));
        itemId = created.id!;
      } else {
        throw badRequest('Either itemId or item must be provided');
      }

      const menuItem = await this.dataProvider.addMenuItem(new MenuItem(null, section.menuId, itemId, section.id, null, nextOrder));
      await replacePours(menuItem.id!, pours);
      res.status(201).json({ menuItemId: menuItem.id, itemId });
    }));

    // Reorders the items within a section to match the given list of menu item IDs
    this.router.put('/sections/:sectionId/items/order', handle(async (req, res) => {
      const ids = idList(req.body, 'menuItemIds');
      const existing = await this.dataProvider.getMenuItemsForSubMenu(req.params.sectionId as string);
      const existingIds = new Set(existing.map((m) => m.id));
      if (ids.length !== existing.length || ids.some((id) => !existingIds.has(id))) {
        throw badRequest('menuItemIds must list every item in this section exactly once');
      }
      for (let i = 0; i < ids.length; i++) {
        await this.dataProvider.updateMenuItem(ids[i], new MenuItem(null, null, null, null, null, i + 1));
      }
      res.sendStatus(204);
    }));

    // ---- Menu items (an item placed on a section, with its prices) ----

    this.router.get('/menu-items/:menuItemId', handle(async (req, res) => {
      const menuItem = await this.dataProvider.getMenuItem(req.params.menuItemId as string);
      if (!menuItem) throw notFound('Menu item');
      const { section, menu } = await loadSection(menuItem.subMenuId!);
      const placements = await this.dataProvider.getMenuItemsForItem(menuItem.itemId!);
      res.json({
        menuItemId: menuItem.id,
        section: { id: section.id, displayName: section.displayName },
        menu: { id: menu.id, displayName: menu.displayName },
        item: await describeItem(await this.dataProvider.getItem(menuItem.itemId!)),
        pours: await describePours(menuItem.id!),
        // How many other places this item appears; edits to the item itself show up there too
        otherPlacementCount: placements.length - 1,
      });
    }));

    // Saves the item's details and this placement's prices together
    this.router.put('/menu-items/:menuItemId', handle(async (req, res) => {
      const menuItem = await this.dataProvider.getMenuItem(req.params.menuItemId as string);
      if (!menuItem) throw notFound('Menu item');
      const pours = parsePours(req.body);
      await validatePours(pours);
      if (req.body?.item) {
        const original = await this.dataProvider.getItem(menuItem.itemId!);
        const updated = await itemFromBody(req.body.item);
        // Category isn't edited in the client; keep whatever it was
        updated.category = original?.category ?? null;
        await this.dataProvider.replaceItem(menuItem.itemId!, updated);
      }
      if (pours !== null) await replacePours(menuItem.id!, pours);
      res.sendStatus(204);
    }));

    // Takes an item off a section (the item itself stays in the library)
    this.router.delete('/menu-items/:menuItemId', handle(async (req, res) => {
      const menuItem = await this.dataProvider.getMenuItem(req.params.menuItemId as string);
      if (!menuItem) throw notFound('Menu item');
      for (const saleContainer of await this.dataProvider.getSaleContainersForMenuItem(menuItem.id!)) {
        await this.dataProvider.removeSaleContainer(saleContainer.id!);
      }
      await this.dataProvider.removeMenuItem(menuItem.id!);
      res.sendStatus(204);
    }));

    // ---- Library ----

    this.router.get('/items', handle(async (_req, res) => {
      const items = await this.dataProvider.getItems();
      const breweries = new Map((await this.dataProvider.getBreweries()).map((b) => [b.id, b.name]));
      res.json(items
        .map((item) => ({
          id: item.id,
          displayName: item.displayName,
          internalName: item.internalName,
          breweryId: item.breweryId,
          breweryName: item.breweryId ? breweries.get(item.breweryId) ?? null : null,
          style: item.style,
          abv: item.abv,
        }))
        .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '')));
    }));

    this.router.get('/breweries', handle(async (_req, res) => {
      const breweries = await this.dataProvider.getBreweries();
      res.json(breweries
        .map((b) => ({ id: b.id, name: b.name, location: b.location, hasLogo: Boolean(b.defaultLogo) }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
    }));

    this.router.post('/breweries', handle(async (req, res) => {
      const name = requiredString(req.body, 'name');
      const location = optionalString(req.body, 'location', 200);
      const brewery = await this.dataProvider.addBrewery(new Brewery(null, name, null, location));
      res.status(201).json({ id: brewery.id, name: brewery.name, location: brewery.location, hasLogo: false });
    }));

    const describeBrewery = async (brewery: Brewery) => {
      const items = (await this.dataProvider.getItems())
        .filter((item) => item.breweryId === brewery.id)
        .map((item) => ({ id: item.id, displayName: item.displayName, style: item.style, abv: item.abv }))
        .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
      return {
        id: brewery.id,
        name: brewery.name,
        location: brewery.location,
        logo: logoDataUrl(brewery.defaultLogo),
        items,
      };
    };

    const loadBrewery = async (breweryId: string) => {
      const brewery = await this.dataProvider.getBrewery(breweryId);
      if (!brewery) throw notFound('Brewery');
      return brewery;
    };

    this.router.get('/breweries/:breweryId', handle(async (req, res) => {
      res.json(await describeBrewery(await loadBrewery(req.params.breweryId as string)));
    }));

    // Updates a brewery's name and location (the logo has its own routes below)
    this.router.patch('/breweries/:breweryId', handle(async (req, res) => {
      const brewery = await loadBrewery(req.params.breweryId as string);
      const name = requiredString(req.body, 'name');
      const location = optionalString(req.body, 'location', 200);
      const updated = await this.dataProvider.replaceBrewery(brewery.id!, new Brewery(null, name, brewery.defaultLogo, location));
      res.json(await describeBrewery(updated));
    }));

    // Sets or replaces a brewery's logo (used for its beers on the menu board and widget when
    // an item doesn't have its own)
    this.router.put('/breweries/:breweryId/logo', handle(async (req, res) => {
      const brewery = await loadBrewery(req.params.breweryId as string);
      const logo = parseLogo(req.body);
      await this.dataProvider.replaceBrewery(brewery.id!, new Brewery(null, brewery.name, logo, brewery.location));
      res.json({ logo: logoDataUrl(logo) });
    }));

    this.router.delete('/breweries/:breweryId/logo', handle(async (req, res) => {
      const brewery = await loadBrewery(req.params.breweryId as string);
      await this.dataProvider.replaceBrewery(brewery.id!, new Brewery(null, brewery.name, null, brewery.location));
      res.sendStatus(204);
    }));

    this.router.get('/containers', handle(async (_req, res) => {
      const containers = await this.dataProvider.getContainers();
      res.json(containers
        .map((c) => ({ id: c.id, displayName: c.displayName, containerName: c.containerName, order: c.order }))
        .sort(byOrder));
    }));

    // Unknown /api routes get a JSON 404 rather than falling through to the HTML routes
    this.router.use(handle(async () => {
      throw notFound('API route');
    }));
  }
}
