import { describe, expect, it } from 'vitest';
import * as mupdf from 'mupdf';
import { defaultPrintDesign, ITEM_FIELDS, PrintDesign, printDesignPresets } from '../../models/menuDesign';
import { describeFonts } from '../../models/fonts';
import { renderPrintPages, renderPrintPdf } from '../../print/pdf';
import { PrintItem, PrintModel } from '../../print/model';
import { GIF_HEADER, JPEG_HEADER, solidPng, TINY_PNG } from '../helpers';
import { hex, near, pageCount, pagePixels, pageSizes, plainText, textLines, textRows } from '../pdf';

// The print renderer on its own: a plain model and a design in, a PDF out. The PDF is read back for
// what it says (its text, fonts and positions) and for what it looks like (its pixels). How the data
// is gathered is covered with the routes (test/routes/menus.test.ts); how a design is checked, in
// test/models/menuDesign.test.ts.

const NOW = new Date('2026-03-05T12:00:00Z');
type Rgb = [number, number, number];
const RED_RGB: Rgb = [200, 40, 40];
const BLUE_RGB: Rgb = [30, 90, 200];
const WHITE = [255, 255, 255];
const RED = solidPng(40, 40, RED_RGB);
const BLUE = solidPng(40, 40, BLUE_RGB);

function item(overrides: Partial<PrintItem> = {}): PrintItem {
  return {
    breweryName: 'Example Brewery',
    breweryLocation: 'Nowhere, US',
    displayName: 'Hazy Sequence',
    style: 'NEIPA',
    abv: 6.5,
    description: 'Juicy',
    category: 'beer',
    itemLogo: null,
    breweryLogo: null,
    prices: new Map([['Full Pour', '8.00'], ['Taster', '3.00']]),
    ...overrides,
  };
}

function model(overrides: Partial<PrintModel> = {}, items: PrintItem[] = [item()]): PrintModel {
  return {
    menuName: 'Currently On Tap',
    menuLogo: RED,
    sections: [
      {
        id: 's1',
        name: 'Drafts',
        sizes: [
          { displayName: 'Taster', order: 1, containerIds: ['c1'] },
          { displayName: 'Full Pour', order: 2, containerIds: ['c2'] },
        ],
        items,
      },
    ],
    ...overrides,
  };
}

// `count` items with different names and a long description each
const manyItems = (count: number, extra: Partial<PrintItem> = {}) =>
  Array.from({ length: count }, (_, i) =>
    item({ displayName: `Beer number ${i + 1}`, description: 'Juicy and soft, with notes of mango, peach and a little pine on the finish. Brewed with oats.', ...extra }));

// A menu with several sections of many items each
function bigModel(sections = 4, perSection = 12): PrintModel {
  return model({
    sections: Array.from({ length: sections }, (_, s) => ({
      id: `s${s}`,
      name: `Section ${s + 1}`,
      sizes: [{ displayName: 'Full Pour', order: 1, containerIds: ['c2'] }],
      items: manyItems(perSection).map((it, i) => ({ ...it, displayName: `S${s + 1} beer ${i + 1}` })),
    })),
  });
}

function changed(change: (design: any) => void): PrintDesign {
  const design: any = structuredClone(defaultPrintDesign());
  change(design);
  return design;
}

const render = (m: PrintModel = model(), design: PrintDesign = defaultPrintDesign()) => renderPrintPdf(m, design, { now: NOW });
const pdfOf = async (m: PrintModel = model(), design: PrintDesign = defaultPrintDesign()) => (await render(m, design)).pdf;
type Rendered = Awaited<ReturnType<typeof render>>;

const margin = defaultPrintDesign().page.marginsIn;
const lineWith = (lines: ReturnType<typeof textLines>, text: string) => lines.find((line) => line.text.includes(text));
const rowWith = (pdf: Uint8Array, text: string) => textRows(pdf).find((row) => row.text.includes(text));
const centre = (line: { x: number; width: number }) => line.x + line.width / 2;
// The marks of one kind, in the order they were drawn
const marksOf = (rendered: Rendered, pick: string) => rendered.marks.filter((mark) => mark.pick === pick);
// A design with the item text in the given font, with no part styled differently
const inFont = (font: string, weight = 400, italic = false) =>
  changed((d) => {
    d.columns[0].lines[0].style = { ...d.columns[0].lines[0].style, font, weight, italic };
    d.columns[0].lines[0].parts.forEach((part: any) => { delete part.style; });
  });

describe('the default design', () => {
  it('makes a PDF of one letter page for a short menu', async () => {
    const { pdf, info } = await render();
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(pageSizes(pdf)).toEqual([{ width: 612, height: 792 }]);
    expect(info).toEqual({ pages: 1, maxPages: 2, fit: 'shrink-to-pages', fits: true, scale: 1 });
  });

  it('names the PDF after the menu', async () => {
    const doc = mupdf.Document.openDocument(await pdfOf(), 'application/pdf');
    expect(doc.getMetaData('info:Title')).toBe('Currently On Tap');
  });

  it('prints the item on one line, the description under it and a price under each size', async () => {
    const pdf = await pdfOf();
    const lines = textLines(pdf);
    expect(rowWith(pdf, 'Example Brewery')!.text).toContain('Example Brewery · Hazy Sequence · NEIPA · 6.5%');
    const description = lineWith(lines, 'Juicy')!;
    expect(description.y).toBeGreaterThan(lineWith(lines, 'Hazy Sequence')!.y);
    expect(description.size).toBeLessThan(lineWith(lines, 'Hazy Sequence')!.size);
    // Sizes are in the pour sizes' order, with the prices under them
    const [taster, fullPour] = [lineWith(lines, 'TASTER')!, lineWith(lines, 'FULL POUR')!];
    const [three, eight] = [lineWith(lines, '$3.00')!, lineWith(lines, '$8.00')!];
    expect(taster.x).toBeLessThan(fullPour.x);
    expect(three.x).toBeLessThan(eight.x);
    expect(three.y).toBeGreaterThan(taster.y);
    expect(Math.abs(centre(three) - centre(taster))).toBeLessThan(2);
    expect(Math.abs(centre(eight) - centre(fullPour))).toBeLessThan(2);
  });

  it('draws the name in bold and the rest of the line in regular type', async () => {
    const lines = textLines(await pdfOf());
    expect(lineWith(lines, 'Hazy Sequence')!.font).toMatch(/Bold/);
    expect(lineWith(lines, 'NEIPA')!.font).not.toMatch(/Bold/);
  });

  it('has no footer', async () => {
    const lines = textLines(await pdfOf());
    expect(Math.max(...lines.map((line) => line.y))).toBeLessThan(792 - 72 * margin.bottom);
  });
});

describe('what the page settings change', () => {
  it('sizes the page', async () => {
    expect(pageSizes(await pdfOf(model(), changed((d) => { d.page.size = 'legal'; })))).toEqual([{ width: 612, height: 1008 }]);
    const [a4] = pageSizes(await pdfOf(model(), changed((d) => { d.page.size = 'a4'; })));
    expect(a4.width).toBeCloseTo(595.28, 1);
    expect(a4.height).toBeCloseTo(841.89, 1);
  });

  it('keeps all the text inside the margins', async () => {
    const lines = textLines(await pdfOf(bigModel(), changed((d) => { d.page.marginsIn = { top: 1, right: 1.5, bottom: 1, left: 1 }; d.page.maxPages = null; })));
    for (const line of lines) {
      expect(line.x).toBeGreaterThanOrEqual(72 - 0.5);
      expect(line.x + line.width).toBeLessThanOrEqual(612 - 108 + 0.5);
      expect(line.y).toBeLessThanOrEqual(792 - 72);
    }
    expect(Math.min(...lines.map((line) => line.y))).toBeGreaterThanOrEqual(72);
  });

  it('paints the background color on every page', async () => {
    const pdf = await pdfOf(bigModel(), changed((d) => { d.page.background = '#FFEEDD'; d.page.maxPages = null; d.page.fit = 'none'; }));
    expect(pageCount(pdf)).toBeGreaterThan(1);
    for (let page = 1; page <= pageCount(pdf); page++) {
      expect(near(pagePixels(pdf, page).at(3, 3), hex('#ffeedd'))).toBe(true);
      expect(near(pagePixels(pdf, page).at(609, 789), hex('#ffeedd'))).toBe(true);
    }
  });

  it('shrinks the text until the menu fits its page limit', async () => {
    const m = bigModel();
    const loose = await render(m, changed((d) => { d.page.maxPages = null; }));
    expect(loose.info.scale).toBe(1);
    expect(loose.info.pages).toBeGreaterThan(2);

    const { pdf, info } = await render(m, changed((d) => { d.page.maxPages = 2; }));
    expect(info.pages).toBe(2);
    expect(info.fits).toBe(true);
    expect(info.scale).toBeLessThan(1);
    expect(pageCount(pdf)).toBe(2);
    // The text is that much smaller; the design says 10.5pt
    expect(lineWith(textLines(pdf), 'S1 beer 1')!.size).toBeCloseTo(10.5 * info.scale, 1);
    // ... and it is the largest size that fits: at full size it needs more pages
    expect((await render(m, changed((d) => { d.page.maxPages = 2; d.page.fit = 'none'; }))).info.pages).toBeGreaterThan(2);
  });

  it('keeps the sizes as they are when shrinking is off', async () => {
    const { pdf, info } = await render(bigModel(), changed((d) => { d.page.fit = 'none'; d.page.maxPages = 2; }));
    expect(info.scale).toBe(1);
    expect(info.pages).toBeGreaterThan(2);
    expect(info.fits).toBe(false);
    expect(lineWith(textLines(pdf), 'S1 beer 1')!.size).toBeCloseTo(10.5, 1);
  });

  it('does not shrink a menu that may have as many pages as it needs', async () => {
    const { info } = await render(bigModel(), changed((d) => { d.page.maxPages = null; }));
    expect(info).toMatchObject({ scale: 1, maxPages: null, fits: true });
  });

  it('says so when the menu cannot fit even at the smallest size, and still draws it', async () => {
    const { pdf, info } = await render(model({}, manyItems(400)), changed((d) => { d.page.maxPages = 1; }));
    expect(info.fits).toBe(false);
    expect(info.pages).toBeGreaterThan(1);
    expect(info.scale).toBeCloseTo(3 / 16, 3);
    expect(pageCount(pdf)).toBe(info.pages);
  });

  it('does not scale what is not text: the footer keeps its size', async () => {
    const design = changed((d) => { d.footer.show = true; d.footer.text = 'Open daily'; d.page.maxPages = 1; });
    const { pdf, info } = await render(bigModel(2, 10), design);
    expect(info.scale).toBeLessThan(1);
    expect(lineWith(textLines(pdf), 'Open daily')!.size).toBeCloseTo(design.footer.style.sizePt, 1);
  });
});

describe('the header', () => {
  const logoModel = () => model({ menuLogo: solidPng(200, 100, RED_RGB) });
  const logoTop = margin.top * 72 + 5;

  it('shows the menu logo in the middle, a tenth of the width wide, unless the design hides it', async () => {
    const pixels = pagePixels(await pdfOf(logoModel()), 1, 2);
    expect(near(pixels.at(306, logoTop), RED_RGB)).toBe(true);
    // 10% of the 540pt between the margins: 27pt either side of the middle
    expect(near(pixels.at(306 + 25, logoTop), RED_RGB)).toBe(true);
    expect(near(pixels.at(306 + 30, logoTop), WHITE)).toBe(true);
    expect(near(pixels.at(306 - 30, logoTop), WHITE)).toBe(true);
    const hidden = await render(logoModel(), changed((d) => { d.header.logo.show = false; }));
    expect(hidden.marks.some((mark) => mark.pick === 'header')).toBe(false);
    expect((await render(logoModel())).marks.some((mark) => mark.pick === 'header')).toBe(true);
  });

  it('puts the logo where the design says', async () => {
    const at = async (align: 'left' | 'right') => pagePixels(await pdfOf(logoModel(), changed((d) => { d.header.logo.align = align; })), 1, 2);
    const left = await at('left');
    expect(near(left.at(margin.left * 72 + 5, logoTop), RED_RGB)).toBe(true);
    expect(near(left.at(306, logoTop), WHITE)).toBe(true);
    const right = await at('right');
    expect(near(right.at(612 - margin.right * 72 - 5, logoTop), RED_RGB)).toBe(true);
    expect(near(right.at(306, logoTop), WHITE)).toBe(true);
  });

  it('makes the logo as wide as the design says, but no wider than its own size', async () => {
    // A 200px picture is 150pt wide
    const wide = pagePixels(await pdfOf(logoModel(), changed((d) => { d.header.logo.maxWidthPct = 50; })), 1, 2);
    expect(near(wide.at(306 + 70, logoTop), RED_RGB)).toBe(true);
    expect(near(wide.at(306 + 80, logoTop), WHITE)).toBe(true);
    // A 20px picture is 15pt wide, however much room it is given
    const small = pagePixels(await pdfOf(model({ menuLogo: solidPng(20, 20, RED_RGB) }), changed((d) => { d.header.logo.maxWidthPct = 50; })), 1, 2);
    expect(near(small.at(306 + 5, logoTop), RED_RGB)).toBe(true);
    expect(near(small.at(306 + 12, logoTop), WHITE)).toBe(true);
  });

  it('has no logo when the menu has none, or when what is stored is not a picture pdfkit can draw', async () => {
    for (const menuLogo of [null, '', 'not base64!', GIF_HEADER, JPEG_HEADER, '"><script>alert(1)</script>']) {
      const { pdf, marks } = await render(model({ menuLogo }));
      expect(marks.some((mark) => mark.pick === 'header'), String(menuLogo)).toBe(false);
      expect(plainText(pdf)).toContain('Hazy Sequence');
    }
  });

  it('can have a title with the menu name and the date in it', async () => {
    const pdf = await pdfOf(model(), changed((d) => { d.header.title.show = true; d.header.title.text = '{menu.name} — {date}'; d.header.title.style.transform = 'none'; d.header.title.style.sizePt = 12; }));
    expect(plainText(pdf)).toContain('Currently On Tap — March 5, 2026');
  });

  it('has no title by default, or when the title is blank', async () => {
    expect(plainText(await pdfOf())).not.toContain('Currently On Tap');
    expect(plainText(await pdfOf(model(), changed((d) => { d.header.title.show = true; d.header.title.text = '   '; })))).not.toContain('Currently');
  });

  it('shows the title in capitals when its style says so', async () => {
    expect(plainText(await pdfOf(model(), changed((d) => { d.header.title.show = true; })))).toContain('CURRENTLY ON TAP');
  });
});

describe('the footer', () => {
  const footerDesign = (text: string, more: (d: any) => void = () => {}) =>
    changed((d) => { d.footer.show = true; d.footer.text = text; more(d); });

  it('prints each line of its text, near the bottom of every page', async () => {
    const pdf = await pdfOf(bigModel(), footerDesign('WiFi: Example\nPassword: hops', (d) => { d.page.maxPages = null; d.page.fit = 'none'; }));
    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(1);
    for (let page = 1; page <= pages; page++) {
      const onPage = textLines(pdf).filter((line) => line.page === page);
      const wifi = lineWith(onPage, 'WiFi: Example')!;
      const password = lineWith(onPage, 'Password: hops')!;
      expect(wifi, `page ${page}`).toBeDefined();
      expect(password.y).toBeGreaterThan(wifi.y);
      expect(password.y).toBeLessThan(792 - 0.3 * 72 + 1);
      expect(wifi.y).toBeGreaterThan(792 - 72);
    }
  });

  it('centres its text, as its style says', async () => {
    const line = lineWith(textLines(await pdfOf(model(), footerDesign('Hi there'))), 'Hi there')!;
    expect(centre(line)).toBeCloseTo(306, 0);
  });

  it('draws a rule above its text, unless it is left out', async () => {
    const withRule = await render(model(), footerDesign('Hi'));
    const top = withRule.marks.find((mark) => mark.pick === 'footer')!;
    const sample = (pdf: Uint8Array) => pagePixels(pdf, 1, 4).at(306, top.y * 792 + 0.375);
    expect(near(sample(withRule.pdf), hex('#949494'), 12)).toBe(true);
    expect(near(sample(await pdfOf(model(), footerDesign('Hi', (d) => { d.footer.rule.show = false; }))), WHITE)).toBe(true);
  });

  it('expands {menu.name} and {date}', async () => {
    expect(plainText(await pdfOf(model(), footerDesign('{menu.name} on {date}')))).toContain('Currently On Tap on March 5, 2026');
  });

  it('does not expand what the menu name contains', async () => {
    const pdf = await pdfOf(model({ menuName: '{date}' }), footerDesign('{menu.name}'));
    expect(plainText(pdf)).toContain('{date}');
    expect(plainText(pdf)).not.toContain('March');
  });

  it('skips blank lines', async () => {
    const lines = textLines(await pdfOf(model(), footerDesign('One\n\n\nTwo')));
    const [one, two] = [lineWith(lines, 'One')!, lineWith(lines, 'Two')!];
    expect(two.y - one.y).toBeLessThan(one.size * 2);
  });
});

describe('sections', () => {
  const sectionNamed = (name: string) => ({ ...model().sections[0], name });

  it('names each one in its heading, in a box of its own color', async () => {
    const { pdf, marks } = await render(model({ sections: [sectionNamed('Ales & <Lagers>')] }));
    expect(plainText(pdf)).toContain('ALES & <LAGERS>');
    const box = marks.find((mark) => mark.pick === 'headings')!;
    const pixels = pagePixels(pdf, 1, 2);
    expect(near(pixels.at((box.x + box.width / 2) * 612, (box.y + box.height - 0.002) * 792), hex('#2b2d42'))).toBe(true);
    expect(near(pixels.at(10, (box.y + box.height / 2) * 792), WHITE)).toBe(true);
  });

  it('wraps a long name inside its box and grows the box to hold it', async () => {
    const long = 'A very long section name that cannot possibly fit on one line of the heading';
    const one = await render(model());
    const wrapped = await render(model({ sections: [sectionNamed(long)] }));
    const box = wrapped.marks.find((mark) => mark.pick === 'headings')!;
    const headingLines = textLines(wrapped.pdf).filter((line) => Math.abs(line.size - 15) < 0.1);
    expect(headingLines.length).toBeGreaterThan(1);
    for (const line of headingLines) expect(line.x + line.width).toBeLessThanOrEqual((box.x + box.width) * 612);
    expect(box.height).toBeGreaterThan(one.marks.find((mark) => mark.pick === 'headings')!.height * 1.5);
  });

  it('draws every section, including one with nothing in it', async () => {
    const m = model();
    m.sections.push({ id: 's2', name: 'Empty', sizes: [], items: [] });
    const text = plainText(await pdfOf(m));
    expect(text).toContain('DRAFTS');
    expect(text).toContain('EMPTY');
  });

  it('styles the heading from the design', async () => {
    const { pdf, marks } = await render(model(), changed((d) => {
      d.sections.heading.style.font = 'oswald';
      d.sections.heading.style.sizePt = 30;
      d.sections.heading.style.transform = 'none';
      d.sections.heading.style.letterSpacingEm = 0;
      d.sections.heading.box.border = { widthPx: 8, style: 'solid', color: '#FF0000' };
      d.sections.heading.box.background = '#00ff00';
      d.sections.heading.box.radiusPx = 0;
    }));
    const heading = lineWith(textLines(pdf), 'Drafts')!;
    expect(heading.font).toMatch(/Oswald/);
    expect(heading.size).toBeCloseTo(30, 1);
    const box = marks.find((mark) => mark.pick === 'headings')!;
    const pixels = pagePixels(pdf, 1, 4);
    const middle = (box.y + box.height / 2) * 792;
    // The 6pt border is red all round, and what is inside it is the background
    expect(near(pixels.at(box.x * 612 + 2, middle), [255, 0, 0])).toBe(true);
    expect(near(pixels.at(box.x * 612 + 30, box.y * 792 + 2), [255, 0, 0])).toBe(true);
    expect(near(pixels.at(box.x * 612 + 12, middle + 10), [0, 255, 0])).toBe(true);
  });

  it('draws a heading box with no background, and any border or corner, without trouble', async () => {
    for (const style of ['solid', 'dashed', 'dotted', 'double', 'none'] as const) {
      const pdf = await pdfOf(model(), changed((d) => {
        d.sections.heading.box.background = null;
        d.sections.heading.box.border = { widthPx: 6, style, color: '#112233' };
        d.sections.heading.box.radiusPx = 10;
      }));
      expect(plainText(pdf), style).toContain('DRAFTS');
    }
  });

  it('puts the space between sections where the design says, but none at the top of a page', async () => {
    const two = model();
    two.sections.push({ ...two.sections[0], id: 's2', name: 'More' });
    const gap = async (rem: number) => {
      const [first, second] = marksOf(await render(two, changed((d) => { d.sections.gapAboveRem = rem; })), 'headings');
      return (second.y - first.y) * 792;
    };
    expect((await gap(3)) - (await gap(0))).toBeCloseTo(36, 0);
    const { marks } = await render(two, changed((d) => { d.sections.gapAboveRem = 3; d.header.logo.show = false; }));
    expect(marks.find((mark) => mark.pick === 'headings')!.y * 792).toBeCloseTo(margin.top * 72, 0);
  });

  it('can be narrower than the page, and centred', async () => {
    const { marks } = await render(model(), changed((d) => { d.sections.widthPct = 50; }));
    const box = marks.find((mark) => mark.pick === 'headings')!;
    expect(box.width * 612).toBeCloseTo(270, 0);
    expect((box.x + box.width / 2) * 612).toBeCloseTo(306, 0);
  });
});

describe('lines of item text', () => {
  // The rows of text in the item column (not the prices), without the section heading
  const itemRows = async (items: PrintItem[], design: PrintDesign = defaultPrintDesign()) =>
    textRows(await pdfOf(model({}, items), design), [0, 330]).filter((row) => row.lines[0].size < 12).map((row) => row.text);

  it('leaves out a field the item does not have, along with the separator before it', async () => {
    expect(await itemRows([item({ breweryName: null, style: null })])).toContain('Hazy Sequence · 6.5%');
    expect(await itemRows([item({ style: null })])).toContain('Example Brewery · Hazy Sequence · 6.5%');
  });

  it('starts the line with no separator when the first fields are missing', async () => {
    const rows = await itemRows([item({ breweryName: null })]);
    expect(rows).toContain('Hazy Sequence · NEIPA · 6.5%');
    expect(rows.filter((row) => row.startsWith('·'))).toEqual([]);
  });

  it('prints an ABV of 0 and leaves out a missing one', async () => {
    expect(await itemRows([item({ abv: 0 })])).toContain('Example Brewery · Hazy Sequence · NEIPA · 0%');
    expect((await itemRows([item({ abv: null })])).join('\n')).not.toMatch(/\d%/);
  });

  it('treats blank text as missing', async () => {
    expect(await itemRows([item({ style: '   ' })])).toContain('Example Brewery · Hazy Sequence · 6.5%');
  });

  it('leaves out a whole line when every part of it is empty, and keeps the other lines', async () => {
    expect(await itemRows([item({ breweryName: null, displayName: '', style: null, abv: null })])).toEqual(['Juicy']);
  });

  it('gives an item with no description no second row', async () => {
    // The prices are in the first row of each item, so the distance between them is an item's height
    const spacing = async (description: string | null) => {
      const [, first, second] = marksOf(await render(model({}, [item({ description }), item({ description })])), 'column:prices');
      return second.y - first.y;
    };
    expect(await spacing(null)).toBeLessThan(await spacing('Juicy'));
  });

  it('has no second row when no column has lines for it', async () => {
    const lastItemTop = async (design: PrintDesign) => marksOf(await render(model({}, [item(), item()]), design), 'column:item').at(-1)!.y;
    expect(await lastItemTop(changed((d) => { d.columns[0].belowLines = []; }))).toBeLessThan(await lastItemTop(defaultPrintDesign()));
  });

  it('prints fixed text and any field in any order', async () => {
    const design = changed((d) => {
      d.columns[0].lines = [{
        style: d.columns[0].lines[0].style,
        parts: [
          { field: 'style', before: '', format: '[{value}]' },
          { field: 'text', text: 'Draft', before: ' / ', format: '{value}!' },
          { field: 'breweryLocation', before: ' / ', format: '{value}' },
          { field: 'category', before: ' / ', format: '{value}' },
        ],
      }];
    });
    expect(await itemRows([item()], design)).toContain('[NEIPA] / Draft! / Nowhere, US / beer');
  });

  it('puts a value in whole, even if it looks like a replacement pattern', async () => {
    const design = changed((d) => { d.columns[0].lines[0].parts = [{ field: 'displayName', before: '', format: '<{value}>' }]; });
    expect(await itemRows([item({ displayName: "$& $1 $' $`" })], design)).toContain("<$& $1 $' $`>");
  });

  it('styles a part differently from its line', async () => {
    const lines = textLines(await pdfOf());
    expect(lineWith(lines, 'Hazy Sequence')!.font).toMatch(/Bold/);
    expect(lineWith(lines, 'Example Brewery')!.font).not.toMatch(/Bold/);
    // The brewery is greyer than the rest of the line (#555555 against #222222): look at the pixels
    const pixels = pagePixels(await pdfOf(), 1, 4);
    const darkest = (line: { x: number; y: number; width: number }) => {
      let best = 255;
      for (let x = line.x; x < line.x + line.width; x += 0.25) {
        for (let y = line.y - 6; y < line.y; y += 0.25) best = Math.min(best, pixels.at(x, y)[0]);
      }
      return best;
    };
    expect(darkest(lineWith(lines, 'Example Brewery')!)).toBeGreaterThan(darkest(lineWith(lines, 'NEIPA')!));
  });

  it('collapses runs of white space and line breaks, as a web page would', async () => {
    const rows = await itemRows([item({ displayName: 'Hazy    \n  Sequence', description: 'one\n\ntwo   three' })]);
    expect(rows).toContain('Example Brewery · Hazy Sequence · NEIPA · 6.5%');
    expect(rows).toContain('one two three');
  });

  it('wraps a long description inside its column, as many lines as it needs', async () => {
    const description = 'Juicy and soft, with notes of mango, peach, a little pine and a long dry finish that goes on and on and on for quite a while';
    const { pdf, marks } = await render(model({}, [item({ description })]));
    const column = marks.find((mark) => mark.pick === 'column:item')!;
    const right = (column.x + column.width) * 612;
    const rows = textRows(pdf, [0, 330]).filter((row) => row.lines[0].size < 10);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((row) => row.text).join(' ')).toBe(description);
    for (const row of rows) for (const line of row.lines) expect(line.x + line.width).toBeLessThanOrEqual(right + 0.5);
  });

  it('cuts a word that is longer than its column instead of running off the page', async () => {
    const word = 'Supercalifragilisticexpialidocious'.repeat(4);
    const { pdf, marks } = await render(model({}, [item({ description: word })]));
    const column = marks.find((mark) => mark.pick === 'column:item')!;
    const pieces = textLines(pdf).filter((line) => line.font.includes('Italic'));
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.map((line) => line.text).join('')).toBe(word);
    for (const line of pieces) expect(line.x + line.width).toBeLessThanOrEqual((column.x + column.width) * 612 + 0.5);
  });

  it('honours the alignment and line height of a line', async () => {
    const design = changed((d) => { d.columns[0].lines[0].style.align = 'right'; d.columns[0].lines[0].style.lineHeight = 3; });
    const spacing = async (d: PrintDesign) => {
      const [first, , second] = marksOf(await render(model({}, [item(), item()]), d), 'column:item');
      return second.y - first.y;
    };
    expect(await spacing(design)).toBeGreaterThan(await spacing(defaultPrintDesign()));

    const { pdf, marks } = await render(model({}, [item()]), design);
    const column = marks.find((mark) => mark.pick === 'column:item')!;
    const row = rowWith(pdf, 'Hazy Sequence')!;
    const last = row.lines.filter((line) => !line.text.startsWith('$')).at(-1)!;
    // Flush with the right edge of the column, less its 0.75pt of padding
    expect(last.x + last.width).toBeCloseTo((column.x + column.width) * 612 - 0.75, 0);
  });
});

describe('prices', () => {
  it('leaves the cell empty for a size an item does not come in, with no stray $', async () => {
    const lines = textLines(await pdfOf(model({}, [item({ prices: new Map([['Full Pour', '8.00']]) })])));
    expect(lines.filter((line) => line.text.includes('$'))).toHaveLength(1);
    // It sits under the Full Pour heading, not under Taster
    expect(Math.abs(centre(lineWith(lines, '$8.00')!) - centre(lineWith(lines, 'FULL POUR')!))).toBeLessThan(2);
  });

  it('formats the price as the design says', async () => {
    const text = plainText(await pdfOf(model(), changed((d) => { d.columns[1].cell.format = '{value} USD'; })));
    expect(text).toContain('3.00 USD');
    expect(text).not.toContain('$');
  });

  it('can leave the size headings off', async () => {
    const text = plainText(await pdfOf(model(), changed((d) => { d.columns[1].heading.show = false; })));
    expect(text).not.toContain('TASTER');
    expect(text).toContain('$3.00');
  });

  it('can show only some of the pour sizes', async () => {
    const text = plainText(await pdfOf(model(), changed((d) => { d.columns[1].sizes = ['c2']; })));
    expect(text).toContain('FULL POUR');
    expect(text).toContain('$8.00');
    expect(text).not.toContain('TASTER');
    expect(text).not.toContain('$3.00');
  });

  it("lines each section's prices up under its own sizes", async () => {
    const m = model();
    m.sections.push({ id: 's2', name: 'Cans', sizes: [{ displayName: 'Can', order: 1, containerIds: ['c3'] }], items: [item({ prices: new Map([['Can', '6.00']]) })] });
    const lines = textLines(await pdfOf(m));
    expect(Math.abs(centre(lineWith(lines, '$6.00')!) - centre(lines.find((line) => line.text === 'CAN')!))).toBeLessThan(2);
  });

  it('puts the prices in the middle of the item row, whatever the text beside them', async () => {
    const rendered = await render(model());
    const [, cell] = marksOf(rendered, 'column:prices');
    const price = lineWith(textLines(rendered.pdf), '$8.00')!;
    expect(price.y).toBeGreaterThan(cell.y * 792);
    expect(price.y).toBeLessThan((cell.y + cell.height) * 792);
  });
});

describe('thumbnails', () => {
  const withThumb = (source: 'item-then-menu' | 'item-then-brewery-then-menu' = 'item-then-menu', shape: 'circle' | 'rounded' | 'square' = 'square') =>
    changed((d) => {
      d.columns.unshift({ id: 'pic', type: 'thumbnail', sizePx: 40, shape, source });
      d.columns[1].widthPct = 60;
    });

  // Where the first item's picture is, and what the page looks like there
  async function pictureOf(m: PrintModel, design: PrintDesign) {
    const rendered = await render(m, design);
    const [cell] = marksOf(rendered, 'column:pic');
    const pixels = pagePixels(rendered.pdf, 1, 2);
    // The picture is 30pt square, at the left of its cell inside the cell's 0.75pt of padding
    const left = cell.x * 612 + 0.75;
    const middle = (cell.y + cell.height / 2) * 792;
    return { pixels, left, middle, centre: pixels.at(left + 15, middle) };
  }

  it("shows the item's own picture, falling back to the menu's logo", async () => {
    expect(near((await pictureOf(model({}, [item({ itemLogo: BLUE })]), withThumb())).centre, BLUE_RGB)).toBe(true);
    expect(near((await pictureOf(model({}, [item()]), withThumb())).centre, RED_RGB)).toBe(true);
  });

  it('only uses the brewery picture when the design says to', async () => {
    const m = model({}, [item({ breweryLogo: BLUE })]);
    expect(near((await pictureOf(m, withThumb())).centre, RED_RGB)).toBe(true);
    expect(near((await pictureOf(m, withThumb('item-then-brewery-then-menu'))).centre, BLUE_RGB)).toBe(true);
  });

  it('leaves an empty cell for an item with no picture to show', async () => {
    expect(near((await pictureOf(model({ menuLogo: null }, [item()]), withThumb())).centre, WHITE)).toBe(true);
    expect(near((await pictureOf(model({ menuLogo: GIF_HEADER }, [item({ itemLogo: JPEG_HEADER })]), withThumb())).centre, WHITE)).toBe(true);
  });

  it('cuts the picture to the shape, and fills the shape with it', async () => {
    const wide = model({}, [item({ itemLogo: solidPng(100, 50, BLUE_RGB) })]);
    for (const [shape, corner] of [['circle', WHITE], ['rounded', WHITE], ['square', BLUE_RGB]] as const) {
      const { pixels, left, middle } = await pictureOf(wide, withThumb('item-then-menu', shape));
      expect(near(pixels.at(left + 15, middle), BLUE_RGB), shape).toBe(true);
      expect(near(pixels.at(left + 0.4, middle - 14.6), corner), `${shape} corner`).toBe(true);
      // Filled to its sides, though the picture is twice as wide as it is tall
      expect(near(pixels.at(left + 1.5, middle), BLUE_RGB), `${shape} side`).toBe(true);
    }
  });

  it('makes the row as tall as the picture needs', async () => {
    const design = changed((d) => { d.columns.unshift({ id: 'pic', type: 'thumbnail', sizePx: 120, shape: 'square', source: 'item-then-menu' }); d.columns[1].widthPct = 50; });
    const [first, second] = marksOf(await render(model({}, [item(), item()]), design), 'column:pic');
    // 120px is 90pt
    expect((second.y - first.y) * 792).toBeGreaterThan(90);
  });
});

describe('item rows', () => {
  it('can have a divider under each item', async () => {
    const withLine = await render(model(), changed((d) => { d.rows.divider = { show: true, color: '#ABCDEF', widthPx: 4, style: 'solid' }; }));
    const divider = withLine.marks.find((mark) => mark.pick === 'rows')!;
    expect(near(pagePixels(withLine.pdf, 1, 4).at(306, (divider.y + divider.height) * 792 - 1.5), hex('#abcdef'))).toBe(true);
    const without = await render(model(), changed((d) => { d.rows.divider.show = false; }));
    expect(without.marks.some((mark) => mark.pick === 'rows')).toBe(false);
  });

  it('draws dashed and dotted dividers with gaps in them', async () => {
    for (const style of ['dashed', 'dotted'] as const) {
      const { pdf, marks } = await render(model(), changed((d) => { d.rows.divider = { show: true, color: '#000000', widthPx: 4, style }; }));
      const divider = marks.find((mark) => mark.pick === 'rows')!;
      const pixels = pagePixels(pdf, 1, 4);
      const y = (divider.y + divider.height) * 792 - 1.5;
      const dark: boolean[] = [];
      for (let x = 100; x < 500; x += 0.5) dark.push(near(pixels.at(x, y), [0, 0, 0], 80));
      expect(dark.some(Boolean), style).toBe(true);
      expect(dark.some((value) => !value), style).toBe(true);
    }
  });

  it('can space items apart', async () => {
    const distance = async (gapRem: number, divider: boolean) => {
      const [first, , second] = marksOf(await render(model({}, [item(), item()]), changed((d) => { d.rows.gapRem = gapRem; d.rows.divider.show = divider; })), 'column:item');
      return (second.y - first.y) * 792;
    };
    for (const divider of [true, false]) expect((await distance(2.5, divider)) - (await distance(0, divider))).toBeCloseTo(30, 0);
  });
});

describe('pages', () => {
  const noShrink = (more: (d: any) => void = () => {}) => changed((d) => { d.page.fit = 'none'; d.page.maxPages = null; more(d); });

  it('starts the next page when an item does not fit, and never splits one', async () => {
    const pdf = await pdfOf(model({}, manyItems(40)), noShrink());
    expect(pageCount(pdf)).toBeGreaterThan(1);
    const lines = textLines(pdf);
    for (let i = 1; i <= 40; i++) {
      const name = lines.find((line) => line.text.trim() === `Beer number ${i}`);
      expect(name, `Beer number ${i}`).toBeDefined();
      // Its description is on the same page, just below it
      const description = lines.find((line) => line.page === name!.page && line.y > name!.y && line.y < name!.y + 40 && line.text.includes('Juicy'));
      expect(description, `description of ${i}`).toBeDefined();
    }
  });

  it('keeps every page inside its margins, and starts each one at the top margin', async () => {
    const pdf = await pdfOf(model({ menuLogo: null }, manyItems(40)), noShrink());
    const lines = textLines(pdf);
    for (let page = 1; page <= pageCount(pdf); page++) {
      const onPage = lines.filter((line) => line.page === page);
      expect(Math.min(...onPage.map((line) => line.y))).toBeGreaterThanOrEqual(margin.top * 72);
      expect(Math.min(...onPage.map((line) => line.y))).toBeLessThan(margin.top * 72 + 30);
      expect(Math.max(...onPage.map((line) => line.y))).toBeLessThan(792 - margin.bottom * 72);
    }
  });

  it('never leaves a section heading alone at the bottom of a page: it moves with its first item', async () => {
    // Sections of different lengths, so some heading is bound to land near the end of a page
    for (const perSection of [5, 7, 9, 11, 13]) {
      const lines = textLines(await pdfOf(bigModel(5, perSection), noShrink()));
      for (const heading of lines.filter((line) => /^SECTION \d$/.test(line.text))) {
        const itemBelow = lines.find((line) => line.page === heading.page && line.y > heading.y && /beer \d+$/.test(line.text) && line.y < heading.y + 90);
        expect(itemBelow, `${heading.text} on page ${heading.page} (${perSection} each)`).toBeDefined();
      }
    }
  });

  it('carries on with the rest of a section on the next page, without its heading again', async () => {
    const pdf = await pdfOf(bigModel(1, 40), noShrink());
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(textLines(pdf).filter((line) => line.text === 'SECTION 1')).toHaveLength(1);
    expect(textLines(pdf).filter((line) => line.page === 2 && /beer/.test(line.text)).length).toBeGreaterThan(0);
  });

  it('draws an item taller than a page, rather than getting stuck on it', async () => {
    const huge = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ');
    const text = plainText(await pdfOf(model({}, [item({ displayName: 'Before' }), item({ description: huge }), item({ displayName: 'After' })]), noShrink()));
    expect(text).toContain('Before');
    expect(text).toContain('After');
    expect(text).toContain('word0');
  });

  it('draws an empty menu as one blank page', async () => {
    const { pdf, info } = await render(model({ sections: [], menuLogo: null }));
    expect(pageCount(pdf)).toBe(1);
    expect(info.pages).toBe(1);
  });

  it('lays out a long menu quickly, however many sizes it is fitted at', async () => {
    const started = Date.now();
    const { info } = await render(bigModel(6, 12), changed((d) => { d.page.maxPages = 3; }));
    expect(info).toMatchObject({ pages: 3, fits: true });
    expect(Date.now() - started).toBeLessThan(10000);
  });
});

describe('fonts', () => {
  it('draws with every font the catalog has, in every weight and slant it offers', async () => {
    for (const font of describeFonts('print')) {
      for (const weight of font.weights) {
        for (const italic of font.italic ? [false, true] : [false]) {
          const line = lineWith(textLines(await pdfOf(model(), inFont(font.id, weight, italic))), 'Example Brewery');
          expect(line, `${font.id} ${weight}${italic ? ' italic' : ''}`).toBeDefined();
        }
      }
    }
  });

  it('uses the font the design asks for', async () => {
    const fontOf = async (id: string, weight = 400, italic = false) => lineWith(textLines(await pdfOf(model(), inFont(id, weight, italic))), 'Example Brewery')!.font;
    expect(await fontOf('oswald')).toMatch(/Oswald/);
    expect(await fontOf('playfair-display', 700, true)).toMatch(/Playfair.*BoldItal/);
    expect(await fontOf('system-serif')).toMatch(/Times/);
    expect(await fontOf('system-serif', 700)).toMatch(/Times.*Bold/);
    expect(await fontOf('system-sans', 400, true)).toMatch(/Helvetica.*Oblique/);
  });

  it('uses the nearest weight the font really has', async () => {
    expect(lineWith(textLines(await pdfOf(model(), inFont('montserrat', 300))), 'Example Brewery')!.font).not.toMatch(/Bold/);
    expect(lineWith(textLines(await pdfOf(model(), inFont('montserrat', 600))), 'Example Brewery')!.font).toMatch(/Bold/);
  });

  it('only puts the fonts the design uses into the PDF', async () => {
    const text = async (design?: PrintDesign) => Buffer.from(await pdfOf(model(), design)).toString('latin1');
    expect(await text()).toContain('Montserrat');
    expect(await text()).not.toContain('Oswald');
    expect(await text(changed((d) => { d.sections.heading.style.font = 'oswald'; }))).toContain('Oswald');
  });

  it('keeps letter spacing in the widths, so text does not run into its neighbours', async () => {
    const width = async (em: number) => textLines(await pdfOf(model(), changed((d) => { d.sections.heading.style.letterSpacingEm = em; }))).find((line) => line.color === '#ffffff')!.width;
    expect(await width(0.5)).toBeGreaterThan((await width(0)) * 1.4);
  });
});

describe('a design that is not valid', () => {
  it('is not drawn', async () => {
    await expect(render(model(), changed((d) => { d.page.maxPages = 0; }))).rejects.toThrow(/Invalid print design/);
    await expect(render(model(), changed((d) => { d.sections.heading.style.color = 'red;}'; }))).rejects.toThrow(/Invalid print design/);
  });
});

describe('any text at all', () => {
  const HOSTILE = [
    '</style><script>alert(1)</script>',
    '"><img src=x onerror=alert(3)>',
    "'; alert(4); //",
    '  ',
    '&lt;&amp;',
    '{value}{value}',
    '{menu.name}{date}',
    '😀 café ½ — “quotes” …',
    'שלום עולם العربية',
    '​‍﻿ zero width',
    'x'.repeat(300),
    '(((unbalanced \\ parens)',
  ];

  it.each(HOSTILE)('is drawn without trouble, in every place the data can show up: %j', async (hostile) => {
    const { pdf } = await render(
      model(
        { menuName: hostile },
        [item({ breweryName: hostile, breweryLocation: hostile, displayName: hostile, style: hostile, description: hostile, category: hostile, prices: new Map([['Full Pour', hostile]]) })],
      ),
      changed((d) => {
        d.header.title.show = true;
        d.footer.show = true;
        d.footer.text = '{menu.name}';
        d.columns[0].lines.push({
          style: d.columns[0].lines[0].style,
          parts: ITEM_FIELDS.filter((field) => field !== 'text').map((field) => ({ field, before: ' ', format: '{value}' })),
        });
      }),
    );
    expect(pageCount(pdf)).toBeGreaterThan(0);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
  });

  it('shows text that looks like markup as the text it is', async () => {
    expect(plainText(await pdfOf(model({}, [item({ description: '<b>bold</b> & "quoted"' })])))).toContain('<b>bold</b> & "quoted"');
  });

  it('draws text written into the design', async () => {
    const text = '(unbalanced \\ <script>';
    const pdf = await pdfOf(model(), changed((d) => {
      d.header.title.show = true;
      d.header.title.text = text;
      d.footer.show = true;
      d.footer.text = text;
      d.columns[0].lines[0].parts = [{ field: 'text', text, before: '', format: `${text}{value}` }];
      d.columns[1].cell.format = `${text}{value}`;
    }));
    expect(plainText(pdf)).toContain(text);
  });
});

describe('pictures that are not pictures', () => {
  const thumbDesign = () => changed((d) => {
    d.columns.unshift({ id: 'pic', type: 'thumbnail', sizePx: 40, shape: 'circle', source: 'item-then-brewery-then-menu' });
    d.columns[1].widthPct = 60;
  });

  it('are left out, without taking the menu down', async () => {
    for (const bad of ['', 'not base64!', GIF_HEADER, JPEG_HEADER, TINY_PNG.slice(0, 40), 'abc");background:url(x']) {
      const pdf = await pdfOf(model({ menuLogo: bad }, [item({ itemLogo: bad, breweryLogo: bad })]), thumbDesign());
      expect(plainText(pdf), JSON.stringify(bad)).toContain('Hazy Sequence');
    }
  });

  it('ignore white space in what is stored', async () => {
    const wrapped = `${RED.slice(0, 10)}\n${RED.slice(10)}`;
    const design = changed((d) => { d.columns.unshift({ id: 'pic', type: 'thumbnail', sizePx: 40, shape: 'square', source: 'item-then-menu' }); d.columns[1].widthPct = 60; });
    const { pdf, marks } = await render(model({ menuLogo: wrapped }), design);
    const [cell] = marks.filter((mark) => mark.pick === 'column:pic');
    expect(near(pagePixels(pdf, 1, 2).at((cell.x + cell.width / 2) * 612, (cell.y + cell.height / 2) * 792), RED_RGB)).toBe(true);
  });

  it('are embedded once, however many rows show them', async () => {
    const images = (pdf: Uint8Array) => (Buffer.from(pdf).toString('latin1').match(/\/Subtype \/Image/g) ?? []).length;
    const [one, forty] = await Promise.all([pdfOf(model({}, [item()]), thumbDesign()), pdfOf(model({}, manyItems(40)), thumbDesign())]);
    expect(images(forty)).toBe(images(one));
  });
});

describe('the presets', () => {
  it('each render the same menu with their own look', async () => {
    const fontsUsed: string[] = [];
    for (const preset of printDesignPresets()) {
      const { pdf, info } = await render(bigModel(3, 8), preset.design);
      const text = plainText(pdf);
      expect(info.fits, preset.id).toBe(true);
      expect(text.toLowerCase()).toContain('section 1');
      expect(text).toContain('S1 beer 1');
      expect(text).toContain('$8.00');
      fontsUsed.push((Buffer.from(pdf).toString('latin1').match(/\/FontName \/[A-Z]{6}\+[A-Za-z-]+/g) ?? []).join());
    }
    expect(new Set(fontsUsed).size).toBe(fontsUsed.length);
    expect(fontsUsed[0]).toContain('Montserrat');
    expect(fontsUsed[1]).toContain('Playfair');
  });
});

describe('the marks for the designer', () => {
  it('say where each part of the menu is, by the group of controls that changes it', async () => {
    const { marks } = await render(model(), changed((d) => { d.header.title.show = true; d.rows.divider.show = true; d.footer.show = true; d.footer.text = 'x'; }));
    expect([...new Set(marks.map((mark) => mark.pick))].sort()).toEqual(['column:item', 'column:prices', 'footer', 'header', 'headings', 'page', 'rows']);
    for (const mark of marks) {
      expect(mark.page).toBe(1);
      expect(mark.width).toBeGreaterThan(0);
      expect(mark.height).toBeGreaterThan(0);
      expect(mark.x).toBeGreaterThanOrEqual(0);
      expect(mark.y).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.width).toBeLessThanOrEqual(1.0001);
      expect(mark.y + mark.height).toBeLessThanOrEqual(1.0001);
    }
    // The page comes first, so what is on it can be put above it
    expect(marks[0].pick).toBe('page');
  });

  it('only mark cells that have something in them', async () => {
    const withThumb = changed((d) => { d.columns.unshift({ id: 'pic', type: 'thumbnail', sizePx: 30, shape: 'circle', source: 'item-then-menu' }); d.columns[1].widthPct = 60; });
    const rendered = await render(model({}, [item(), item()]), withThumb);
    // The item column has a row of text and a row of description for each item; the picture only one row
    expect(marksOf(rendered, 'column:item')).toHaveLength(4);
    expect(marksOf(rendered, 'column:pic')).toHaveLength(2);
    // The prices have the size headings above them
    expect(marksOf(rendered, 'column:prices')).toHaveLength(3);
  });

  it('name columns by their (validated) IDs, and the page each part is on', async () => {
    const { marks } = await render(bigModel(), changed((d) => { d.columns[0].id = 'item-1_a'; d.page.maxPages = null; d.page.fit = 'none'; }));
    expect(marks.some((mark) => mark.pick === 'column:item-1_a')).toBe(true);
    expect(new Set(marks.map((mark) => mark.page)).size).toBeGreaterThan(1);
  });

  it('follow where the text really is', async () => {
    const { pdf, marks } = await render(model());
    const column = marks.find((mark) => mark.pick === 'column:item')!;
    const name = lineWith(textLines(pdf), 'Hazy Sequence')!;
    expect(name.x / 612).toBeGreaterThanOrEqual(column.x);
    expect(name.y / 792).toBeGreaterThan(column.y);
    expect(name.y / 792).toBeLessThan(column.y + column.height);
  });
});

describe('the pictures of the pages', () => {
  it('are one PNG a page, at the size asked for, with how the menu came out', async () => {
    const { pages, info, marks } = await renderPrintPages(bigModel(), changed((d) => { d.page.maxPages = 2; }), { now: NOW, scale: 1.25 });
    expect(pages).toHaveLength(2);
    expect(info.pages).toBe(2);
    expect(marks.length).toBeGreaterThan(10);
    const image = new mupdf.Image(pages[0]);
    expect(image.getWidth()).toBe(765);
    expect(image.getHeight()).toBe(990);
  });
});
