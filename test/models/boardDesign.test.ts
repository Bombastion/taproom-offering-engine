import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BoardDesign, boardDesignFonts, boardDesignPresets, defaultBoardDesign, parseBoardDesign } from '../../models/boardDesign';
import { boardFontFile, describeFonts, FONTS, isBoardFontId } from '../../models/fonts';
import { MAX_DESIGN_BYTES } from '../../models/menuDesign';

const fontsFolder = path.resolve(import.meta.dirname, '../../public/fonts');

function parseOk(raw: unknown): BoardDesign {
  const result = parseBoardDesign(raw);
  if (!result.ok) throw new Error(`Expected a valid design: ${JSON.stringify(result.issues)}`);
  return result.design;
}

function issuesFor(raw: unknown) {
  const result = parseBoardDesign(raw);
  if (result.ok) throw new Error('Expected the design to be rejected');
  return result.issues;
}

function changed(change: (design: any) => void) {
  const design: any = structuredClone(defaultBoardDesign());
  change(design);
  return design;
}

describe('the default board design', () => {
  it('is valid, and parsing it changes nothing', () => {
    expect(parseOk(defaultBoardDesign())).toEqual(defaultBoardDesign());
  });

  it('is a fresh copy every time', () => {
    const first = defaultBoardDesign();
    first.items.lines.pop();
    first.canvas.background = '#000000';
    expect(defaultBoardDesign().items.lines).toHaveLength(1);
    expect(defaultBoardDesign().canvas.background).toBe('#0e2a47');
  });

  it('is the Bold design: big condensed capitals on deep blue with red section bars', () => {
    const d = defaultBoardDesign();
    expect(d.canvas).toEqual({ background: '#0e2a47', safeMarginPx: 40 });
    expect(d.header.logo).toMatchObject({ show: true, sizePx: 150, align: 'center' });
    expect(d.header.title.show).toBe(false);
    expect(d.sections.bar).toMatchObject({ heightPx: 74, background: '#d6402b', continuedSuffix: ', Continued' });
    expect(d.sections.bar.style).toMatchObject({ font: 'bebas-neue', sizePx: 62, color: '#ffffff', transform: 'uppercase' });
    expect(d.sections.gapPx).toBe(30);
    expect(d.items.logo).toMatchObject({ show: true, sizePx: 64, shape: 'circle' });
    expect(d.items.lines).toHaveLength(1);
    expect(d.items.lines[0].style).toMatchObject({ font: 'bebas-neue', sizePx: 64, color: '#ffffff', transform: 'uppercase' });
    expect(d.items.lines[0].parts.map((part) => part.field)).toEqual(['breweryName', 'displayName', 'style', 'abv']);
    // Prices stay off the board
    expect(JSON.stringify(d)).not.toMatch(/price/i);
  });
});

describe('reading a board design', () => {
  it('fills in whatever a design leaves out from the default', () => {
    const design = parseOk({ canvas: { background: '#000000' } });
    expect(design.canvas).toEqual({ background: '#000000', safeMarginPx: 40 });
    expect(design.items).toEqual(defaultBoardDesign().items);
  });

  it('lowercases colors', () => {
    expect(parseOk({ canvas: { background: '#ABCDEF' } }).canvas.background).toBe('#abcdef');
  });

  it('replaces lists rather than merging them', () => {
    const design = parseOk({ items: { lines: [{ style: defaultBoardDesign().items.lines[0].style, parts: [{ field: 'displayName', before: '', format: '{value}' }] }] } });
    expect(design.items.lines[0].parts).toHaveLength(1);
  });

  it.each([
    ['a font the board cannot draw', changed((d) => { d.items.lines[0].style.font = 'system-serif'; }), 'items.lines.0.style.font'],
    ['a font that does not exist', changed((d) => { d.sections.bar.style.font = 'comic-sans'; }), 'sections.bar.style.font'],
    ['a color that is not a color', changed((d) => { d.canvas.background = 'red;}</style>'; }), 'canvas.background'],
    ['a size that is too big', changed((d) => { d.sections.bar.style.sizePx = 5000; }), 'sections.bar.style.sizePx'],
    ['a margin that is negative', changed((d) => { d.canvas.safeMarginPx = -1; }), 'canvas.safeMarginPx'],
    ['a setting there is no such thing as', changed((d) => { d.canvas.colour = '#000000'; }), 'canvas.colour'],
    ['a price field (the board has none)', changed((d) => { d.items.lines[0].parts[0].field = 'price'; }), 'items.lines.0.parts.0.field'],
    ['a part with no {value}', changed((d) => { d.items.lines[0].parts[0].format = 'oops'; }), 'items.lines.0.parts.0.format'],
    ['fixed text with no text', changed((d) => { d.items.lines[0].parts.push({ field: 'text', before: '', format: '{value}' }); }), 'items.lines.0.parts.4.text'],
    ['a part that changes the size', changed((d) => { d.items.lines[0].parts[2].style = { sizePx: 80 }; }), 'items.lines.0.parts.2.style.sizePx'],
    ['no lines at all', changed((d) => { d.items.lines = []; }), 'items.lines'],
    ['too many lines', changed((d) => { d.items.lines = Array.from({ length: 4 }, () => d.items.lines[0]); }), 'items.lines'],
    ['a version that does not exist', { version: 99 }, 'version'],
  ])('refuses %s', (_what, raw, path) => {
    expect(issuesFor(raw).map((issue) => issue.path)).toContain(path);
  });

  it('refuses something that is not an object', () => {
    expect(parseBoardDesign(null).ok).toBe(false);
    expect(parseBoardDesign([]).ok).toBe(false);
    expect(parseBoardDesign('nope').ok).toBe(false);
  });

  it('refuses a design that is too large', () => {
    const result = parseBoardDesign({ header: { title: { text: 'x'.repeat(100) } }, pad: 'y'.repeat(MAX_DESIGN_BYTES) });
    expect(result.ok).toBe(false);
  });

  it('accepts a part with a style of its own, a second line and fixed text', () => {
    const base = defaultBoardDesign().items.lines[0];
    const design = parseOk(changed((d) => {
      d.items.lines.push({ style: { ...base.style, sizePx: 30 }, parts: [{ field: 'description', before: '', format: '{value}' }, { field: 'text', text: 'Ask us', before: ' — ', format: '{value}', style: { italic: true } }] });
    }));
    expect(design.items.lines).toHaveLength(2);
  });

  it('does not let a stored design touch object prototypes', () => {
    parseBoardDesign(JSON.parse('{"__proto__": {"polluted": true}, "canvas": {"constructor": {"prototype": {"polluted": true}}}}'));
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe('board design presets', () => {
  const presets = boardDesignPresets();

  it('starts with Bold, which is the default design', () => {
    expect(presets.map((preset) => preset.id)).toEqual(['bold', 'dark', 'light']);
    expect(presets[0].design).toEqual(defaultBoardDesign());
  });

  it('keep the looks they have, whatever the default is', () => {
    // Dark and Light state every setting themselves, so a new default can't move them
    for (const preset of presets.slice(1)) {
      expect(preset.design.canvas.background, preset.id).not.toBe(defaultBoardDesign().canvas.background);
      expect(preset.design.sections.bar.background, preset.id).not.toBe(defaultBoardDesign().sections.bar.background);
    }
    expect(presets.find((preset) => preset.id === 'dark')!.design).toMatchObject({ canvas: { background: '#141414' }, sections: { bar: { heightPx: 60, background: '#e0a526', radiusPx: 6 } } });
    expect(presets.find((preset) => preset.id === 'light')!.design).toMatchObject({ canvas: { background: '#f6efdc' }, sections: { bar: { background: '#4a2f1b' } } });
  });

  it('give a title that can be read on the preset’s own background', () => {
    const light = presets.find((preset) => preset.id === 'light')!.design;
    expect(light.header.title.style.color).toBe('#3b2a1a');
  });

  it('offers several, each different and each valid as it stands', () => {
    expect(presets.length).toBeGreaterThanOrEqual(3);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
    expect(new Set(presets.map((preset) => JSON.stringify(preset.design))).size).toBe(presets.length);
    for (const preset of presets) {
      expect(parseOk(preset.design), preset.id).toEqual(preset.design);
      expect(preset.description.length, preset.id).toBeGreaterThan(10);
    }
  });
});

describe('fonts on the board', () => {
  it('only includes fonts that have static files on disk', () => {
    const boardFonts = FONTS.filter((font) => font.boardFiles?.length);
    expect(boardFonts.map((font) => font.id)).toContain('fira-sans');
    expect(boardFonts.map((font) => font.id)).not.toContain('system-serif');
    for (const font of boardFonts) {
      for (const file of font.boardFiles!) {
        expect(fs.existsSync(path.join(fontsFolder, file.file)), `${font.id}: ${file.file}`).toBe(true);
        // pdfkit can't embed WOFF2 or variable fonts
        expect(file.file, font.id).toMatch(/\.(woff|ttf)$/);
        expect(Array.isArray(file.weight), font.id).toBe(false);
      }
    }
  });

  it('draws Fira Sans regular with the font the board always used', () => {
    expect(boardFontFile('fira-sans', 400, false)).toBe('FiraSans-Regular.ttf');
  });

  it('picks the nearest weight and the matching slant a family has', () => {
    expect(boardFontFile('montserrat', 700, false)).toBe('board/montserrat-latin-700-normal.woff');
    expect(boardFontFile('montserrat', 600, false)).toBe('board/montserrat-latin-700-normal.woff');
    expect(boardFontFile('montserrat', 500, false)).toBe('board/montserrat-latin-400-normal.woff');
    expect(boardFontFile('montserrat', 900, true)).toBe('board/montserrat-latin-700-italic.woff');
    // A family with no italics falls back to its upright files
    expect(boardFontFile('oswald', 400, true)).toBe('board/oswald-latin-400-normal.woff');
    expect(boardFontFile('system-sans', 400, false)).toBeUndefined();
    expect(boardFontFile('nope', 400, false)).toBeUndefined();
  });

  it('tells the designer which fonts, weights and slants the board has', () => {
    const fonts = describeFonts('board');
    expect(fonts.map((font) => font.id)).not.toContain('system-serif');
    expect(fonts.find((font) => font.id === 'bebas-neue')).toMatchObject({ weights: [400], italic: false });
    expect(fonts.find((font) => font.id === 'montserrat')).toMatchObject({ weights: [400, 700], italic: true });
    // The print list is unchanged
    expect(describeFonts().map((font) => font.id)).toContain('system-serif');
    expect(describeFonts('print')).toEqual(describeFonts());
  });

  it('knows every font the presets use', () => {
    for (const preset of boardDesignPresets()) {
      for (const id of boardDesignFonts(preset.design)) expect(isBoardFontId(id), `${preset.id}: ${id}`).toBe(true);
    }
    expect([...boardDesignFonts(defaultBoardDesign())]).toEqual(['bebas-neue']);
  });
});
