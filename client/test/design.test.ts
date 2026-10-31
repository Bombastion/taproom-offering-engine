import { describe, expect, it } from 'vitest';
import { nearestWeight, sameDesign, setIn, styleForFont } from '../src/design';
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
