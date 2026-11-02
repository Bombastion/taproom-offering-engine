import { z } from 'zod';
import { isBoardFontId } from './fonts';
import { align, DesignPreset, hexColor, ITEM_FIELDS, num, parseDesign, ParsedDesign, text, weight, DESIGN_VERSION } from './menuDesign';

/*
How a menu looks on its menu board, as data: the board's counterpart of the print design in
menuDesign.ts, with the same rules (a JSON document per menu, every value validated, defaults for
anything left out, nothing but validated values ever drawn).

The board is a 1080x1920 picture per screenful, so every size here is in pixels of that picture
(BOARD_WIDTH x BOARD_HEIGHT). It has no prices, and no columns: each item is a row with a picture and
lines of text built from the item's fields ("parts"), the way a print column's lines are.

A menu with no saved design is drawn with the default (the Bold preset, see defaultBoardDesign()).
*/

export const BOARD_WIDTH = 1080;
export const BOARD_HEIGHT = 1920;

// The fonts a board can use are the ones with static files (see FontEntry.boardFiles)
const boardFontId = z.string().refine(isBoardFontId, 'Not one of the fonts available on the board');

export const boardTextStyleSchema = z.strictObject({
  font: boardFontId,
  sizePx: num(10, 200),
  weight: weight,
  italic: z.boolean(),
  color: hexColor,
  align: align,
  transform: z.enum(['none', 'uppercase']),
  letterSpacingEm: num(-0.1, 0.5),
});
export type BoardTextStyle = z.infer<typeof boardTextStyleSchema>;

// What a part of a line can change about the line's style: anything but the size (a part is a run of
// text inside a line, which has one size) and the alignment (a line is aligned as a whole)
export const boardPartStyleSchema = boardTextStyleSchema.omit({ sizePx: true, align: true }).partial();
export type BoardPartStyle = z.infer<typeof boardPartStyleSchema>;

const boardPartSchema = z
  .strictObject({
    field: z.enum(ITEM_FIELDS),
    // Only for the 'text' field
    text: text(100).optional(),
    // Printed before this part, in this part's style, but only when this part has something to show and
    // something already came before it on the line (so a missing field leaves no stray separator)
    before: text(20),
    // {value} is replaced by the field's value
    format: text(60).refine((format) => format.includes('{value}'), 'Include {value} where the value should go'),
    style: boardPartStyleSchema.optional(),
  })
  .refine((part) => part.field !== 'text' || Boolean(part.text), { message: 'Fixed text needs some text', path: ['text'] });
export type BoardPart = z.infer<typeof boardPartSchema>;

// One line of text on an item. A line whose parts all turn out empty is left out.
const boardLineSchema = z.strictObject({
  style: boardTextStyleSchema,
  parts: z.array(boardPartSchema).min(1).max(8),
});
export type BoardLine = z.infer<typeof boardLineSchema>;

export const boardDesignSchema = z.strictObject({
  version: z.literal(DESIGN_VERSION),
  canvas: z.strictObject({
    background: hexColor,
    // TVs crop and distort the edges of the picture, so nothing but background is drawn this close to an edge
    safeMarginPx: num(0, 200),
  }),
  // Drawn at the top of every page
  header: z.strictObject({
    logo: z.strictObject({
      show: z.boolean(),
      sizePx: num(20, 600),
      align: align,
      // 'stretch' fills the square; 'contain' keeps the picture's proportions inside it
      fit: z.enum(['stretch', 'contain']),
    }),
    title: z.strictObject({
      show: z.boolean(),
      // May use {menu.name} and {date}
      text: text(100),
      gapAbovePx: num(0, 200),
      style: boardTextStyleSchema,
    }),
    // Space between the header and the first section
    gapBelowPx: num(0, 300),
  }),
  sections: z.strictObject({
    // Extra space between the last item of one section and the next section's bar
    gapPx: num(0, 200),
    bar: z.strictObject({
      heightPx: num(20, 300),
      // Space above the bar
      marginTopPx: num(0, 100),
      // The text starts this far in from the bar's left edge, and wraps this far from its right
      insetPx: num(0, 100),
      // The text starts this far down from the top of the bar
      textTopPx: num(0, 100),
      // null = no bar, just the text
      background: hexColor.nullable(),
      radiusPx: num(0, 100),
      // Added to the section's name on the pages after the first that it continues onto
      continuedSuffix: text(30),
      style: boardTextStyleSchema,
    }),
  }),
  items: z.strictObject({
    // Space around each item: half above its text, all of it below
    gapPx: num(0, 100),
    logo: z.strictObject({
      show: z.boolean(),
      sizePx: num(16, 300),
      shape: z.enum(['circle', 'rounded', 'square']),
      // Which picture to use: the item's own, then (optionally) its brewery's, then the menu's logo
      source: z.enum(['item-then-menu', 'item-then-brewery-then-menu']),
    }),
    lines: z.array(boardLineSchema).min(1).max(3),
  }),
});
export type BoardDesign = z.infer<typeof boardDesignSchema>;

// ---- Defaults and presets ----

// A text style with every setting stated
function textStyle(font: string, sizePx: number, color: string, more: Partial<BoardTextStyle> = {}): BoardTextStyle {
  return { font, sizePx, weight: 400, italic: false, color, align: 'left', transform: 'none', letterSpacingEm: 0, ...more };
}

// What a menu's board is drawn with until a design is saved for it: the Bold preset. Big condensed
// capitals on deep blue with red section bars, easy to read from across the room.
export function defaultBoardDesign(): BoardDesign {
  return boldBoardDesign();
}

// Big condensed capitals, easy to read from across the room
function boldBoardDesign(): BoardDesign {
  const quiet = { color: '#8fb8de' };
  return {
    version: DESIGN_VERSION,
    canvas: { background: '#0e2a47', safeMarginPx: 40 },
    header: {
      logo: { show: true, sizePx: 150, align: 'center', fit: 'stretch' },
      title: { show: false, text: '{menu.name}', gapAbovePx: 0, style: textStyle('bebas-neue', 60, '#ffffff', { align: 'center' }) },
      gapBelowPx: 0,
    },
    sections: {
      gapPx: 30,
      bar: {
        heightPx: 74,
        marginTopPx: 10,
        insetPx: 5,
        textTopPx: 8,
        background: '#d6402b',
        radiusPx: 0,
        continuedSuffix: ', Continued',
        style: textStyle('bebas-neue', 62, '#ffffff', { transform: 'uppercase', letterSpacingEm: 0.06 }),
      },
    },
    items: {
      gapPx: 10,
      logo: { show: true, sizePx: 64, shape: 'circle', source: 'item-then-menu' },
      lines: [
        {
          style: textStyle('bebas-neue', 64, '#ffffff', { transform: 'uppercase', letterSpacingEm: 0.03 }),
          parts: [
            { field: 'breweryName', before: '', format: '{value}' },
            { field: 'displayName', before: ' ', format: '{value}' },
            { field: 'style', before: '  ', format: '{value}', style: quiet },
            { field: 'abv', before: '  ', format: '{value}%', style: quiet },
          ],
        },
      ],
    },
  };
}

// Near-black with warm amber bars and bold uppercase section names
function darkBoardDesign(): BoardDesign {
  const quiet = { color: '#b5ab96' };
  return {
    version: DESIGN_VERSION,
    canvas: { background: '#141414', safeMarginPx: 40 },
    header: {
      logo: { show: true, sizePx: 150, align: 'center', fit: 'stretch' },
      title: { show: false, text: '{menu.name}', gapAbovePx: 0, style: textStyle('montserrat', 60, '#ffffff', { align: 'center' }) },
      gapBelowPx: 0,
    },
    sections: {
      gapPx: 30,
      bar: {
        heightPx: 60,
        marginTopPx: 10,
        insetPx: 5,
        textTopPx: 7,
        background: '#e0a526',
        radiusPx: 6,
        continuedSuffix: ', Continued',
        style: textStyle('montserrat', 38, '#141414', { weight: 700, transform: 'uppercase', letterSpacingEm: 0.08 }),
      },
    },
    items: {
      gapPx: 10,
      logo: { show: true, sizePx: 46, shape: 'circle', source: 'item-then-menu' },
      lines: [
        {
          style: textStyle('montserrat', 46, '#f1ede4'),
          parts: [
            { field: 'breweryName', before: '', format: '{value}' },
            { field: 'displayName', before: ' ', format: '{value}', style: { weight: 700 } },
            { field: 'style', before: '  ', format: '{value}', style: quiet },
            { field: 'abv', before: '  ', format: '{value}%', style: quiet },
          ],
        },
      ],
    },
  };
}

// Cream paper with serif type, the way a chalkboard menu might read
function lightBoardDesign(): BoardDesign {
  const quiet = { color: '#8c6a43', italic: true };
  return {
    version: DESIGN_VERSION,
    canvas: { background: '#f6efdc', safeMarginPx: 40 },
    header: {
      logo: { show: true, sizePx: 150, align: 'center', fit: 'stretch' },
      title: { show: false, text: '{menu.name}', gapAbovePx: 0, style: textStyle('playfair-display', 60, '#3b2a1a', { align: 'center' }) },
      gapBelowPx: 0,
    },
    sections: {
      gapPx: 30,
      bar: {
        heightPx: 60,
        marginTopPx: 10,
        insetPx: 5,
        textTopPx: 7,
        background: '#4a2f1b',
        radiusPx: 0,
        continuedSuffix: ', Continued',
        style: textStyle('playfair-display', 36, '#f6efdc', { weight: 700, align: 'center' }),
      },
    },
    items: {
      gapPx: 10,
      logo: { show: true, sizePx: 50, shape: 'circle', source: 'item-then-menu' },
      lines: [
        {
          style: textStyle('playfair-display', 50, '#3b2a1a'),
          parts: [
            { field: 'breweryName', before: '', format: '{value}' },
            { field: 'displayName', before: ' ', format: '{value}', style: { weight: 700 } },
            { field: 'style', before: '  ', format: '{value}', style: quiet },
            { field: 'abv', before: '  ', format: '{value}%', style: quiet },
          ],
        },
      ],
    },
  };
}

export function boardDesignPresets(): DesignPreset<BoardDesign>[] {
  return [
    { id: 'bold', name: 'Bold', description: 'Big condensed capitals on deep blue with red section bars, for reading from across the room.', design: boldBoardDesign() },
    { id: 'dark', name: 'Dark', description: 'Near-black background with amber section bars.', design: darkBoardDesign() },
    { id: 'light', name: 'Light', description: 'Cream background with serif type and brown section bars.', design: lightBoardDesign() },
  ];
}

// ---- Reading a stored or submitted design ----

export function parseBoardDesign(raw: unknown): ParsedDesign<BoardDesign> {
  return parseDesign(raw, boardDesignSchema, defaultBoardDesign);
}

// Every font a board design uses
export function boardDesignFonts(design: BoardDesign): Set<string> {
  const fonts = new Set<string>([design.header.title.style.font, design.sections.bar.style.font]);
  for (const line of design.items.lines) {
    fonts.add(line.style.font);
    for (const part of line.parts) if (part.style?.font) fonts.add(part.style.font);
  }
  return fonts;
}
