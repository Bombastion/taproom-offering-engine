import express, { Express } from 'express';
import { LocalDataProvider } from '../storage/providers';
import { Brewery } from '../models/breweries';
import { ItemContainer, SaleContainer } from '../models/containers';
import { Item } from '../models/items';
import { Menu, MenuItem, SubMenu } from '../models/menus';

// A real 1x1 PNG, small enough to inline but valid enough for pdfkit to draw.
export const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Just enough of a JPEG/GIF header for the server's file-type sniffing.
export const JPEG_HEADER = '/9j/4AAQSkZJRgABAQ==';
export const GIF_HEADER = 'R0lGODlhAQABAAAAACw=';

// The in-memory provider, pointed at a folder that doesn't exist so it starts out empty.
export function memoryProvider(): LocalDataProvider {
  return new LocalDataProvider('/nonexistent/taproom-test-data');
}

export function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

// A bare Express app with JSON parsing and a single router mounted, for testing a router
// without the auth and rate-limit middleware in front of it.
export function appWith(mountPath: string, router: express.Router): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(mountPath, router);
  return app;
}

export type Fixture = Awaited<ReturnType<typeof seed>>;

/*
A small but realistic menu:

  Brewery: Zymos Brewing (Littleton, CO) and Guest Co (no location, with a logo)
  Pour sizes: Taster (order 1), Full Pour (order 2), Crowler (no order)
  Items: Hazy Sequence (Zymos, NEIPA 6.5), Pils (Zymos, 4.8), Guest Sour (Guest Co), Pretzel (no brewery)
  Menu "Currently On Tap" (with logo)
    Section "Drafts" (order 1): Pils (order 2), Hazy Sequence (order 1)
    Section "Guest Taps" (order 2): Guest Sour
    Section "Empty" (order 3): nothing
*/
export async function seed(provider: LocalDataProvider) {
  const zymos = await provider.addBrewery(new Brewery(null, 'Zymos Brewing', null, 'Littleton, CO'));
  const guestCo = await provider.addBrewery(new Brewery(null, 'Guest Co', TINY_PNG, null));

  const taster = await provider.addContainer(new ItemContainer(null, 'Taster glass', 'Taster', 1));
  const fullPour = await provider.addContainer(new ItemContainer(null, 'Pint glass', 'Full Pour', 2));
  const crowler = await provider.addContainer(new ItemContainer(null, 'Crowler', 'Crowler', null));

  const hazy = await provider.addItem(new Item(null, 'hazy-sequence', 'Hazy Sequence', zymos.id, 'NEIPA', 6.5, 'Juicy', 'beer'));
  const pils = await provider.addItem(new Item(null, 'pils', 'Pils', zymos.id, 'Pilsner', 4.8, null, 'beer'));
  const sour = await provider.addItem(new Item(null, 'guest-sour', 'Guest Sour', guestCo.id, 'Sour', 5.2, null, 'beer'));
  const pretzel = await provider.addItem(new Item(null, 'pretzel', 'Pretzel', null, null, null, 'Salty', 'snacks'));

  const menu = await provider.addMenu(new Menu(null, 'on-tap', 'Currently On Tap', TINY_PNG));
  const drafts = await provider.addSubMenu(new SubMenu(null, 'on-tap-drafts', 'Drafts', menu.id, 1));
  const guestTaps = await provider.addSubMenu(new SubMenu(null, 'on-tap-guest', 'Guest Taps', menu.id, 2));
  const empty = await provider.addSubMenu(new SubMenu(null, 'on-tap-empty', 'Empty', menu.id, 3));

  const hazyOnDrafts = await provider.addMenuItem(new MenuItem(null, menu.id, hazy.id, drafts.id, null, 1));
  const pilsOnDrafts = await provider.addMenuItem(new MenuItem(null, menu.id, pils.id, drafts.id, null, 2));
  const sourOnGuest = await provider.addMenuItem(new MenuItem(null, menu.id, sour.id, guestTaps.id, null, 1));

  // Added out of container order on purpose
  await provider.addSaleContainer(new SaleContainer(null, fullPour.id!, hazyOnDrafts.id!, 8));
  await provider.addSaleContainer(new SaleContainer(null, taster.id!, hazyOnDrafts.id!, 3));
  await provider.addSaleContainer(new SaleContainer(null, fullPour.id!, pilsOnDrafts.id!, 6.5));
  await provider.addSaleContainer(new SaleContainer(null, crowler.id!, sourOnGuest.id!, 12));

  return {
    breweries: { zymos, guestCo },
    containers: { taster, fullPour, crowler },
    items: { hazy, pils, sour, pretzel },
    menu,
    sections: { drafts, guestTaps, empty },
    menuItems: { hazyOnDrafts, pilsOnDrafts, sourOnGuest },
  };
}
