import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import express, { Express } from 'express';
import { MenusRoutes } from '../../routes/menus';
import { LocalDataProvider } from '../../storage/providers';
import { MenuItem } from '../../models/menus';
import { Fixture, memoryProvider, seed, TINY_PNG } from '../helpers';

// The public, read-only menu formats: the JSON the Wix widget polls (?format=widget), the
// printable HTML menu (?format=print) and the menu board PDF (?format=digital).

const repoRoot = path.resolve(import.meta.dirname, '../..');

let provider: LocalDataProvider;
let data: Fixture;
let app: Express;

beforeEach(async () => {
  provider = memoryProvider();
  data = await seed(provider);
  app = express();
  app.set('view engine', 'pug');
  app.set('views', path.join(repoRoot, 'public/views'));
  app.use('/menus', new MenusRoutes(provider).router);
});

describe('GET /menus/:menuId', () => {
  it('404s for an unknown menu', async () => {
    expect((await request(app).get('/menus/nope')).status).toBe(404);
    expect((await request(app).get('/menus/nope?format=widget')).status).toBe(404);
  });

  it('returns the raw menu as JSON by default and with ?format=json', async () => {
    for (const url of [`/menus/${data.menu.id}`, `/menus/${data.menu.id}?format=json`]) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: data.menu.id, internalName: 'on-tap', displayName: 'Currently On Tap', logo: TINY_PNG });
    }
  });

  it('400s for an unknown format', async () => {
    expect((await request(app).get(`/menus/${data.menu.id}?format=xml`)).status).toBe(400);
  });
});

describe('?format=widget', () => {
  it('nests sections, items and pours, skipping empty sections', async () => {
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: data.menu.id,
      displayName: 'Currently On Tap',
      logo: `data:image/png;base64,${TINY_PNG}`,
      generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      sections: [
        {
          displayName: 'Drafts',
          items: [
            {
              breweryName: 'Zymos Brewing',
              breweryLocation: 'Littleton, CO',
              displayName: 'Hazy Sequence',
              style: 'NEIPA',
              abv: 6.5,
              description: 'Juicy',
              // No item or brewery logo, so the menu's logo is used
              logo: `data:image/png;base64,${TINY_PNG}`,
              pours: [{ label: 'Taster', price: 3 }, { label: 'Full Pour', price: 8 }],
            },
            expect.objectContaining({ displayName: 'Pils', pours: [{ label: 'Full Pour', price: 6.5 }] }),
          ],
        },
        {
          displayName: 'Guest Taps',
          items: [expect.objectContaining({ displayName: 'Guest Sour', breweryName: 'Guest Co', breweryLocation: null, pours: [{ label: 'Crowler', price: 12 }] })],
        },
      ],
    });
  });

  it('follows section and item order, with unordered entries last', async () => {
    await provider.updateSubMenu(data.sections.drafts.id!, { id: null, internalName: null, displayName: null, menuId: null, order: 5 });
    await provider.updateMenuItem(data.menuItems.hazyOnDrafts.id!, { id: null, menuId: null, itemId: null, subMenuId: null, itemLogo: null, order: 9 });
    const unordered = await provider.addSubMenu({ id: null, internalName: 'u', displayName: 'Unordered', menuId: data.menu.id, order: null });
    await provider.addMenuItem({ id: null, menuId: data.menu.id, itemId: data.items.pretzel.id, subMenuId: unordered.id, itemLogo: null, order: null });

    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(res.body.sections.map((s: { displayName: string }) => s.displayName)).toEqual(['Guest Taps', 'Drafts', 'Unordered']);
    expect(res.body.sections[1].items.map((i: { displayName: string }) => i.displayName)).toEqual(['Pils', 'Hazy Sequence']);
  });

  it('prefers the item logo, then the brewery logo, then the menu logo', async () => {
    const itemLogo = 'aXRlbS1sb2dv';
    await provider.updateMenuItem(data.menuItems.pilsOnDrafts.id!, { id: null, menuId: null, itemId: null, subMenuId: null, itemLogo, order: null });
    await provider.replaceMenu(data.menu.id!, { ...data.menu, logo: null });

    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    const [drafts, guest] = res.body.sections;
    expect(res.body.logo).toBeNull();
    expect(drafts.items[0].logo).toBeNull(); // Hazy: nothing to fall back to
    expect(drafts.items[1].logo).toBe(`data:image/png;base64,${itemLogo}`); // Pils: its own logo
    expect(guest.items[0].logo).toBe(`data:image/png;base64,${TINY_PNG}`); // Guest Sour: brewery logo
  });

  it('handles items with no brewery', async () => {
    await provider.addMenuItem({ id: null, menuId: data.menu.id, itemId: data.items.pretzel.id, subMenuId: data.sections.empty.id, itemLogo: null, order: 1 });
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    const snacks = res.body.sections.find((s: { displayName: string }) => s.displayName === 'Empty');
    expect(snacks.items[0]).toMatchObject({ displayName: 'Pretzel', breweryName: null, breweryLocation: null, style: null, abv: null, pours: [] });
  });
});

describe('inactive items', () => {
  beforeEach(async () => {
    await provider.setMenuItemActive(data.menuItems.hazyOnDrafts.id!, false);
  });

  it('leaves inactive items out of the widget', async () => {
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    const drafts = res.body.sections.find((s: { displayName: string }) => s.displayName === 'Drafts');
    expect(drafts.items.map((i: { displayName: string }) => i.displayName)).toEqual(['Pils']);
  });

  it('skips a section in the widget when everything on it is inactive', async () => {
    await provider.setMenuItemActive(data.menuItems.sourOnGuest.id!, false);
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(res.body.sections.map((s: { displayName: string }) => s.displayName)).toEqual(['Drafts']);
  });

  it('shows items again in their configured spot once reactivated', async () => {
    await provider.setMenuItemActive(data.menuItems.hazyOnDrafts.id!, true);
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    const drafts = res.body.sections.find((s: { displayName: string }) => s.displayName === 'Drafts');
    expect(drafts.items.map((i: { displayName: string; pours: unknown[] }) => [i.displayName, i.pours.length])).toEqual([['Hazy Sequence', 2], ['Pils', 1]]);
  });

  it('leaves inactive items, and sections with nothing active, out of the print view', async () => {
    await provider.setMenuItemActive(data.menuItems.sourOnGuest.id!, false);
    const html = (await request(app).get(`/menus/${data.menu.id}?format=print`)).text;
    expect(html).toContain('Pils');
    expect(html).not.toContain('Hazy Sequence');
    expect(html).not.toContain('Guest Taps');
    expect(html).not.toContain('Guest Sour');
    // Only the inactive Hazy Sequence had a Taster price
    expect(html).not.toContain('Taster');
  });
});

// Puts Pils ahead of Hazy Sequence on Drafts, the opposite of the order they were added in
async function swapDrafts() {
  await provider.updateMenuItem(data.menuItems.hazyOnDrafts.id!, new MenuItem(null, null, null, null, null, 3));
}

describe('?format=print', () => {
  it("lists each section's items in their configured order", async () => {
    await swapDrafts();
    const html = (await request(app).get(`/menus/${data.menu.id}?format=print`)).text;
    expect(html.indexOf('Pils')).toBeGreaterThan(-1);
    expect(html.indexOf('Pils')).toBeLessThan(html.indexOf('Hazy Sequence'));
  });

  it('renders the printable menu with each section, its pour-size columns and prices', async () => {
    const res = await request(app).get(`/menus/${data.menu.id}?format=print`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    const html = res.text;
    for (const text of ['Drafts', 'Guest Taps', 'Hazy Sequence', 'Pils', 'Guest Sour', 'Zymos Brewing', 'NEIPA', '6.5% ABV', 'Juicy']) {
      expect(html).toContain(text);
    }
    // Prices always show cents
    expect(html).toContain('>8.00<');
    expect(html).toContain('>6.50<');
    expect(html).toContain('>12.00<');
    // Pour-size columns follow the containers' order within a section
    const drafts = html.slice(html.indexOf('Drafts'), html.indexOf('Guest Taps'));
    expect(drafts.indexOf('Taster')).toBeGreaterThan(-1);
    expect(drafts.indexOf('Taster')).toBeLessThan(drafts.indexOf('Full Pour'));
    expect(drafts).not.toContain('Crowler');
    expect(html).toContain(TINY_PNG);
  });
});

describe('?format=digital', () => {
  // The PDF code loads its font from dist/public/fonts relative to the working directory (that's
  // where `npm run build` puts it). Point a scratch working directory at the repo's public/
  // folder instead of requiring a build.
  let originalCwd: string;
  let scratch: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'toe-pdf-'));
    fs.mkdirSync(path.join(scratch, 'dist'));
    fs.symlinkSync(path.join(repoRoot, 'public'), path.join(scratch, 'dist/public'));
    process.chdir(scratch);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("draws each section's items in their configured order", async () => {
    await swapDrafts();
    const getItem = vi.spyOn(provider, 'getItem');
    await request(app).get(`/menus/${data.menu.id}?format=digital`).buffer(true).parse((response, callback) => {
      response.on('data', () => {});
      response.on('end', () => callback(null, null));
    });
    // Each item is looked up as it's drawn (the first in a section is also looked up once more
    // to measure it), so the order of first lookups is the order on the board
    const drawn = [...new Set(getItem.mock.calls.map(([id]) => id))];
    expect(drawn).toEqual([data.items.pils.id, data.items.hazy.id, data.items.sour.id]);
  });

  it('streams a PDF menu board as a download', async () => {
    const res = await request(app)
      .get(`/menus/${data.menu.id}?format=digital`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(-6).toString('latin1')).toMatch(/%%EOF/);
  });
});
