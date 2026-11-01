import { describe, expect, it } from 'vitest';
import { applyPreset, BODY_TEXT, describeColumn, FieldsColumn, newColumn, newColumnId, newPart, nearestWeight, PricesColumn, sameDesign, setIn, styleDifferences, styleForFont, widthLeft } from '../src/design';
import { designFonts, printDesign } from './fixtures';

describe('setIn', () => {
  it('replaces what is at the path and leaves the original alone', () => {
    const original = { a: { b: { c: 1, d: 2 }, e: 3 }, f: 4 };
    const changed = setIn(original, ['a', 'b', 'c'], 9);
    expect(changed).toEqual({ a: { b: { c: 9, d: 2 }, e: 3 }, f: 4 });
    expect(original.a.b.c).toBe(1);
  });

  it('only copies what is on the way, so the rest is shared', () => {
    const original = { a: { b: 1 }, other: { x: 1 } };
    const changed = setIn(original, ['a', 'b'], 2);
    expect(changed.other).toBe(original.other);
    expect(changed.a).not.toBe(original.a);
  });

  it('can set null, and into a list', () => {
    expect(setIn({ fill: '#fff' }, ['fill'], null)).toEqual({ fill: null });
    const list = [{ n: 1 }, { n: 2 }];
    const next = setIn(list, [1, 'n'], 5);
    expect(next).toEqual([{ n: 1 }, { n: 5 }]);
    expect(Array.isArray(next)).toBe(true);
    expect(list[1].n).toBe(2);
  });
});

describe('sameDesign', () => {
  it('is true for a design and a copy of it, false once anything differs', () => {
    expect(sameDesign(printDesign, structuredClone(printDesign))).toBe(true);
    expect(sameDesign(printDesign, setIn(printDesign, ['footer', 'show'], true))).toBe(false);
  });
});

describe('weights', () => {
  it('finds the closest weight a font has, the heavier one on a tie', () => {
    expect(nearestWeight([400, 500, 700], 600)).toBe(700);
    expect(nearestWeight([400, 500, 700], 300)).toBe(400);
    expect(nearestWeight([400], 700)).toBe(400);
    expect(nearestWeight([100, 300], 200)).toBe(300);
    expect(nearestWeight([], 700)).toBe(700);
  });

  it('keeps a text style valid for a new font: a weight it has, and no italic if it has none', () => {
    const bold = { ...printDesign.sections.heading.style, weight: 700, italic: true };
    const bebas = designFonts.find((f) => f.id === 'bebas-neue')!;
    expect(styleForFont(bold, bebas)).toMatchObject({ font: 'bebas-neue', weight: 400, italic: false });
    const fira = designFonts.find((f) => f.id === 'fira-sans')!;
    expect(styleForFont({ ...bold, weight: 600 }, fira)).toMatchObject({ font: 'fira-sans', weight: 700, italic: true });
  });
});

describe('columns', () => {
  const item = printDesign.columns[0] as FieldsColumn;
  const prices = printDesign.columns[1] as PricesColumn;

  it('gives a new column an ID that is not taken, numbered when its kind is already there', () => {
    expect(newColumnId(printDesign.columns, 'fields')).toBe('fields');
    expect(newColumnId(printDesign.columns, 'prices')).toBe('prices-2');
    expect(newColumnId([...printDesign.columns, { ...prices, id: 'prices-2' }], 'prices')).toBe('prices-3');
    // Valid for the server: lowercase letters, numbers, - and _
    expect(newColumnId([], 'thumbnail')).toMatch(/^[a-z0-9][a-z0-9_-]{0,39}$/);
  });

  it('starts new text from the style the design already uses', () => {
    const column = newColumn('fields', printDesign.columns) as FieldsColumn;
    expect(column.lines[0].style).toEqual(item.lines[0].style);
    expect(newColumn('fields', []) as FieldsColumn).toMatchObject({ lines: [{ style: BODY_TEXT }] });
    const sizes = newColumn('prices', printDesign.columns) as PricesColumn;
    expect(sizes.cell.style.align).toBe('center');
    expect(sizes.widthPct).toBeNull();
  });

  it('works out how much width is left for a column', () => {
    expect(widthLeft(printDesign.columns, 1)).toBe(30);
    expect(widthLeft(printDesign.columns, 0)).toBe(100);
    expect(widthLeft([{ ...item, widthPct: 60 }, { ...prices, widthPct: 30 }, { id: 'p', type: 'thumbnail', sizePx: 20, shape: 'square', source: 'item-then-menu' }], 1)).toBe(40);
  });

  it('describes a column in a few words', () => {
    expect(describeColumn(item)).toBe('70% wide, brewery, name, style, ABV; description');
    expect(describeColumn(prices)).toBe('shares the rest, every size');
    expect(describeColumn({ ...prices, widthPct: 20, sizes: ['a'] })).toBe('20% wide, 1 size');
    expect(describeColumn({ ...prices, sizes: ['a', 'b'] })).toBe('shares the rest, 2 sizes');
  });

  it('picks a field a line does not print yet for a new part, and fixed text when it prints them all', () => {
    expect(newPart(item.lines[0])).toEqual({ field: 'breweryLocation', before: ' • ', format: '{value}' });
    const all = {
      ...item.lines[0],
      parts: ['breweryName', 'breweryLocation', 'displayName', 'style', 'abv', 'description', 'category'].map((field) => ({ field, before: '', format: '{value}' })),
    } as FieldsColumn['lines'][number];
    expect(newPart(all)).toMatchObject({ field: 'text', text: 'Text' });
    expect(newPart({ ...item.lines[0], parts: [] }).before).toBe('');
  });

  it('keeps only what is different between two styles', () => {
    expect(styleDifferences(BODY_TEXT, BODY_TEXT)).toEqual({});
    expect(styleDifferences(BODY_TEXT, { ...BODY_TEXT, weight: 700, color: '#ff0000' })).toEqual({ weight: 700, color: '#ff0000' });
    expect(styleDifferences(BODY_TEXT, { ...BODY_TEXT, lineHeight: 1.5 })).toEqual({ lineHeight: 1.5 });
  });
});

describe('applyPreset', () => {
  it('takes the look and keeps what belongs to the menu', () => {
    let current = setIn(printDesign, ['footer', 'show'], true);
    current = setIn(current, ['footer', 'text'], 'Ours');
    current = setIn(current, ['header', 'title', 'show'], true);
    current = setIn(current, ['header', 'title', 'text'], 'Our title');
    let preset = setIn(printDesign, ['sections', 'heading', 'style', 'sizePt'], 15);
    preset = setIn(preset, ['footer', 'style', 'sizePt'], 8);
    preset = setIn(preset, ['page', 'maxPages'], 1);

    const result = applyPreset(current, preset);
    expect(result.sections.heading.style.sizePt).toBe(15);
    expect(result.page.maxPages).toBe(1);
    expect(result.footer.style.sizePt).toBe(8);
    expect(result.footer).toMatchObject({ show: true, text: 'Ours' });
    expect(result.header.title).toMatchObject({ show: true, text: 'Our title' });
    // The preset itself is left alone
    expect(preset.footer.show).toBe(printDesign.footer.show);
  });
});
