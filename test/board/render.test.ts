import { afterEach, describe, expect, it, vi } from 'vitest';
import pdfkit from 'pdfkit';
import * as mupdf from 'mupdf';
import { renderBoardPages } from '../../board/render';
import { BoardDesign, boardDesignPresets, defaultBoardDesign } from '../../models/boardDesign';
import { FONTS } from '../../models/fonts';
import { PrintItem, PrintModel } from '../../print/model';
import { solidPng } from '../helpers';

// The menu board drawn from a model and a design: a pure function, so these tests build the model by
// hand and look at the pictures that come out (and at what was drawn, where the pixels can't say).

afterEach(() => {
  vi.restoreAllMocks();
});

const RED = [200, 40, 40];
const BLUE = [30, 90, 200];
const MENU_LOGO = solidPng(40, 40, [200, 40, 40]);
const ITEM_LOGO = solidPng(40, 40, [30, 90, 200]);

function item(overrides: Partial<PrintItem> = {}): PrintItem {
  return {
    breweryName: 'Zymos Brewing', breweryLocation: 'Littleton, CO', displayName: 'Hazy Sequence', style: 'NEIPA', abv: 6.5,
    description: 'Juicy and soft', category: 'beer', itemLogo: null, breweryLogo: null, prices: new Map(), ...overrides,
  };
}

function modelOf(sections: Array<[string, PrintItem[]]> = [['Drafts', [item()]]], menuLogo: string | null = MENU_LOGO): PrintModel {
  return {
    menuName: 'Currently On Tap',
    menuLogo,
    sections: sections.map(([name, items], i) => ({ id: `s${i}`, name, sizes: [], items })),
  };
}

function changed(change: (design: any) => void): BoardDesign {
  const design: any = structuredClone(defaultBoardDesign());
  change(design);
  return design;
}

const decode = (png: Uint8Array) => {
  const pixmap = new mupdf.Image(png).toPixmap();
  const pixels = pixmap.getPixels();
  const stride = pixmap.getStride();
  const channels = pixmap.getNumberOfComponents();
  return {
    width: pixmap.getWidth(),
    height: pixmap.getHeight(),
    at: (x: number, y: number) => {
      const [column, row] = [Math.floor(x), Math.floor(y)];
      return [...pixels.subarray(row * stride + column * channels, row * stride + column * channels + 3)];
    },
  };
};

const hex = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const near = (actual: number[], expected: number[], tolerance = 3) => actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);
const BG = hex(defaultBoardDesign().canvas.background);
const BAR = hex(defaultBoardDesign().sections.bar.background!);

async function page(model: PrintModel, design: BoardDesign = defaultBoardDesign(), index = 0) {
  return decode((await renderBoardPages(model, design))[index]);
}

// Every string drawn on the board, in order, with where each run of text starts (x and y are only given
// for the first piece of a line). Text is also laid out on a scratch page to measure it; that is left out.
async function textDrawn(model: PrintModel, design: BoardDesign = defaultBoardDesign()) {
  const spy = vi.spyOn(pdfkit.prototype, 'text');
  await renderBoardPages(model, design);
  const calls = spy.mock.calls
    .map(([drawn, x, y], i) => ({ drawn: String(drawn), x, y, onBoard: (spy.mock.contexts[i] as any).page.height === 1920 }))
    .filter((call) => call.onBoard);
  spy.mockRestore();
  return calls;
}

const margin = (image: ReturnType<typeof decode>, width: number, background = BG) => {
  const bad: string[] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if ((x < width || y < width || x >= image.width - width || y >= image.height - width) && !near(image.at(x, y), background)) bad.push(`${x},${y}`);
    }
  }
  return bad;
};

const manyItems = (count: number) => Array.from({ length: count }, (_, i) => item({ displayName: `Beer number ${i} with a fairly long name`, itemLogo: i % 2 ? ITEM_LOGO : null }));

describe('the canvas', () => {
  it('is one 1080x1920 picture per screenful, painted with the background', async () => {
    const pages = await renderBoardPages(modelOf(), defaultBoardDesign());
    expect(pages).toHaveLength(1);
    const image = decode(pages[0]);
    expect([image.width, image.height]).toEqual([1080, 1920]);
    expect(image.at(2, 2)).toEqual(BG);
    expect(image.at(1077, 1917)).toEqual(BG);
  });

  it('uses the design\'s background color', async () => {
    const image = await page(modelOf(), changed((d) => { d.canvas.background = '#ff8800'; }));
    expect(image.at(2, 2)).toEqual([255, 136, 0]);
    expect(image.at(1077, 1917)).toEqual([255, 136, 0]);
  });

  it('keeps everything but background out of the safe margin, whatever its size', async () => {
    for (const safeMarginPx of [0, 40, 120]) {
      const design = changed((d) => { d.canvas.safeMarginPx = safeMarginPx; });
      const pages = await renderBoardPages(modelOf([['Drafts', manyItems(30)]]), design);
      for (const png of pages) expect(margin(decode(png), safeMarginPx), `margin ${safeMarginPx}`).toEqual([]);
    }
  });

  it('is just the background (and the logo) for a menu with nothing on it', async () => {
    const pages = await renderBoardPages(modelOf([]), defaultBoardDesign());
    expect(pages).toHaveLength(1);
    const image = decode(pages[0]);
    expect(image.at(540, 400)).toEqual(BG);
    expect(near(image.at(540, 40 + 75), RED)).toBe(true);
  });

  it('can be drawn at a smaller scale', async () => {
    const image = decode((await renderBoardPages(modelOf(), defaultBoardDesign(), { scale: 0.5 }))[0]);
    expect([image.width, image.height]).toEqual([540, 960]);
  });
});

describe('the header', () => {
  it('shows the menu logo at the top, centered', async () => {
    const image = await page(modelOf());
    expect(near(image.at(540, 40 + 75), RED)).toBe(true);
    expect(image.at(200, 40 + 75)).toEqual(BG);
  });

  it.each([
    ['left', 40 + 20],
    ['right', 1080 - 40 - 20],
  ] as const)('can put the logo at the %s', async (alignment, x) => {
    const image = await page(modelOf(), changed((d) => { d.header.logo.align = alignment; d.header.logo.sizePx = 100; }));
    expect(near(image.at(x, 40 + 50), RED)).toBe(true);
    expect(image.at(540, 40 + 50)).toEqual(BG);
  });

  it('can be sized', async () => {
    const image = await page(modelOf(), changed((d) => { d.header.logo.sizePx = 300; }));
    expect(near(image.at(540 - 140, 40 + 290), RED)).toBe(true);
    // ...and the sections start below it
    expect(near(image.at(41, 40 + 300 + 10 + 20), BAR)).toBe(true);
  });

  it('can be hidden, which moves the sections up', async () => {
    const hidden = await page(modelOf(), changed((d) => { d.header.logo.show = false; }));
    expect(hidden.at(540, 40 + 75)).toEqual(BG);
    // The bar now starts right under the margin
    expect(near(hidden.at(41, 40 + 10 + 20), BAR)).toBe(true);
    expect(hidden.at(41, 40 + 5)).toEqual(BG);
  });

  it('leaves the logo out, and draws on, for a menu that has none', async () => {
    const image = await page(modelOf([['Drafts', [item()]]], null));
    expect(image.at(540, 40 + 75)).toEqual(BG);
    // No logo, so nothing is kept clear for one: the bar starts right under the margin
    expect(near(image.at(41, 40 + 10 + 20), BAR)).toBe(true);
  });

  it('can show the menu name and date as a title, pushing the sections down', async () => {
    const design = changed((d) => {
      d.header.title.show = true;
      d.header.title.text = '{menu.name} — {date}';
    });
    const calls = await textDrawn(modelOf(), design);
    expect(calls.some((call) => /^Currently On Tap — [A-Z][a-z]+ \d{1,2}, \d{4}$/.test(call.drawn))).toBe(true);
    const plain = await page(modelOf());
    const withTitle = await page(modelOf(), design);
    // The bar is lower by the title's height: grey where it used to be background
    const y = 40 + 150 + 10 + 20;
    expect(near(plain.at(41, y), BAR)).toBe(true);
    expect(withTitle.at(41, y)).toEqual(BG);
  });

  it('fills the date in from the time given', async () => {
    const calls = await textDrawn(modelOf(), changed((d) => { d.header.title.show = true; d.header.title.text = '{date}'; }));
    expect(calls.map((call) => call.drawn)).not.toContain('March 5, 2026');
    const dated = vi.spyOn(pdfkit.prototype, 'text');
    await renderBoardPages(modelOf(), changed((d) => { d.header.title.show = true; d.header.title.text = '{date}'; }), { now: new Date('2026-03-05T12:00:00Z') });
    expect(dated.mock.calls.map(([drawn]) => drawn)).toContain('March 5, 2026');
  });

  it('adds space under the header', async () => {
    const image = await page(modelOf(), changed((d) => { d.header.gapBelowPx = 100; }));
    expect(image.at(41, 40 + 150 + 10 + 20)).toEqual(BG);
    expect(near(image.at(41, 40 + 150 + 100 + 10 + 20), BAR)).toBe(true);
  });

  it('is on every page', async () => {
    const pages = await renderBoardPages(modelOf([['Drafts', manyItems(40)]]), defaultBoardDesign());
    expect(pages.length).toBeGreaterThan(1);
    for (const png of pages) expect(near(decode(png).at(540, 40 + 75), RED)).toBe(true);
  });
});

describe('section bars', () => {
  it('are 52.5px tall, full width inside the margins, in the design\'s color', async () => {
    const image = await page(modelOf());
    const top = 40 + 150 + 10;
    expect(near(image.at(40, top + 51), BAR)).toBe(true);
    expect(image.at(40, top + 54)).toEqual(BG);
    expect(image.at(39, top + 20)).toEqual(BG);
    expect(near(image.at(1080 - 41, top + 20), BAR)).toBe(true);
    expect(image.at(1080 - 40, top + 20)).toEqual(BG);
  });

  it('can be a different height and color, with rounded corners', async () => {
    const image = await page(modelOf(), changed((d) => { d.sections.bar.heightPx = 100; d.sections.bar.background = '#336699'; d.sections.bar.radiusPx = 30; }));
    const top = 40 + 150 + 10;
    expect(near(image.at(300, top + 98), [51, 102, 153])).toBe(true);
    expect(image.at(300, top + 103)).toEqual(BG);
    // The corner is cut away
    expect(image.at(41, top + 1)).toEqual(BG);
    expect(near(image.at(70, top + 50), [51, 102, 153])).toBe(true);
  });

  it('can have no bar at all, just the name', async () => {
    const image = await page(modelOf(), changed((d) => { d.sections.bar.background = null; }));
    expect(image.at(1080 - 41, 40 + 150 + 10 + 20)).toEqual(BG);
  });

  it('write the name in capitals when the design says so', async () => {
    const calls = await textDrawn(modelOf(), changed((d) => { d.sections.bar.style.transform = 'uppercase'; }));
    expect(calls.map((call) => call.drawn)).toContain('DRAFTS');
    expect(calls.map((call) => call.drawn)).not.toContain('Drafts');
  });

  it('start a section a little lower than the items above it', async () => {
    const calls = await textDrawn(modelOf([['Drafts', [item()]], ['Guest Taps', [item({ displayName: 'Guest Sour' })]]]));
    const yOf = (text: string) => calls.find((call) => call.drawn === text)!.y as number;
    const gap = yOf('Guest Taps') - yOf('Drafts');
    // A bar, an item row and the gap between sections apart
    const noGap = await textDrawn(modelOf([['Drafts', [item()]], ['Guest Taps', [item({ displayName: 'Guest Sour' })]]]), changed((d) => { d.sections.gapPx = 0; }));
    const noGapDistance = (noGap.find((call) => call.drawn === 'Guest Taps')!.y as number) - (noGap.find((call) => call.drawn === 'Drafts')!.y as number);
    expect(gap - noGapDistance).toBe(30);
  });

  it('say "Continued" on the next page, or whatever the design says', async () => {
    const model = modelOf([['Drafts', manyItems(40)]]);
    const calls = await textDrawn(model);
    expect(calls.map((call) => call.drawn)).toContain('Drafts, Continued');
    const custom = await textDrawn(model, changed((d) => { d.sections.bar.continuedSuffix = ' (cont.)'; }));
    expect(custom.map((call) => call.drawn)).toContain('Drafts (cont.)');
    expect(custom.map((call) => call.drawn)).not.toContain('Drafts, Continued');
  });

  it('are not left alone at the bottom of a page, away from their first item', async () => {
    // Sections of two items each: wherever the page ends, a bar is followed by an item on the same page
    const sections: Array<[string, PrintItem[]]> = Array.from({ length: 12 }, (_, i) => [`Section ${i}`, manyItems(2)]);
    const pages = await renderBoardPages(modelOf(sections), defaultBoardDesign());
    expect(pages.length).toBeGreaterThan(1);
    for (const png of pages) {
      const image = decode(png);
      // Nothing but background in the bottom of each page below the last row
      expect(image.at(41, 1920 - 40 - 30)).toEqual(BG);
    }
  });
});

describe('item rows', () => {
  it('put the brewery, name, style and ABV on one line, the details quieter', async () => {
    const calls = (await textDrawn(modelOf())).map((call) => call.drawn);
    expect(calls).toContain('Zymos Brewing Hazy Sequence');
    expect(calls).toContain('  NEIPA  6.5%');
  });

  it('leave a missing part out along with the separator in front of it', async () => {
    const calls = (await textDrawn(modelOf([['Drafts', [
      item({ breweryName: null, displayName: 'No Brewery', style: null, abv: null }),
      item({ displayName: 'Zero', style: null, abv: 0 }),
      item({ displayName: 'Blank', style: '   ', abv: null }),
    ]]]))).map((call) => call.drawn);
    expect(calls).toContain('No Brewery');
    expect(calls).toContain('Zymos Brewing Zero');
    expect(calls).toContain('  0%');
    expect(calls).toContain('Zymos Brewing Blank');
    expect(calls.filter((drawn) => /null|undefined|NaN/.test(drawn))).toEqual([]);
  });

  it('merge neighbours in one style into a single piece of text', async () => {
    const calls = (await textDrawn(modelOf(), changed((d) => { d.items.lines[0].parts.forEach((part: any) => delete part.style); }))).map((call) => call.drawn);
    expect(calls).toContain('Zymos Brewing Hazy Sequence  NEIPA  6.5%');
  });

  it('draw a part in its own style, with the separator in front of it in that style too', async () => {
    const calls = (await textDrawn(modelOf(), changed((d) => { d.items.lines[0].parts[1].style = { weight: 700 }; d.items.lines[0].parts[1].before = ' — '; }))).map((call) => call.drawn);
    expect(calls).toContain('Zymos Brewing');
    expect(calls).toContain(' — Hazy Sequence');
  });

  it('can have more lines, and leave out a line with nothing to show', async () => {
    const design = changed((d) => {
      d.items.lines.push({ style: { ...d.items.lines[0].style, sizePx: 30, color: '#cccccc' }, parts: [{ field: 'description', before: '', format: '{value}' }] });
    });
    const calls = (await textDrawn(modelOf([['Drafts', [item(), item({ displayName: 'Plain', description: null })]]]), design)).map((call) => call.drawn);
    expect(calls).toContain('Juicy and soft');
    expect(calls.filter((drawn) => drawn === 'Juicy and soft').length).toBeGreaterThan(0);
    // The second item has no description: its row is as tall as one line
    const first = await page(modelOf([['Drafts', [item({ description: null })]]]), design);
    expect(first.width).toBe(1080);
  });

  it('make a row taller for every line it has', async () => {
    const one = await textDrawn(modelOf([['Drafts', [item(), item({ displayName: 'Second' })]]]));
    const two = await textDrawn(modelOf([['Drafts', [item(), item({ displayName: 'Second' })]]]), changed((d) => {
      d.items.lines.push({ style: { ...d.items.lines[0].style, sizePx: 30 }, parts: [{ field: 'description', before: '', format: '{value}' }] });
    }));
    const secondY = (calls: typeof one) => calls.find((call) => call.drawn === 'Zymos Brewing Second')!.y as number;
    expect(secondY(two)).toBeGreaterThan(secondY(one) + 25);
  });

  it('can include fixed text', async () => {
    const calls = (await textDrawn(modelOf(), changed((d) => {
      d.items.lines[0].parts.push({ field: 'text', text: 'On draft', before: ' | ', format: '({value})', style: { italic: true } });
    }))).map((call) => call.drawn);
    expect(calls).toContain(' | (On draft)');
  });

  it('wrap long names inside the margins instead of running past them', async () => {
    const long = item({ displayName: 'Barrel Aged Imperial Pastry Stout With Vanilla Cocoa Nibs And Toasted Coconut And More Words To Make It Long' });
    const image = await page(modelOf([['Drafts', [long]]]));
    expect(margin(image, 40)).toEqual([]);
  });

  it('show the menu logo in a circle by default, or the item\'s own', async () => {
    const image = await page(modelOf([['Drafts', [item(), item({ displayName: 'Own', itemLogo: ITEM_LOGO })]]]));
    // First row: top of the first row is the bar's bottom plus the row gap
    const rowTop = 40 + 150 + 10 + 52.5 + 10;
    expect(near(image.at(40 + 26, rowTop + 26), RED)).toBe(true);
    // The corner of the square the circle sits in is background
    expect(image.at(40 + 2, rowTop + 2)).toEqual(BG);
    // The second row's picture is the item's own
    let found = false;
    for (let y = rowTop + 50; y < rowTop + 150 && !found; y++) found = near(image.at(40 + 26, y), BLUE);
    expect(found).toBe(true);
  });

  it('can use the brewery\'s picture when an item has none', async () => {
    const breweryLogo = solidPng(40, 40, [10, 160, 10]);
    const model = modelOf([['Drafts', [item({ breweryLogo })]]]);
    const rowTop = 40 + 150 + 10 + 52.5 + 10;
    expect(near((await page(model)).at(66, rowTop + 26), RED)).toBe(true);
    expect(near((await page(model, changed((d) => { d.items.logo.source = 'item-then-brewery-then-menu'; }))).at(66, rowTop + 26), [10, 160, 10])).toBe(true);
  });

  it('can have square or rounded pictures', async () => {
    const rowTop = 40 + 150 + 10 + 52.5 + 10;
    const square = await page(modelOf(), changed((d) => { d.items.logo.shape = 'square'; }));
    expect(near(square.at(40 + 1, rowTop + 1), RED)).toBe(true);
    const rounded = await page(modelOf(), changed((d) => { d.items.logo.shape = 'rounded'; }));
    expect(rounded.at(40 + 1, rowTop + 1)).toEqual(BG);
    expect(near(rounded.at(40 + 26, rowTop + 1), RED)).toBe(true);
  });

  it('can leave the picture out, so the text starts at the margin', async () => {
    const withLogo = await textDrawn(modelOf());
    const without = await textDrawn(modelOf(), changed((d) => { d.items.logo.show = false; }));
    const x = (calls: typeof withLogo) => calls.find((call) => call.drawn === 'Zymos Brewing Hazy Sequence')!.x;
    expect(x(withLogo)).toBe(40 + 52.5 + 10);
    expect(x(without)).toBe(40);
  });

  it('draw no picture, and carry on, for a menu with no logo and an item with none', async () => {
    const image = await page(modelOf([['Drafts', [item()]]], null));
    expect(image.at(66, 40 + 10 + 52.5 + 10 + 26)).toEqual(BG);
  });

  it('are spaced by the design\'s row gap', async () => {
    const rows = [item(), item({ displayName: 'Second' })];
    const y = async (gapPx: number) => (await textDrawn(modelOf([['Drafts', rows]]), changed((d) => { d.items.gapPx = gapPx; }))).find((call) => call.drawn === 'Zymos Brewing Second')!.y as number;
    expect((await y(30)) - (await y(10))).toBe(20 + 10);
  });

  it('are not shorter than their picture, when the picture is the taller of the two', async () => {
    const design = changed((d) => { d.items.logo.sizePx = 200; d.items.lines[0].style.sizePx = 20; });
    const rows = [item(), item({ displayName: 'Second' })];
    const calls = await textDrawn(modelOf([['Drafts', rows]]), design);
    const y = (text: string) => calls.find((call) => call.drawn === text)!.y as number;
    expect(y('Zymos Brewing Second') - y('Zymos Brewing Hazy Sequence')).toBeGreaterThanOrEqual(200);
  });

  it('start a new page before they would run into the bottom', async () => {
    const pages = await renderBoardPages(modelOf([['Drafts', manyItems(40)]]), defaultBoardDesign());
    expect(pages.length).toBeGreaterThan(2);
  });
});

describe('type', () => {
  it('can be drawn in every font the board offers, in every weight and slant, with accents and symbols', async () => {
    const text = 'Crème Brûlée Ñandú — €5 “quoted” 🍺 ½';
    for (const font of FONTS.filter((entry) => entry.boardFiles?.length)) {
      for (const weight of [400, 700]) {
        for (const italic of [false, true]) {
          const design = changed((d) => {
            Object.assign(d.items.lines[0].style, { font: font.id, weight, italic });
            Object.assign(d.sections.bar.style, { font: font.id, weight, italic });
          });
          const pages = await renderBoardPages(modelOf([['Drafts', [item({ displayName: text })]]]), design);
          expect(pages, `${font.id} ${weight} ${italic}`).toHaveLength(1);
        }
      }
    }
  }, 120_000);

  it('can be spaced out and aligned', async () => {
    const design = changed((d) => {
      d.items.lines[0].style.letterSpacingEm = 0.1;
      d.items.lines[0].style.align = 'right';
      d.sections.bar.style.align = 'center';
    });
    const image = await page(modelOf(), design);
    expect(margin(image, 40)).toEqual([]);
  });
});

describe('the presets', () => {
  it.each(boardDesignPresets().map((preset) => [preset.id, preset.design] as const))('%s draws a full menu inside the margins', async (_id, design) => {
    const sections: Array<[string, PrintItem[]]> = [['Drafts', manyItems(14)], ['Guest Taps', manyItems(9)], ['Cans', manyItems(6)]];
    const pages = await renderBoardPages(modelOf(sections), design);
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const background = hex(design.canvas.background);
    for (const png of pages) {
      const image = decode(png);
      expect(image.at(2, 2)).toEqual(background);
      expect(margin(image, design.canvas.safeMarginPx, background)).toEqual([]);
    }
  });
});
