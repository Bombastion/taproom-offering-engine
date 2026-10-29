import { z } from 'zod';
import { isFontId } from './fonts';

/*
How a menu looks on one of its views, as data. Today that is the print menu; the menu board will use
the same pieces later (see DESIGN_VIEWS).

A design is a JSON document, one per (menu, view), kept in the MenuDesign table. It is written by users
(through the admin API) and rendered on public pages, so it is deliberately not free-form: every value
is a number inside a range, one of a fixed list of words, a '#rrggbb' color, a font the server hosts
(by ID, see models/fonts.ts) or a short piece of text, and nothing but those validated values ever
reaches the stylesheet. Text is only ever placed in the page escaped.

Every field has a default, and the defaults reproduce the print menu as it looked before designs
existed. A stored design only needs to hold what differs; parsePrintDesign() fills in the rest, so a
field added later doesn't break designs stored without it.

Units: font sizes are points (pt); spacing is in rem (1 = the menu's normal 16px text size, scaling with
the rest of the menu when it is shrunk to fit its pages); page margins are inches; widths are percent.
*/

export const DESIGN_VERSION = 1;

// The views that can be designed. Only 'print' has a renderer so far.
export const DESIGN_VIEWS = ['print', 'board'] as const;
export type DesignView = typeof DESIGN_VIEWS[number];

// The database keeps the view as plain text (so adding a view needs no migration); this is where text
// becomes a DesignView, for anything that arrives as a string
export function isDesignView(value: unknown): value is DesignView {
  return typeof value === 'string' && (DESIGN_VIEWS as readonly string[]).includes(value);
}

// A design as the database holds it. `spec` is whatever was stored (possibly an older format, or one
// that only lists what differs from the defaults); read it with parsePrintDesign().
export interface StoredMenuDesign {
  id: string;
  menuId: string;
  view: DesignView;
  version: number;
  spec: unknown;
  updatedAt: Date;
}

// The largest design accepted, as JSON
export const MAX_DESIGN_BYTES = 16 * 1024;

// ---- Building blocks ----

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use a color like #3f3f3f')
  .transform((color) => color.toLowerCase());

const num = (min: number, max: number) => z.number().min(min, `At least ${min}`).max(max, `At most ${max}`);

// Text that ends up on the page: no control characters other than line breaks, and not very long
const noControlCharacters = (value: string) => !/[\u0000-\u0009\u000B-\u001F\u007F]/.test(value);
const text = (max: number) => z.string().max(max, `At most ${max} characters`).refine(noControlCharacters, 'Contains characters that cannot be printed');

const fontId = z.string().refine(isFontId, 'Not one of the available fonts');

const weight = z
  .number()
  .int()
  .min(100)
  .max(900)
  .refine((value) => value % 100 === 0, 'Use 100, 200, ... 900');

const align = z.enum(['left', 'center', 'right']);

const columnId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, 'Use lowercase letters, numbers, - and _');

// ---- Text and boxes ----

export const textStyleSchema = z.strictObject({
  font: fontId,
  sizePt: num(4, 96),
  weight: weight,
  italic: z.boolean(),
  color: hexColor,
  align: align,
  transform: z.enum(['none', 'uppercase']),
  letterSpacingEm: num(-0.2, 1),
  // null = the font's normal line height
  lineHeight: num(0.8, 3).nullable(),
});
export type TextStyle = z.infer<typeof textStyleSchema>;

const spacing = z.strictObject({ top: num(0, 5), right: num(0, 5), bottom: num(0, 5), left: num(0, 5) });

export const boxSchema = z.strictObject({
  paddingRem: spacing,
  border: z.strictObject({
    widthPx: num(0, 20),
    style: z.enum(['none', 'solid', 'dashed', 'dotted', 'double']),
    color: hexColor,
  }),
  // null = transparent
  background: hexColor.nullable(),
  radiusPx: num(0, 50),
});
export type Box = z.infer<typeof boxSchema>;

// ---- Columns ----

// The fields of an item that can be printed. 'text' is fixed text typed into the design.
export const ITEM_FIELDS = ['breweryName', 'breweryLocation', 'displayName', 'style', 'abv', 'description', 'category', 'text'] as const;
export type ItemField = typeof ITEM_FIELDS[number];

const partSchema = z
  .strictObject({
    field: z.enum(ITEM_FIELDS),
    // Only for the 'text' field
    text: text(100).optional(),
    // Printed before this part, but only when this part has something to print and something
    // already came before it on the line (so a missing field leaves no stray separator)
    before: text(20),
    // {value} is replaced by the field's value
    format: text(60).refine((format) => format.includes('{value}'), 'Include {value} where the value should go'),
    // Differences from the line's style, e.g. a bold name
    style: textStyleSchema.partial().optional(),
  })
  .refine((part) => part.field !== 'text' || Boolean(part.text), { message: 'Fixed text needs some text', path: ['text'] });
export type Part = z.infer<typeof partSchema>;

// One line of text in a cell. A line whose parts all turn out empty is left out.
const lineSchema = z.strictObject({
  style: textStyleSchema,
  parts: z.array(partSchema).min(1).max(8),
});
export type Line = z.infer<typeof lineSchema>;

// Text about the item. `lines` sit on the item's main row next to the other columns; `belowLines` are
// on a second row under it (where the description goes), so they don't push the prices off-center.
const fieldsColumnSchema = z.strictObject({
  id: columnId,
  type: z.literal('fields'),
  // null = shares whatever width the other columns leave
  widthPct: num(5, 100).nullable(),
  lines: z.array(lineSchema).max(4),
  belowLines: z.array(lineSchema).max(4),
});
export type FieldsColumn = z.infer<typeof fieldsColumnSchema>;

// One price cell per pour size on the section, each headed by the size's name
const pricesColumnSchema = z.strictObject({
  id: columnId,
  type: z.literal('prices'),
  widthPct: num(5, 100).nullable(),
  // How wide each pour size's cell is, as a share of this column
  sizeWidthPct: num(5, 100),
  // Every pour size on the section, or only these (by pour size ID)
  sizes: z.union([z.literal('all'), z.array(z.string().max(100)).max(50)]),
  heading: z.strictObject({ show: z.boolean(), style: textStyleSchema }),
  cell: z.strictObject({
    style: textStyleSchema,
    // {value} is the price, e.g. 8.00
    format: text(30).refine((format) => format.includes('{value}'), 'Include {value} where the price should go'),
  }),
});
export type PricesColumn = z.infer<typeof pricesColumnSchema>;

// The item's picture
const thumbnailColumnSchema = z.strictObject({
  id: columnId,
  type: z.literal('thumbnail'),
  sizePx: num(16, 200),
  shape: z.enum(['circle', 'rounded', 'square']),
  // Which picture to use: the item's own, then (optionally) its brewery's, then the menu's logo
  source: z.enum(['item-then-menu', 'item-then-brewery-then-menu']),
});
export type ThumbnailColumn = z.infer<typeof thumbnailColumnSchema>;

export const columnSchema = z.discriminatedUnion('type', [fieldsColumnSchema, pricesColumnSchema, thumbnailColumnSchema]);
export type Column = z.infer<typeof columnSchema>;

// ---- The print design ----

export const PAGE_SIZES = {
  letter: { widthIn: 8.5, heightIn: 11, css: 'letter' },
  legal: { widthIn: 8.5, heightIn: 14, css: 'legal' },
  a4: { widthIn: 210 / 25.4, heightIn: 297 / 25.4, css: 'A4' },
} as const;

export const printDesignSchema = z
  .strictObject({
    version: z.literal(DESIGN_VERSION),
    page: z.strictObject({
      size: z.enum(['letter', 'legal', 'a4']),
      marginsIn: z.strictObject({ top: num(0, 2), right: num(0, 2), bottom: num(0, 2), left: num(0, 2) }),
      // The most pages the menu may take, when it is allowed to shrink to fit them; null = no limit
      maxPages: z.number().int().min(1).max(20).nullable(),
      // 'shrink-to-pages' scales every size down (never up) until the menu fits maxPages; 'none' uses the sizes as given
      fit: z.enum(['shrink-to-pages', 'none']),
      background: hexColor,
    }),
    header: z.strictObject({
      logo: z.strictObject({
        show: z.boolean(),
        // The logo is at most this wide, as a share of the printable width
        maxWidthPct: num(1, 100),
        align: align,
        spaceBelowRem: num(0, 5),
      }),
      title: z.strictObject({
        show: z.boolean(),
        // May use {menu.name} and {date}
        text: text(200),
        style: textStyleSchema,
      }),
    }),
    sections: z.strictObject({
      widthPct: num(30, 100),
      gapAboveRem: num(0, 5),
      heading: z.strictObject({ style: textStyleSchema, box: boxSchema }),
    }),
    columns: z.array(columnSchema).min(1).max(6),
    rows: z.strictObject({
      // Extra space under each item
      gapRem: num(0, 3),
      divider: z.strictObject({
        show: z.boolean(),
        color: hexColor,
        widthPx: num(1, 10),
        style: z.enum(['solid', 'dashed', 'dotted']),
      }),
    }),
    footer: z.strictObject({
      show: z.boolean(),
      // May use {menu.name} and {date}; a line break starts a new line (up to 4)
      text: text(400).refine((value) => value.split('\n').length <= 4, 'At most 4 lines'),
      style: textStyleSchema,
      rule: z.strictObject({ show: z.boolean(), color: hexColor, widthPx: num(1, 10) }),
      // Distance from the bottom edge of every page
      bottomIn: num(0, 3),
    }),
  })
  .superRefine((design, ctx) => {
    const seen = new Set<string>();
    design.columns.forEach((column, index) => {
      if (seen.has(column.id)) {
        ctx.addIssue({ code: 'custom', message: `Column IDs must be different (“${column.id}” is used twice)`, path: ['columns', index, 'id'] });
      }
      seen.add(column.id);
    });
    const widths = design.columns.reduce((sum, column) => sum + (column.type === 'thumbnail' ? 0 : column.widthPct ?? 0), 0);
    if (widths > 100) {
      ctx.addIssue({ code: 'custom', message: `Column widths add up to ${widths}%; they can be at most 100%`, path: ['columns'] });
    }
  });
export type PrintDesign = z.infer<typeof printDesignSchema>;

// ---- Defaults: the print menu as it was before designs existed ----

// Item text: the browser's default serif at its default size
const BODY_TEXT: TextStyle = {
  font: 'system-serif',
  sizePt: 12,
  weight: 400,
  italic: false,
  color: '#000000',
  align: 'left',
  transform: 'none',
  letterSpacingEm: 0,
  lineHeight: null,
};

const HEADING_TEXT: TextStyle = { ...BODY_TEXT, font: 'roboto', sizePt: 18, weight: 700, color: '#3f3f3f', align: 'center' };

export function defaultPrintDesign(): PrintDesign {
  return {
    version: DESIGN_VERSION,
    page: {
      size: 'letter',
      marginsIn: { top: 0.5, right: 0.3, bottom: 0.75, left: 0.3 },
      maxPages: 2,
      fit: 'shrink-to-pages',
      background: '#ffffff',
    },
    header: {
      logo: { show: true, maxWidthPct: 8, align: 'center', spaceBelowRem: 0 },
      title: { show: false, text: '{menu.name}', style: { ...HEADING_TEXT, sizePt: 24 } },
    },
    sections: {
      widthPct: 96,
      gapAboveRem: 0,
      heading: {
        style: { ...HEADING_TEXT },
        box: {
          paddingRem: { top: 0.625, right: 0.625, bottom: 0.625, left: 0.625 },
          border: { widthPx: 3, style: 'solid', color: '#949494' },
          background: null,
          radiusPx: 0,
        },
      },
    },
    columns: [
      {
        id: 'item',
        type: 'fields',
        widthPct: 70,
        lines: [
          {
            style: { ...BODY_TEXT },
            parts: [
              { field: 'breweryName', before: '', format: '{value}' },
              { field: 'displayName', before: ' • ', format: '{value}', style: { weight: 700 } },
              { field: 'style', before: ' • ', format: '{value}' },
              { field: 'abv', before: ' • ', format: '{value}% ABV' },
            ],
          },
        ],
        belowLines: [{ style: { ...BODY_TEXT }, parts: [{ field: 'description', before: '', format: '{value}' }] }],
      },
      {
        id: 'prices',
        type: 'prices',
        widthPct: null,
        sizeWidthPct: 25,
        sizes: 'all',
        heading: { show: true, style: { ...BODY_TEXT, weight: 700, align: 'center' } },
        cell: { style: { ...BODY_TEXT, align: 'center' }, format: '${value}' },
      },
    ],
    rows: {
      gapRem: 0,
      divider: { show: false, color: '#cccccc', widthPx: 1, style: 'solid' },
    },
    footer: {
      show: false,
      text: '',
      style: { ...BODY_TEXT, font: 'roboto', sizePt: 10, color: '#3f3f3f', align: 'center' },
      rule: { show: true, color: '#949494', widthPx: 1 },
      bottomIn: 0.3,
    },
  };
}

// Designs people can start from (copied into the draft, never referenced)
export interface DesignPreset {
  id: string;
  name: string;
  description: string;
  design: PrintDesign;
}

export function printDesignPresets(): DesignPreset[] {
  return [{ id: 'classic', name: 'Classic', description: 'The print menu as it has always looked.', design: defaultPrintDesign() }];
}

// ---- Reading a stored or submitted design ----

export interface DesignIssue {
  // Where, e.g. "sections.heading.style.sizePt"
  path: string;
  message: string;
}

export type ParsedDesign = { ok: true; design: PrintDesign } | { ok: false; issues: DesignIssue[] };

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Lays `overrides` over `base`: objects are merged field by field; anything else (numbers, text, lists,
// null) replaces what is there. Keys that could tamper with object prototypes are dropped.
function mergeOver(base: unknown, overrides: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overrides)) return overrides;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (UNSAFE_KEYS.has(key)) continue;
    merged[key] = key in base ? mergeOver(base[key], value) : value;
  }
  return merged;
}

// Brings a design written by an older version of the format up to the current one. There is only one
// version so far; when the format changes, add a step here instead of breaking stored designs.
export function migrateDesign(raw: unknown): { ok: true; design: unknown } | { ok: false; issues: DesignIssue[] } {
  if (!isPlainObject(raw)) return { ok: false, issues: [{ path: '', message: 'A design must be an object' }] };
  const version = raw.version ?? DESIGN_VERSION;
  if (version !== DESIGN_VERSION) {
    return { ok: false, issues: [{ path: 'version', message: `Designs of version ${String(version)} are not supported` }] };
  }
  return { ok: true, design: raw };
}

// Validates a design, using the default for anything it leaves out. Never throws.
export function parsePrintDesign(raw: unknown): ParsedDesign {
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(raw) ?? '', 'utf8');
  } catch {
    return { ok: false, issues: [{ path: '', message: 'The design could not be read' }] };
  }
  if (size > MAX_DESIGN_BYTES) {
    return { ok: false, issues: [{ path: '', message: `The design is too large (at most ${MAX_DESIGN_BYTES / 1024} KB)` }] };
  }
  const migrated = migrateDesign(raw);
  if (!migrated.ok) return migrated;
  const parsed = printDesignSchema.safeParse(mergeOver(defaultPrintDesign(), migrated.design));
  if (!parsed.success) {
    const issues: DesignIssue[] = [];
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      if (issue.code === 'unrecognized_keys') {
        // One issue per stray key, so the message points at the key itself
        for (const key of issue.keys) issues.push({ path: path ? `${path}.${key}` : key, message: 'Not a setting a design has' });
      } else {
        issues.push({ path, message: issue.message });
      }
    }
    return { ok: false, issues };
  }
  return { ok: true, design: parsed.data };
}

// Every font a design uses
export function designFonts(design: PrintDesign): Set<string> {
  const fonts = new Set<string>();
  const addStyle = (style: { font?: string } | undefined) => {
    if (style?.font) fonts.add(style.font);
  };
  addStyle(design.header.title.style);
  addStyle(design.sections.heading.style);
  addStyle(design.footer.style);
  for (const column of design.columns) {
    if (column.type === 'fields') {
      for (const line of [...column.lines, ...column.belowLines]) {
        addStyle(line.style);
        line.parts.forEach((part) => addStyle(part.style));
      }
    } else if (column.type === 'prices') {
      addStyle(column.heading.style);
      addStyle(column.cell.style);
    }
  }
  return fonts;
}
