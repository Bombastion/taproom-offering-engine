import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { defaultPrintDesign, designFonts, DESIGN_VIEWS, isDesignView, MAX_DESIGN_BYTES, parsePrintDesign, PrintDesign, printDesignPresets } from '../../models/menuDesign';
import { describeFonts, FONTS, fontFaceCss, fontStack, getFont } from '../../models/fonts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function parseOk(raw: unknown): PrintDesign {
  const result = parsePrintDesign(raw);
  if (!result.ok) throw new Error(`Expected a valid design: ${JSON.stringify(result.issues)}`);
  return result.design;
}

function issuesFor(raw: unknown) {
  const result = parsePrintDesign(raw);
  if (result.ok) throw new Error('Expected the design to be rejected');
  return result.issues;
}

// A design with one thing changed, built from a deep copy of the default
function changed(change: (design: any) => void) {
  const design: any = structuredClone(defaultPrintDesign());
  change(design);
  return design;
}

describe('the default print design', () => {
  it('is valid, and parsing it changes nothing', () => {
    expect(parseOk(defaultPrintDesign())).toEqual(defaultPrintDesign());
  });

  it('is a fresh copy every time, so editing one cannot change the next', () => {
    const first = defaultPrintDesign();
    first.columns.pop();
    first.page.maxPages = 9;
    expect(defaultPrintDesign().columns).toHaveLength(2);
    expect(defaultPrintDesign().page.maxPages).toBe(2);
  });

  it("has today's print menu in it", () => {
    const design = defaultPrintDesign();
    expect(design.page).toMatchObject({ size: 'letter', maxPages: 2, fit: 'shrink-to-pages', marginsIn: { top: 0.5, right: 0.3, bottom: 0.75, left: 0.3 } });
    expect(design.sections.heading.style).toMatchObject({ font: 'roboto', sizePt: 18, color: '#3f3f3f', align: 'center' });
    expect(design.sections.heading.box.border).toEqual({ widthPx: 3, style: 'solid', color: '#949494' });
    expect(design.columns.map((column) => column.type)).toEqual(['fields', 'prices']);
    expect(design.footer.show).toBe(false);
  });

  it('is offered as the Classic preset', () => {
    expect(printDesignPresets().map((preset) => preset.id)).toEqual(['classic']);
    expect(printDesignPresets()[0].design).toEqual(defaultPrintDesign());
  });

  it('uses only fonts the server has', () => {
    for (const id of designFonts(defaultPrintDesign())) expect(getFont(id)).toBeDefined();
    expect([...designFonts(defaultPrintDesign())].sort()).toEqual(['roboto', 'system-serif']);
  });
});

describe('leaving things out', () => {
  it('fills in the default for anything missing', () => {
    expect(parseOk({})).toEqual(defaultPrintDesign());
    const design = parseOk({ footer: { show: true, text: 'Free WiFi' } });
    expect(design.footer.show).toBe(true);
    expect(design.footer.text).toBe('Free WiFi');
    expect(design.footer.rule).toEqual(defaultPrintDesign().footer.rule);
    expect(design.sections).toEqual(defaultPrintDesign().sections);
  });

  it('fills in nested fields without disturbing their neighbours', () => {
    const design = parseOk({ sections: { heading: { style: { sizePt: 30 } } } });
    expect(design.sections.heading.style).toEqual({ ...defaultPrintDesign().sections.heading.style, sizePt: 30 });
    expect(design.sections.heading.box).toEqual(defaultPrintDesign().sections.heading.box);
  });

  it('replaces a list of columns rather than merging into it', () => {
    const only = defaultPrintDesign().columns[1];
    expect(parseOk({ columns: [only] }).columns).toEqual([only]);
  });

  it('lets a field be cleared to null where null is allowed', () => {
    expect(parseOk({ page: { maxPages: null } }).page.maxPages).toBeNull();
    expect(parseOk({ sections: { heading: { box: { background: null } } } }).sections.heading.box.background).toBeNull();
  });

  it('lowercases colors', () => {
    expect(parseOk({ page: { background: '#ABCDEF' } }).page.background).toBe('#abcdef');
    expect(parseOk({ page: { background: '#ABCDEF80' } }).page.background).toBe('#abcdef80');
  });
});

describe('turning down a design', () => {
  it.each([
    ['an unknown field at the top', (d: any) => { d.fontsize = 12; }, 'fontsize'],
    ['an unknown field deep inside', (d: any) => { d.sections.heading.style.fontFamily = 'Comic Sans'; }, 'sections.heading.style.fontFamily'],
    ['a font that is not in the catalog', (d: any) => { d.sections.heading.style.font = 'Comic Sans MS'; }, 'sections.heading.style.font'],
    ['a font written as CSS', (d: any) => { d.sections.heading.style.font = "roboto'; } body { display: none"; }, 'sections.heading.style.font'],
    ['a size that is too small', (d: any) => { d.sections.heading.style.sizePt = 3; }, 'sections.heading.style.sizePt'],
    ['a size that is too large', (d: any) => { d.sections.heading.style.sizePt = 400; }, 'sections.heading.style.sizePt'],
    ['a size that is not a number', (d: any) => { d.sections.heading.style.sizePt = '18pt'; }, 'sections.heading.style.sizePt'],
    ['a size that is NaN', (d: any) => { d.sections.heading.style.sizePt = NaN; }, 'sections.heading.style.sizePt'],
    ['a weight between steps', (d: any) => { d.sections.heading.style.weight = 450; }, 'sections.heading.style.weight'],
    ['a color without a #', (d: any) => { d.footer.style.color = 'red'; }, 'footer.style.color'],
    ['a color that is really CSS', (d: any) => { d.footer.style.color = '#fff; background: url(//evil)'; }, 'footer.style.color'],
    ['a short color', (d: any) => { d.footer.style.color = '#fff'; }, 'footer.style.color'],
    ['an unknown alignment', (d: any) => { d.footer.style.align = 'justify'; }, 'footer.style.align'],
    ['an unknown page size', (d: any) => { d.page.size = 'poster'; }, 'page.size'],
    ['zero pages', (d: any) => { d.page.maxPages = 0; }, 'page.maxPages'],
    ['a fraction of a page', (d: any) => { d.page.maxPages = 1.5; }, 'page.maxPages'],
    ['a huge margin', (d: any) => { d.page.marginsIn.top = 40; }, 'page.marginsIn.top'],
    ['no columns', (d: any) => { d.columns = []; }, 'columns'],
    ['seven columns', (d: any) => { d.columns = Array.from({ length: 7 }, (_, i) => ({ ...defaultPrintDesign().columns[2 - 2], id: `c${i}`, widthPct: 5 })); }, 'columns'],
    ['a column of an unknown type', (d: any) => { d.columns[0] = { id: 'x', type: 'html', html: '<b>' }; }, 'columns.0'],
    ['two columns with the same ID', (d: any) => { d.columns[1].id = 'item'; }, 'columns.1.id'],
    ['an ID that is not an identifier', (d: any) => { d.columns[0].id = 'a b"'; }, 'columns.0.id'],
    ['widths that add up to more than 100%', (d: any) => { d.columns[0].widthPct = 80; d.columns[1].widthPct = 40; }, 'columns'],
    ['more than four lines in a cell', (d: any) => { d.columns[0].lines = Array.from({ length: 5 }, () => structuredClone(d.columns[0].belowLines[0])); }, 'columns.0.lines'],
    ['a line with no parts', (d: any) => { d.columns[0].lines[0].parts = []; }, 'columns.0.lines.0.parts'],
    ['an unknown item field', (d: any) => { d.columns[0].lines[0].parts[0].field = 'internalName'; }, 'columns.0.lines.0.parts.0.field'],
    ['fixed text with no text', (d: any) => { d.columns[0].lines[0].parts[0] = { field: 'text', before: '', format: '{value}' }; }, 'columns.0.lines.0.parts.0.text'],
    ['a format with no {value}', (d: any) => { d.columns[0].lines[0].parts[0].format = 'ABV'; }, 'columns.0.lines.0.parts.0.format'],
    ['a price format with no {value}', (d: any) => { d.columns[1].cell.format = '$'; }, 'columns.1.cell.format'],
    ['a separator that is far too long', (d: any) => { d.columns[0].lines[0].parts[1].before = 'x'.repeat(50); }, 'columns.0.lines.0.parts.1.before'],
    ['control characters in text', (d: any) => { d.footer.text = 'Wi\u0000Fi'; }, 'footer.text'],
    ['footer text over four lines', (d: any) => { d.footer.text = 'a\nb\nc\nd\ne'; }, 'footer.text'],
    ['a divider style that is not a border style', (d: any) => { d.rows.divider.style = 'groove'; }, 'rows.divider.style'],
  ])('rejects %s', (_name, change, path) => {
    const issues = issuesFor(changed(change));
    // The problem is reported at the place named, or somewhere inside it
    expect(issues.some((issue) => issue.path === path || issue.path.startsWith(`${path}.`)), JSON.stringify(issues)).toBe(true);
  });

  it('explains what is wrong, and where', () => {
    const issues = issuesFor(changed((d) => { d.footer.style.color = 'red'; d.sections.heading.style.sizePt = 3; }));
    expect(issues).toEqual(expect.arrayContaining([
      { path: 'footer.style.color', message: 'Use a color like #3f3f3f' },
      { path: 'sections.heading.style.sizePt', message: 'At least 4' },
    ]));
  });

  it.each([null, 'a string', 42, true, [], [1, 2]])('rejects %j instead of a design', (raw) => {
    expect(parsePrintDesign(raw).ok).toBe(false);
  });

  it('rejects a design from a version it does not know', () => {
    expect(issuesFor({ version: 2 })).toEqual([{ path: 'version', message: 'Designs of version 2 are not supported' }]);
    expect(parseOk({ version: 1 })).toEqual(defaultPrintDesign());
  });

  it('rejects one that is too large', () => {
    const issues = issuesFor({ footer: { text: 'x'.repeat(MAX_DESIGN_BYTES) } });
    expect(issues[0].message).toMatch(/too large/);
  });

  it('copes with something that cannot be turned into JSON', () => {
    const loop: any = {};
    loop.self = loop;
    expect(parsePrintDesign(loop).ok).toBe(false);
    expect(parsePrintDesign({ big: BigInt(1) }).ok).toBe(false);
  });
});

describe('keys that tamper with prototypes', () => {
  it('are dropped, and change nothing', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"footer":{"__proto__":{"polluted":true},"text":"hi"}}');
    const design = parseOk(raw);
    expect(design.footer.text).toBe('hi');
    expect(({} as any).polluted).toBeUndefined();
    expect((design as any).polluted).toBeUndefined();
    expect(Object.keys(design)).not.toContain('constructor');
  });
});

describe('the font catalog', () => {
  it('has a file on disk for every font file', () => {
    for (const font of FONTS) {
      for (const file of font.files) {
        expect(fs.existsSync(path.join(repoRoot, 'public/fonts', file.file)), `${font.id}: ${file.file}`).toBe(true);
      }
    }
  });

  it('has unique IDs and a licence for each downloaded family', () => {
    expect(new Set(FONTS.map((font) => font.id)).size).toBe(FONTS.length);
    const licences = fs.readdirSync(path.join(repoRoot, 'public/fonts/licenses'));
    for (const font of FONTS.filter((f) => f.files.length)) {
      expect(licences.some((name) => name.startsWith(font.id)), `licence for ${font.id}`).toBe(true);
    }
  });

  it('gives each font a stack ending in a generic family, and system fonts no files', () => {
    expect(fontStack('roboto')).toBe("'Roboto Variable', sans-serif");
    expect(fontStack('system-serif')).toBe('serif');
    expect(() => fontStack('nope')).toThrow();
    expect(fontFaceCss(['system-serif', 'system-sans'])).toBe('');
  });

  it('writes @font-face rules only for the fonts asked for, once each', () => {
    const css = fontFaceCss(['roboto', 'roboto', 'bebas-neue']);
    expect(css.match(/@font-face/g)).toHaveLength(3); // roboto normal + italic, bebas
    expect(css).toContain("font-family:'Roboto Variable'");
    expect(css).toContain('font-weight:100 900');
    expect(css).toContain('src:url(/fonts/bebas-neue-latin-400-normal.woff2) format(\'woff2\')');
    expect(css).not.toContain('Fira Sans');
  });

  it('describes the fonts for the admin client without file names', () => {
    const fonts = describeFonts();
    expect(fonts.find((font) => font.id === 'roboto')).toEqual({ id: 'roboto', label: 'Roboto', category: 'sans', minWeight: 100, maxWeight: 900, italic: true });
    expect(JSON.stringify(fonts)).not.toContain('.woff2');
  });
});

describe('design views', () => {
  it('recognizes only the views that can be designed', () => {
    for (const view of DESIGN_VIEWS) expect(isDesignView(view)).toBe(true);
    for (const other of ['widget', 'PRINT', '', 'constructor', null, undefined, 1, {}]) expect(isDesignView(other)).toBe(false);
  });
});
