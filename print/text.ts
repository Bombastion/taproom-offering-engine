import path from 'path';
import pdfkit from 'pdfkit';
import { pdfFontSource } from '../models/fonts';
import { TextStyle } from '../models/menuDesign';

/*
Text for the print menu's PDF: measuring it, wrapping it into lines and drawing those lines.

A line of item text is made of runs in different styles side by side (a bold name between two regular
fields), so pdfkit's own wrapping, which takes one style at a time, can't lay it out. This does it
the way a browser would: words are the unit that is never broken, the space between two runs of the
same line takes the width of the run before it, and each line is as tall as its tallest run, with the
runs sitting on a common baseline.
*/

// pdfkit reads the fonts from the folder the server serves them from
const FONT_FOLDER = path.join(import.meta.dirname, '..', 'public', 'fonts');

// Widths and heights of text grow in step with its size, so they are measured once at this size and
// scaled. That makes fitting a menu to its pages (which lays it out at many sizes) cheap.
const UNIT = 100;

// A piece of text in one style, at an actual size in points (the design's size, after the menu has
// been shrunk to fit its pages)
export interface Fragment {
  text: string;
  style: TextStyle;
  size: number;
}

export function fragment(text: string, style: TextStyle, scale: number): Fragment {
  return { text: style.transform === 'uppercase' ? text.toUpperCase() : text, style, size: style.sizePt * scale };
}

// A fragment as placed on a line
interface Placed extends Fragment {
  // Where it starts, from the left edge of the text (before the line is aligned)
  x: number;
  width: number;
  ascent: number;
}

export interface LaidLine {
  // From the top of the text
  top: number;
  height: number;
  // The baseline, from the top of the line
  baseline: number;
  // How far in from the left edge the line starts, for its alignment
  offset: number;
  width: number;
  placed: Placed[];
}

export interface LaidText {
  lines: LaidLine[];
  height: number;
}

interface FaceMetrics {
  ascent: number;
  descent: number;
  gap: number;
}

export class Measurer {
  private widths = new Map<string, number>();
  private metricsBySource = new Map<string, FaceMetrics>();

  constructor(readonly doc: pdfkit) {}

  // What a style is drawn with: a font file's path or the name of a standard font
  source(style: Pick<TextStyle, 'font' | 'weight' | 'italic'>): string {
    // The design is validated, so the font exists; the fallback only guards a catalog missing a file
    const source = pdfFontSource(style.font, style.weight, style.italic) ?? pdfFontSource('system-sans', 400, false)!;
    return source.file !== undefined ? path.join(FONT_FOLDER, source.file) : source.builtIn!;
  }

  // Makes the style the one pdfkit draws with next
  select(style: TextStyle, size: number): void {
    this.doc.font(this.source(style)).fontSize(size);
  }

  private metrics(source: string): FaceMetrics {
    let metrics = this.metricsBySource.get(source);
    if (!metrics) {
      this.doc.font(source);
      // pdfkit keeps these in thousandths of the font size, but doesn't document them
      const font = (this.doc as unknown as { _font: { ascender: number; descender: number; lineGap: number } })._font;
      metrics = { ascent: font.ascender / 1000, descent: -font.descender / 1000, gap: Math.max(0, font.lineGap) / 1000 };
      this.metricsBySource.set(source, metrics);
    }
    return metrics;
  }

  // The width of some text in a style, letter spacing included
  width(frag: Fragment, text: string = frag.text): number {
    const source = this.source(frag.style);
    const key = `${source}\0${text}`;
    let unit = this.widths.get(key);
    if (unit === undefined) {
      this.doc.font(source).fontSize(UNIT);
      unit = this.doc.widthOfString(text) / UNIT;
      this.widths.set(key, unit);
    }
    // Letter spacing is added after every character, the last one too
    return (unit + frag.style.letterSpacingEm * [...text].length) * frag.size;
  }

  // How a fragment sits in a line: above and below its baseline, with the line height's extra
  // space shared between the two (as a browser does)
  box(frag: Fragment): { ascent: number; above: number; below: number } {
    const metrics = this.metrics(this.source(frag.style));
    const ascent = metrics.ascent * frag.size;
    const descent = metrics.descent * frag.size;
    const lineHeight = frag.style.lineHeight !== null ? frag.style.lineHeight * frag.size : ascent + descent + metrics.gap * frag.size;
    const leading = (lineHeight - (ascent + descent)) / 2;
    return { ascent, above: ascent + leading, below: descent + leading };
  }
}

type Atom = { space: true; width: number } | { space: false; parts: Array<{ frag: Fragment; text: string; width: number }>; width: number };

const WHITESPACE = /([ \t\r\n\f]+)/;
const SPACES = /^[ \t\r\n\f]+$/;

// Splits the runs into words (made of one or more fragments, when styles change in the middle of a
// word) and the spaces between them. Runs of spaces count as one, as on a web page.
function atomsOf(measurer: Measurer, runs: Fragment[]): Atom[] {
  const atoms: Atom[] = [];
  for (const frag of runs) {
    for (const piece of frag.text.split(WHITESPACE)) {
      if (piece === '') continue;
      const last = atoms[atoms.length - 1];
      if (SPACES.test(piece)) {
        if (last && !last.space) atoms.push({ space: true, width: measurer.width(frag, ' ') });
        continue;
      }
      const width = measurer.width(frag, piece);
      if (last && !last.space) {
        last.parts.push({ frag, text: piece, width });
        last.width += width;
      } else {
        atoms.push({ space: false, parts: [{ frag, text: piece, width }], width });
      }
    }
  }
  return atoms;
}

// A word wider than the line is cut at the width rather than run past the edge of the page
function cutWord(measurer: Measurer, word: Extract<Atom, { space: false }>, width: number): Array<Extract<Atom, { space: false }>> {
  const pieces: Array<Extract<Atom, { space: false }>> = [];
  let current: Extract<Atom, { space: false }> = { space: false, parts: [], width: 0 };
  for (const part of word.parts) {
    for (const character of part.text) {
      const w = measurer.width(part.frag, character);
      if (current.width + w > width && current.parts.length > 0) {
        pieces.push(current);
        current = { space: false, parts: [], width: 0 };
      }
      const last = current.parts[current.parts.length - 1];
      if (last && last.frag === part.frag) {
        last.text += character;
        last.width += w;
      } else {
        current.parts.push({ frag: part.frag, text: character, width: w });
      }
      current.width += w;
    }
  }
  if (current.parts.length > 0) pieces.push(current);
  return pieces;
}

const EPSILON = 0.01;

// The runs wrapped into lines no wider than `width`, aligned as `base` says. `base` is the style of
// the block the runs are in: its line height counts even on a line whose runs are all smaller.
export function layoutText(measurer: Measurer, runs: Fragment[], base: Fragment, width: number): LaidText {
  const atoms = atomsOf(measurer, runs);
  const built: Array<{ words: Array<{ x: number; word: Extract<Atom, { space: false }> }>; width: number }> = [];
  let line: (typeof built)[number] = { words: [], width: 0 };
  let space = 0;

  const place = (word: Extract<Atom, { space: false }>) => {
    const x = line.words.length > 0 ? line.width + space : 0;
    line.words.push({ x, word });
    line.width = x + word.width;
    space = 0;
  };
  const newLine = () => {
    built.push(line);
    line = { words: [], width: 0 };
    space = 0;
  };

  for (const atom of atoms) {
    if (atom.space) {
      if (line.words.length > 0) space = atom.width;
      continue;
    }
    if (line.words.length > 0 && line.width + space + atom.width > width + EPSILON) newLine();
    if (atom.width > width + EPSILON) {
      const pieces = cutWord(measurer, atom, width);
      pieces.forEach((piece, index) => {
        place(piece);
        if (index < pieces.length - 1) newLine();
      });
    } else {
      place(atom);
    }
  }
  if (line.words.length > 0) built.push(line);

  const strut = measurer.box(base);
  const lines: LaidLine[] = [];
  let top = 0;
  for (const { words, width: lineWidth } of built) {
    const placed: Placed[] = [];
    let above = strut.above;
    let below = strut.below;
    for (const { x, word } of words) {
      let offset = x;
      for (const part of word.parts) {
        const frag: Fragment = { text: part.text, style: part.frag.style, size: part.frag.size };
        const box = measurer.box(frag);
        above = Math.max(above, box.above);
        below = Math.max(below, box.below);
        placed.push({ ...frag, x: offset, width: part.width, ascent: box.ascent });
        offset += part.width;
      }
    }
    const align = base.style.align;
    const lineOffset = align === 'center' ? (width - lineWidth) / 2 : align === 'right' ? width - lineWidth : 0;
    lines.push({ top, height: above + below, baseline: above, offset: lineOffset, width: lineWidth, placed });
    top += above + below;
  }
  return { lines, height: top };
}

// A color for pdfkit: '#rrggbb', and how opaque it is when the design gave '#rrggbbaa'
export function colorOf(hex: string): { rgb: string; alpha: number } {
  return { rgb: hex.slice(0, 7), alpha: hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1 };
}

// Draws laid-out text with its top-left corner at (x, y)
export function drawText(measurer: Measurer, laid: LaidText, x: number, y: number): void {
  const doc = measurer.doc;
  for (const line of laid.lines) {
    for (const piece of line.placed) {
      measurer.select(piece.style, piece.size);
      const color = colorOf(piece.style.color);
      doc.fillColor(color.rgb, color.alpha);
      const options: Record<string, unknown> = { lineBreak: false };
      if (piece.style.letterSpacingEm) options.characterSpacing = piece.style.letterSpacingEm * piece.size;
      // pdfkit puts the baseline an ascent below the y it is given
      doc.text(piece.text, x + line.offset + piece.x, y + line.top + line.baseline - piece.ascent, options);
    }
  }
}
