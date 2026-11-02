import zlib from 'zlib';
import express, { Express } from 'express';
import { DataProvider, LocalDataProvider } from '../storage/providers';
import { Brewery } from '../models/breweries';
import { ItemContainer, SaleContainer } from '../models/containers';
import { Item } from '../models/items';
import { Menu, MenuItem, SubMenu } from '../models/menus';
import { NewUser, PublicUser, toPublicUser, User } from '../models/users';
import { hashPassword } from '../auth/passwords';
import { newSessionToken, SESSION_COOKIE } from '../auth/sessions';

// A real 1x1 PNG, small enough to inline but valid enough for pdfkit to draw.
export const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// Just enough of a JPEG/GIF header for the server's file-type sniffing.
export const JPEG_HEADER = '/9j/4AAQSkZJRgABAQ==';
export const GIF_HEADER = 'R0lGODlhAQABAAAAACw=';

// A real PNG of one flat color (bare base64, like logos are stored), for tests that look at pixels
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

// The in-memory provider, pointed at a folder that doesn't exist so it starts out empty.
export function memoryProvider(): LocalDataProvider {
  return new LocalDataProvider('/nonexistent/taproom-test-data');
}

// A deliberately cheap scrypt cost, so tests that need a user with a password don't each spend
// a tenth of a second hashing it. (Hashes carry their own cost, so verifying them is fast too.)
export const FAST_COST = { logN: 4, r: 8, p: 1 };

// Adds a user to the provider: by default an active admin who signs in with "pw-for-tests".
export async function addUser(
  provider: LocalDataProvider,
  overrides: Omit<NewUser, 'passwordHash'> & { password?: string | null } = { email: 'admin@example.com' },
): Promise<User> {
  const { password = 'pw-for-tests', ...rest } = overrides;
  return provider.createUser({
    role: 'ADMIN',
    status: 'ACTIVE',
    ...rest,
    email: rest.email ?? 'admin@example.com',
    passwordHash: password === null ? null : await hashPassword(password, FAST_COST),
  });
}

// Gives a user a live session and returns the Cookie header value to send as them
export async function sessionCookieFor(provider: LocalDataProvider, user: User, { expiresInMs = 60 * 60 * 1000 } = {}): Promise<string> {
  const { token, id } = newSessionToken();
  const now = new Date();
  await provider.createSession({ id, userId: user.id, createdAt: now, expiresAt: new Date(now.getTime() + expiresInMs) });
  return `${SESSION_COOKIE}=${token}`;
}

// Adds an active admin and returns the Cookie header for being signed in as them
export async function signedInAs(provider: LocalDataProvider, overrides?: Parameters<typeof addUser>[1]): Promise<string> {
  return sessionCookieFor(provider, await addUser(provider, overrides));
}

// A bare Express app with JSON parsing and a single router mounted, for testing a router
// without the auth and rate-limit middleware in front of it. `user` is who the requests count as
// being from, as if they had signed in (the API router works on that user's data).
export function appWith(mountPath: string, router: express.Router, user?: User | PublicUser): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  if (user) {
    const signedIn = toPublicUser(user as User);
    app.use((req, _res, next) => {
      req.user = signedIn;
      next();
    });
  }
  app.use(mountPath, router);
  return app;
}

export type Fixture = Awaited<ReturnType<typeof seed>>;

/*
A small but realistic menu:

  Brewery: Example Brewery (Nowhere, US) and Guest Co (no location, with a logo)
  Pour sizes: Taster (order 1), Full Pour (order 2), Crowler (no order)
  Items: Hazy Sequence (Example Brewery, NEIPA 6.5), Pils (Example Brewery, 4.8), Guest Sour (Guest Co), Pretzel (no brewery)
  Menu "Currently On Tap" (with logo)
    Section "Drafts" (order 1): Pils (order 2), Hazy Sequence (order 1)
    Section "Guest Taps" (order 2): Guest Sour
    Section "Empty" (order 3): nothing
*/
// Pass a provider limited to a user (provider.forOwner(user.id)) to make it that user's menu.
export async function seed(provider: DataProvider) {
  const example = await provider.addBrewery(new Brewery(null, 'Example Brewery', null, 'Nowhere, US'));
  const guestCo = await provider.addBrewery(new Brewery(null, 'Guest Co', TINY_PNG, null));

  const taster = await provider.addContainer(new ItemContainer(null, 'Taster glass', 'Taster', 1));
  const fullPour = await provider.addContainer(new ItemContainer(null, 'Pint glass', 'Full Pour', 2));
  const crowler = await provider.addContainer(new ItemContainer(null, 'Crowler', 'Crowler', null));

  const hazy = await provider.addItem(new Item(null, 'hazy-sequence', 'Hazy Sequence', example.id, 'NEIPA', 6.5, 'Juicy', 'beer'));
  const pils = await provider.addItem(new Item(null, 'pils', 'Pils', example.id, 'Pilsner', 4.8, null, 'beer'));
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
    breweries: { example, guestCo },
    containers: { taster, fullPour, crowler },
    items: { hazy, pils, sour, pretzel },
    menu,
    sections: { drafts, guestTaps, empty },
    menuItems: { hazyOnDrafts, pilsOnDrafts, sourOnGuest },
  };
}
