import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import express, { Express } from 'express';
import { LocalDataProvider } from '../../storage/providers';
import pdfkit from 'pdfkit';
import { unzipSync } from 'fflate';
import * as mupdf from 'mupdf';
import { BOARD_SAFE_MARGIN, BOARD_SECTION_GAP, BOARD_SIZE_SCALE, MenusRoutes } from '../../routes/menus';
import { Item } from '../../models/items';
import { Menu, MenuItem } from '../../models/menus';
import { Fixture, memoryProvider, seed, TINY_PNG } from '../helpers';

// The public, read-only menu formats: the JSON the Wix widget polls (?format=widget), the
// printable HTML menu (?format=print) and the menu board images (?format=digital).

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
  it('nests sections and items, skipping empty sections', async () => {
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
            },
            expect.objectContaining({ displayName: 'Pils' }),
          ],
        },
        {
          displayName: 'Guest Taps',
          items: [expect.objectContaining({ displayName: 'Guest Sour', breweryName: 'Guest Co', breweryLocation: null })],
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

  it("shows an item's own image set through the editor, and falls back once it's removed", async () => {
    await provider.setMenuItemLogo(data.menuItems.sourOnGuest.id!, 'aXRlbS1sb2dv');
    let res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(res.body.sections[1].items[0].logo).toBe('data:image/png;base64,aXRlbS1sb2dv');
    await provider.setMenuItemLogo(data.menuItems.sourOnGuest.id!, null);
    res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(res.body.sections[1].items[0].logo).toBe(`data:image/png;base64,${TINY_PNG}`); // brewery logo
  });

  it('leaves pour sizes and prices out entirely', async () => {
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(JSON.stringify(res.body)).not.toMatch(/pours|price/i);
  });

  it('handles items with no brewery', async () => {
    await provider.addMenuItem({ id: null, menuId: data.menu.id, itemId: data.items.pretzel.id, subMenuId: data.sections.empty.id, itemLogo: null, order: 1 });
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    const snacks = res.body.sections.find((s: { displayName: string }) => s.displayName === 'Empty');
    expect(snacks.items[0]).toMatchObject({ displayName: 'Pretzel', breweryName: null, breweryLocation: null, style: null, abv: null });
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
    expect(drafts.items.map((i: { displayName: string }) => i.displayName)).toEqual(['Hazy Sequence', 'Pils']);
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

  it('sizes the printable menu to fit two letter-size pages', async () => {
    const html = (await request(app).get(`/menus/${data.menu.id}?format=print`)).text;
    // Items are individual table bodies so a row and its description are never split by a page break
    expect(html).toContain('class="itemGroup"');
    // The inline script scales the root font size to fit; the stylesheet is what sets up the page
    expect(html).toContain('MAX_PAGES = 2');
    // The WiFi footer, a fixed element that browsers repeat on every printed page
    expect(html).toContain('WiFi Name: Zymos Brewing / Password: @zymos_brew');
    const css = fs.readFileSync(path.join(repoRoot, 'public/css/print.css'), 'utf8');
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*letter[^}]*margin:\s*0;/);
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
    expect(html).toContain('>$8.00<');
    expect(html).toContain('>$6.50<');
    expect(html).toContain('>$12.00<');
    // A size an item doesn't come in leaves its cell empty, with no stray $
    const hazy = html.slice(html.indexOf('Hazy Sequence'), html.indexOf('Pils'));
    expect(hazy).toMatch(/containerPriceCell">\$3\.00<\/td>/);
    expect(html).toContain('<td class="containerPriceCell"></td>');
    expect(html.match(/\$/g)).toHaveLength(4);
    // Pour-size columns follow the containers' order within a section
    const drafts = html.slice(html.indexOf('Drafts'), html.indexOf('Guest Taps'));
    expect(drafts.indexOf('Taster')).toBeGreaterThan(-1);
    expect(drafts.indexOf('Taster')).toBeLessThan(drafts.indexOf('Full Pour'));
    expect(drafts).not.toContain('Crowler');
    expect(html).toContain(TINY_PNG);
  });
});

describe('the default brewery', () => {
  const setDefault = (breweryId: string | null) =>
    provider.replaceMenu(data.menu.id!, new Menu(null, data.menu.internalName, data.menu.displayName, data.menu.logo, breweryId));
  const descriptions = (html: string) => [...html.matchAll(/<td class="descriptionCell">(.*?)<\/td>/g)].map((m) => m[1]);

  it('is named on the print view when the menu has no default brewery', async () => {
    const html = (await request(app).get(`/menus/${data.menu.id}?format=print`)).text;
    expect(descriptions(html).filter(Boolean)).toEqual([
      expect.stringMatching(/^Zymos Brewing &bull; <b>Hazy Sequence<\/b>/),
      expect.stringMatching(/^Zymos Brewing &bull; <b>Pils<\/b>/),
      expect.stringMatching(/^Guest Co &bull; <b>Guest Sour<\/b>/),
    ]);
  });

  it("is left off the print view, with no stray bullet, while other breweries stay", async () => {
    await setDefault(data.breweries.zymos.id!);
    const html = (await request(app).get(`/menus/${data.menu.id}?format=print`)).text;
    const lines = descriptions(html).filter(Boolean);
    expect(lines).toEqual([
      expect.stringMatching(/^<b>Hazy Sequence<\/b> &bull; NEIPA &bull; 6.5% ABV/),
      expect.stringMatching(/^<b>Pils<\/b> &bull; Pilsner &bull; 4.8% ABV/),
      expect.stringMatching(/^Guest Co &bull; <b>Guest Sour<\/b>/),
    ]);
    // Only the footer's WiFi name still says Zymos
    expect(html.match(/Zymos Brewing/g)).toHaveLength(1);
  });

  it('is still named in the widget, which has its own brewery field', async () => {
    await setDefault(data.breweries.zymos.id!);
    const res = await request(app).get(`/menus/${data.menu.id}?format=widget`);
    expect(res.body.sections[0].items.map((item: { breweryName: string }) => item.breweryName)).toEqual(['Zymos Brewing', 'Zymos Brewing']);
  });

  describe('on the menu board', () => {
    // The menu board code loads its font from dist/public/fonts relative to the working directory
    let originalCwd: string;
    let scratch: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'toe-default-brewery-'));
      fs.mkdirSync(path.join(scratch, 'dist'));
      fs.symlinkSync(path.join(repoRoot, 'public'), path.join(scratch, 'dist/public'));
      process.chdir(scratch);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      process.chdir(originalCwd);
      fs.rmSync(scratch, { recursive: true, force: true });
    });

    // Every string drawn on the board
    const textDrawn = async () => {
      const text = vi.spyOn(pdfkit.prototype, 'text');
      const res = await request(app).get(`/menus/${data.menu.id}?format=digital`).buffer(true).parse((response, callback) => {
        response.on('data', () => {});
        response.on('end', () => callback(null, null));
      });
      expect(res.status).toBe(200);
      return text.mock.calls.map(([drawn]) => drawn);
    };

    it('names every brewery when the menu has no default brewery', async () => {
      const drawn = await textDrawn();
      expect(drawn).toContain('Zymos Brewing Pils');
      expect(drawn).toContain('Zymos Brewing Hazy Sequence');
      expect(drawn).toContain('Guest Co Guest Sour');
    });

    it("leaves the default brewery's name off but keeps other breweries", async () => {
      await setDefault(data.breweries.zymos.id!);
      const drawn = await textDrawn();
      expect(drawn).toContain('Pils');
      expect(drawn).toContain('Hazy Sequence');
      expect(drawn).toContain('Guest Co Guest Sour');
      expect(drawn.filter((text) => String(text).includes('Zymos'))).toEqual([]);
    });
  });
});

describe('?format=digital', () => {
  // The menu board code loads its font from dist/public/fonts relative to the working directory (that's
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

  // Fetches a response body as raw bytes
  const binary = (url: string) =>
    request(app).get(url).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });

  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const BOARD_BLUE = [0x17, 0x5a, 0x6c];
  const SECTION_HEADER_GREY = [0x2b, 0x2b, 0x2b];

  const decode = (png: Uint8Array) => {
    const pixmap = new mupdf.Image(png).toPixmap();
    const pixels = pixmap.getPixels();
    const stride = pixmap.getStride();
    const channels = pixmap.getNumberOfComponents();
    return {
      width: pixmap.getWidth(),
      height: pixmap.getHeight(),
      at: (x: number, y: number) => [...pixels.subarray(y * stride + x * channels, y * stride + x * channels + 3)],
    };
  };

  // Every pixel within `margin` of an edge that isn't the background colour
  const marginIntrusions = (image: ReturnType<typeof decode>, margin: number) => {
    const bad: string[] = [];
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const inMargin = x < margin || y < margin || x >= image.width - margin || y >= image.height - margin;
        if (inMargin && image.at(x, y).join() !== BOARD_BLUE.join()) bad.push(`${x},${y}`);
      }
    }
    return bad;
  };

  // Puts enough items on the Drafts section that the board needs more than one page. Some have
  // names too long to fit on a line.
  async function fillDrafts(count: number) {
    for (let i = 0; i < count; i++) {
      const long = i % 5 === 0 ? ' Barrel Aged Imperial Pastry Stout With Vanilla Cocoa Nibs And Toasted Coconut' : '';
      const item = await provider.addItem(new Item(null, `extra-${i}`, `Extra ${i}${long}`, data.breweries.zymos.id, 'Stout', 7.1, null, 'beer'));
      await provider.addMenuItem(new MenuItem(null, data.menu.id, item.id, data.sections.drafts.id, null, 10 + i));
    }
  }

  it('returns the menu board as a ZIP of PNG images', async () => {
    const res = await binary(`/menus/${data.menu.id}?format=digital`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=menu-board\.zip$/);
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    // The seeded menu fits on one page
    expect(Object.keys(files)).toEqual(['menu-board-1.png']);
    expect([...files['menu-board-1.png'].subarray(0, 8)]).toEqual(PNG_SIGNATURE);
    const image = decode(files['menu-board-1.png']);
    expect([image.width, image.height]).toEqual([1080, 1920]);
  });

  it('returns a single page as an image with &page=N', async () => {
    await fillDrafts(40);
    const zipped = unzipSync(new Uint8Array((await binary(`/menus/${data.menu.id}?format=digital`)).body as Buffer));
    const pageCount = Object.keys(zipped).length;
    expect(pageCount).toBeGreaterThan(1);
    expect(Object.keys(zipped)).toEqual(Array.from({ length: pageCount }, (_, i) => `menu-board-${i + 1}.png`));

    const second = await binary(`/menus/${data.menu.id}?format=digital&page=2`);
    expect(second.status).toBe(200);
    expect(second.headers['content-type']).toBe('image/png');
    expect(second.headers['content-disposition']).toBe('inline; filename=menu-board-2.png');
    expect(new Uint8Array(second.body as Buffer)).toEqual(zipped['menu-board-2.png']);
  });

  it('rejects a page that is not a positive whole number, and 404s one past the end', async () => {
    for (const bad of ['0', '-1', 'two', '1.5', '', '1&page=2']) {
      expect((await request(app).get(`/menus/${data.menu.id}?format=digital&page=${bad}`)).status).toBe(400);
    }
    expect((await request(app).get(`/menus/${data.menu.id}?format=digital&page=2`)).status).toBe(404);
  });

  it('leaves the margins on every side of every page as plain background', async () => {
    await fillDrafts(40);
    const files = unzipSync(new Uint8Array((await binary(`/menus/${data.menu.id}?format=digital`)).body as Buffer));
    expect(Object.keys(files).length).toBeGreaterThan(1);
    for (const [name, png] of Object.entries(files)) {
      expect(marginIntrusions(decode(png), BOARD_SAFE_MARGIN), name).toEqual([]);
    }
  });

  it('draws the section bars 5% bigger than the original 50px', async () => {
    expect(BOARD_SIZE_SCALE).toBe(1.05);
    const image = decode(unzipSync(new Uint8Array((await binary(`/menus/${data.menu.id}?format=digital`)).body as Buffer))['menu-board-1.png']);
    const top = BOARD_SAFE_MARGIN + 150 + 10;
    const x = BOARD_SAFE_MARGIN + 2;
    // 50 * 1.05 = 52.5px tall: still grey at 51px down, background again by 54px
    expect(image.at(x, top + 51)).toEqual(SECTION_HEADER_GREY);
    expect(image.at(x, top + 54)).toEqual(BOARD_BLUE);
  });

  it('leaves extra room between the last item of a section and the next section header', async () => {
    // Short names, so every item here takes one line and the spacing between rows is the same
    for (let i = 0; i < 3; i++) {
      const item = await provider.addItem(new Item(null, `short-${i}`, `S${i}`, data.breweries.zymos.id, 'Stout', 7.1, null, 'beer'));
      await provider.addMenuItem(new MenuItem(null, data.menu.id, item.id, data.sections.drafts.id, null, 10 + i));
    }
    const image = decode(unzipSync(new Uint8Array((await binary(`/menus/${data.menu.id}?format=digital`)).body as Buffer))['menu-board-1.png']);

    // Runs of rows (below the logo) down one column of the image where `matches` holds
    const runsDown = (matches: (y: number) => boolean) => {
      const found: { start: number; end: number }[] = [];
      for (let y = BOARD_SAFE_MARGIN + 150; y < image.height; y++) {
        if (!matches(y)) continue;
        const last = found[found.length - 1];
        if (last && y - last.end <= 1) last.end = y;
        else found.push({ start: y, end: y });
      }
      return found;
    };
    // Header bars: grey down the right-hand side, clear of any text
    const bars = runsDown((y) => image.at(1000, y).join() === SECTION_HEADER_GREY.join());
    // Item thumbnails: down the middle of their circles, outside the bars (which have text in them).
    // A thumbnail is about 50px tall; shorter runs are anti-aliased rows at the edges of the bars.
    const inBar = (y: number) => bars.some((bar) => y >= bar.start && y <= bar.end);
    const thumbs = runsDown((y) => !inBar(y) && image.at(BOARD_SAFE_MARGIN + 26, y).join() !== BOARD_BLUE.join())
      .filter((run) => run.end - run.start > 40);

    // Drafts (Hazy Sequence, Pils, S0, S1, S2), then Guest Taps (Guest Sour)
    expect(bars).toHaveLength(2);
    expect(thumbs).toHaveLength(6);
    // Between two one-line items, and between the last of Drafts and the Guest Taps bar
    const gapBetweenItems = thumbs[4].start - thumbs[3].end;
    const gapBeforeNextSection = bars[1].start - thumbs[4].end;
    expect(Math.abs(gapBeforeNextSection - gapBetweenItems - BOARD_SECTION_GAP)).toBeLessThanOrEqual(2);
  });

  it('starts the content right at the edge of the margin', async () => {
    const image = decode(unzipSync(new Uint8Array((await binary(`/menus/${data.menu.id}?format=digital`)).body as Buffer))['menu-board-1.png']);
    // The Drafts header bar sits just under the logo: 40px logo margin + 150px logo + 10px gap
    const y = BOARD_SAFE_MARGIN + 150 + 10 + 25;
    expect(image.at(BOARD_SAFE_MARGIN - 1, y)).toEqual(BOARD_BLUE);
    expect(image.at(BOARD_SAFE_MARGIN, y)).toEqual(SECTION_HEADER_GREY);
    expect(image.at(1080 - BOARD_SAFE_MARGIN - 1, y)).toEqual(SECTION_HEADER_GREY);
    expect(image.at(1080 - BOARD_SAFE_MARGIN, y)).toEqual(BOARD_BLUE);
  });
});
