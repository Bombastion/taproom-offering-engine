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

The defaults are the board as it was drawn before designs existed (blue background, dark section
bars, Fira Sans), so a menu with no saved design looks exactly as it always has.
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

// ---- Defaults: the menu board as it was before designs existed ----

const FIRA: BoardTextStyle = {
  font: 'fira-sans',
  sizePx: 52.5,
  weight: 400,
  italic: false,
  color: '#f3f3f3',
  align: 'left',
  transform: 'none',
  letterSpacingEm: 0,
};

const QUIET = '#9d9d9d';

export function defaultBoardDesign(): BoardDesign {
  return {
    version: DESIGN_VERSION,
    canvas: { background: '#175a6c', safeMarginPx: 40 },
    header: {
      logo: { show: true, sizePx: 150, align: 'center', fit: 'stretch' },
      title: { show: false, text: '{menu.name}', gapAbovePx: 0, style: { ...FIRA, sizePx: 60, color: '#ffffff', align: 'center' } },
      gapBelowPx: 0,
    },
    sections: {
      gapPx: 30,
      bar: {
        heightPx: 52.5,
        marginTopPx: 10,
        insetPx: 5,
        textTopPx: 2.5,
        background: '#2b2b2b',
        radiusPx: 0,
        continuedSuffix: ', Continued',
        style: { ...FIRA, sizePx: 42.5, color: '#ffffff' },
      },
    },
    items: {
      gapPx: 10,
      logo: { show: true, sizePx: 52.5, shape: 'circle', source: 'item-then-menu' },
      lines: [
        {
          style: FIRA,
          parts: [
            { field: 'breweryName', before: '', format: '{value}' },
            { field: 'displayName', before: ' ', format: '{value}' },
            { field: 'style', before: '  ', format: '{value}', style: { color: QUIET } },
            { field: 'abv', before: '  ', format: '{value}%', style: { color: QUIET } },
          ],
        },
      ],
    },
  };
}

// ---- Presets ----

function withFont(design: BoardDesign, font: string, weights: { bar?: number; item?: number } = {}): BoardDesign {
  const lines = design.items.lines.map((line) => ({ ...line, style: { ...line.style, font, weight: weights.item ?? line.style.weight } }));
  return {
    ...design,
    header: { ...design.header, title: { ...design.header.title, style: { ...design.header.title.style, font } } },
    sections: { ...design.sections, bar: { ...design.sections.bar, style: { ...design.sections.bar.style, font, weight: weights.bar ?? design.sections.bar.style.weight } } },
    items: { ...design.items, lines },
  };
}

// Near-black with warm amber bars and bold uppercase section names
function darkBoardDesign(): BoardDesign {
  const base = withFont(defaultBoardDesign(), 'montserrat', { bar: 700 });
  const item = { ...base.items.lines[0].style, color: '#f1ede4', sizePx: 46 };
  return {
    ...base,
    canvas: { ...base.canvas, background: '#141414' },
    sections: {
      ...base.sections,
      bar: {
        ...base.sections.bar,
        heightPx: 60,
        textTopPx: 7,
        background: '#e0a526',
        radiusPx: 6,
        style: { ...base.sections.bar.style, sizePx: 38, color: '#141414', transform: 'uppercase', letterSpacingEm: 0.08 },
      },
    },
    items: {
      ...base.items,
      logo: { ...base.items.logo, sizePx: 46 },
      lines: [
        {
          style: item,
          parts: base.items.lines[0].parts.map((part, index) =>
            index === 1 ? { ...part, style: { weight: 700 } } : part.style ? { ...part, style: { color: '#b5ab96' } } : part),
        },
      ],
    },
  };
}

// Cream paper with serif type, the way a chalkboard menu might read
function lightBoardDesign(): BoardDesign {
  const base = withFont(defaultBoardDesign(), 'playfair-display', { bar: 700 });
  const item = { ...base.items.lines[0].style, color: '#3b2a1a', sizePx: 50 };
  return {
    ...base,
    canvas: { ...base.canvas, background: '#f6efdc' },
    sections: {
      ...base.sections,
      bar: {
        ...base.sections.bar,
        heightPx: 60,
        textTopPx: 7,
        background: '#4a2f1b',
        radiusPx: 0,
        style: { ...base.sections.bar.style, sizePx: 36, color: '#f6efdc', align: 'center' },
      },
    },
    items: {
      ...base.items,
      logo: { ...base.items.logo, sizePx: 50 },
      lines: [
        {
          style: item,
          parts: base.items.lines[0].parts.map((part, index) =>
            index === 1 ? { ...part, style: { weight: 700 } } : part.style ? { ...part, style: { color: '#8c6a43', italic: true } } : part),
        },
      ],
    },
  };
}

// Big condensed capitals, easy to read from across the room
function boldBoardDesign(): BoardDesign {
  const base = withFont(defaultBoardDesign(), 'bebas-neue');
  const item = { ...base.items.lines[0].style, sizePx: 64, color: '#ffffff', transform: 'uppercase' as const, letterSpacingEm: 0.03 };
  return {
    ...base,
    canvas: { ...base.canvas, background: '#0e2a47' },
    sections: {
      ...base.sections,
      bar: {
        ...base.sections.bar,
        heightPx: 74,
        textTopPx: 8,
        background: '#d6402b',
        style: { ...base.sections.bar.style, sizePx: 62, transform: 'uppercase', letterSpacingEm: 0.06 },
      },
    },
    items: {
      ...base.items,
      logo: { ...base.items.logo, sizePx: 64 },
      lines: [
        {
          style: item,
          parts: base.items.lines[0].parts.map((part) => (part.style ? { ...part, style: { color: '#8fb8de' } } : part)),
        },
      ],
    },
  };
}

export function boardDesignPresets(): DesignPreset<BoardDesign>[] {
  return [
    { id: 'classic', name: 'Classic', description: 'Blue background with dark section bars: the board as it has always looked.', design: defaultBoardDesign() },
    { id: 'dark', name: 'Dark', description: 'Near-black background with amber section bars.', design: darkBoardDesign() },
    { id: 'light', name: 'Light', description: 'Cream background with serif type and brown section bars.', design: lightBoardDesign() },
    { id: 'bold', name: 'Bold', description: 'Big condensed capitals on deep blue, for reading from across the room.', design: boldBoardDesign() },
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
