// The print menu design as the admin app edits it. The server (models/menuDesign.ts) is the one that
// decides what a valid design is; this describes the parts the designer has controls for. The designer
// holds the whole design it was given and sends it all back, so what it has no control for yet is
// carried along untouched.

export type Align = 'left' | 'center' | 'right';

export type TextStyle = {
  font: string;
  sizePt: number;
  weight: number;
  italic: boolean;
  color: string;
  align: Align;
  transform: 'none' | 'uppercase';
  letterSpacingEm: number;
  lineHeight: number | null;
};

export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted' | 'double';

export type Box = {
  paddingRem: { top: number; right: number; bottom: number; left: number };
  border: { widthPx: number; style: BorderStyle; color: string };
  background: string | null;
  radiusPx: number;
};

export type PageSize = 'letter' | 'legal' | 'a4';

// ---- Columns ----

export type ItemField = 'breweryName' | 'breweryLocation' | 'displayName' | 'style' | 'abv' | 'description' | 'category' | 'text';

// What each field of an item is called, in the order they are offered
export const ITEM_FIELDS: { value: ItemField; label: string }[] = [
  { value: 'breweryName', label: 'Brewery' },
  { value: 'breweryLocation', label: 'Brewery location' },
  { value: 'displayName', label: 'Item name' },
  { value: 'style', label: 'Style' },
  { value: 'abv', label: 'ABV' },
  { value: 'description', label: 'Description' },
  { value: 'category', label: 'Category' },
  { value: 'text', label: 'Fixed text' },
];

// One thing printed on a line: a field of the item, with what comes before it and how it is written
export type Part = {
  field: ItemField;
  // Only for the 'text' field
  text?: string;
  before: string;
  format: string;
  // What differs from the line's own style (the item name is bold by default)
  style?: Partial<TextStyle>;
};

export type Line = { style: TextStyle; parts: Part[] };

export type FieldsColumn = { id: string; type: 'fields'; widthPct: number | null; lines: Line[]; belowLines: Line[] };

export type PricesColumn = {
  id: string;
  type: 'prices';
  widthPct: number | null;
  sizeWidthPct: number;
  sizes: 'all' | string[];
  heading: { show: boolean; style: TextStyle };
  cell: { style: TextStyle; format: string };
};

export type ThumbnailShape = 'circle' | 'rounded' | 'square';
export type ThumbnailSource = 'item-then-menu' | 'item-then-brewery-then-menu';

export type ThumbnailColumn = { id: string; type: 'thumbnail'; sizePx: number; shape: ThumbnailShape; source: ThumbnailSource };

export type Column = FieldsColumn | PricesColumn | ThumbnailColumn;

export const MAX_COLUMNS = 6;
export const MAX_LINES = 4;
export const MAX_PARTS = 8;

// The standard text of the menu (what the server's design starts item text from)
export const BODY_TEXT: TextStyle = {
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

export type RowsDesign = {
  gapRem: number;
  divider: { show: boolean; color: string; widthPx: number; style: 'solid' | 'dashed' | 'dotted' };
};

export type PrintDesign = {
  version: number;
  page: {
    size: PageSize;
    marginsIn: { top: number; right: number; bottom: number; left: number };
    maxPages: number | null;
    fit: 'shrink-to-pages' | 'none';
    background: string;
  };
  header: {
    logo: { show: boolean; maxWidthPct: number; align: Align; spaceBelowRem: number };
    title: { show: boolean; text: string; style: TextStyle };
  };
  sections: { widthPct: number; gapAboveRem: number; heading: { style: TextStyle; box: Box } };
  columns: Column[];
  rows: RowsDesign;
  footer: {
    show: boolean;
    text: string;
    style: TextStyle;
    rule: { show: boolean; color: string; widthPx: number };
    bottomIn: number;
  };
  // Anything a newer server adds is carried along untouched
  [other: string]: unknown;
};

const FIELD_NAMES: Record<ItemField, string> = {
  breweryName: 'brewery',
  breweryLocation: 'brewery location',
  displayName: 'name',
  style: 'style',
  abv: 'ABV',
  description: 'description',
  category: 'category',
  text: 'fixed text',
};

// What a line prints, in words ("brewery, name, style, ABV")
export function describeLine(line: Line): string {
  return line.parts.map((part) => FIELD_NAMES[part.field] ?? part.field).join(', ');
}

export function columnTitle(column: Column): string {
  return column.type === 'fields' ? 'Item details' : column.type === 'prices' ? 'Prices' : 'Picture';
}

// How wide a column asks to be, as a share of the row (a picture is sized in pixels instead)
export function columnWidth(column: Column): number {
  return column.type === 'thumbnail' ? 0 : column.widthPct ?? 0;
}

// What is left of the row's width once every column but one has its share
export function widthLeft(columns: Column[], except: number): number {
  return 100 - columns.reduce((sum, column, index) => sum + (index === except ? 0 : columnWidth(column)), 0);
}

// A short account of what a column does, for its list entry
export function describeColumn(column: Column): string {
  if (column.type === 'thumbnail') return `${column.sizePx}px, ${column.shape}`;
  const width = column.widthPct === null ? 'shares the rest' : `${column.widthPct}% wide`;
  if (column.type === 'prices') return `${width}, ${column.sizes === 'all' ? 'every size' : column.sizes.length === 1 ? '1 size' : `${column.sizes.length} sizes`}`;
  const shown = [...column.lines, ...column.belowLines].map(describeLine).filter(Boolean);
  return `${width}${shown.length > 0 ? `, ${shown.join('; ')}` : ''}`;
}

// A column's ID is its place in the design for as long as it is there (styles and the list key off it)
export function newColumnId(columns: Column[], type: Column['type']): string {
  const taken = new Set(columns.map((column) => column.id));
  for (let n = 1; ; n += 1) {
    const id = n === 1 ? type : `${type}-${n}`;
    if (!taken.has(id)) return id;
  }
}

// The style new text starts from: that of the design's existing item text, if it has any
function textStyleOf(columns: Column[]): TextStyle {
  for (const column of columns) {
    if (column.type === 'fields') {
      const line = column.lines[0] ?? column.belowLines[0];
      if (line) return line.style;
    }
    if (column.type === 'prices') return { ...column.cell.style, align: 'left' };
  }
  return BODY_TEXT;
}

export function newColumn(type: Column['type'], columns: Column[]): Column {
  const id = newColumnId(columns, type);
  const base = textStyleOf(columns);
  if (type === 'fields') {
    return { id, type, widthPct: null, lines: [{ style: base, parts: [{ field: 'displayName', before: '', format: '{value}' }] }], belowLines: [] };
  }
  if (type === 'prices') {
    const centered = { ...base, align: 'center' as const };
    return { id, type, widthPct: null, sizeWidthPct: 25, sizes: 'all', heading: { show: true, style: centered }, cell: { style: centered, format: '${value}' } };
  }
  return { id, type, sizePx: 32, shape: 'circle', source: 'item-then-menu' };
}

// A line to start from, in the style of the lines already in the column
export function newLine(column: FieldsColumn, below: boolean): Line {
  const style = (below ? column.belowLines[0] ?? column.lines[0] : column.lines[0] ?? column.belowLines[0])?.style ?? BODY_TEXT;
  return { style, parts: [{ field: below ? 'description' : 'displayName', before: '', format: '{value}' }] };
}

// The next part for a line: a field it doesn't print yet, if any is left
export function newPart(line: Line): Part {
  const used = new Set(line.parts.map((part) => part.field));
  const field = ITEM_FIELDS.find((f) => f.value !== 'text' && !used.has(f.value))?.value ?? 'text';
  return { field, ...(field === 'text' ? { text: 'Text' } : {}), before: line.parts.length > 0 ? ' • ' : '', format: '{value}' };
}

// Only the settings of `style` that are different from `base`
export function styleDifferences(base: TextStyle, style: TextStyle): Partial<TextStyle> {
  const changes: Partial<TextStyle> = {};
  for (const key of Object.keys(style) as (keyof TextStyle)[]) {
    if (style[key] !== base[key]) (changes as Record<string, unknown>)[key] = style[key];
  }
  return changes;
}

// A menu's design as the server answers for it
export type PrintDesignState = {
  design: PrintDesign;
  // Nothing has been saved for this menu, so this is the standard design
  isDefault: boolean;
  updatedAt: string | null;
  // What was saved could no longer be read, so the standard design is shown in its place
  storedDesignInvalid?: boolean;
};

// What the server says is wrong with a design
export type DesignIssue = { path: string; message: string };

// A design to start from (GET /api/design/presets)
export type DesignPreset = {
  id: string;
  name: string;
  description: string;
  design: PrintDesign;
};

export type FontInfo = {
  id: string;
  label: string;
  category: 'sans' | 'serif' | 'display' | 'script' | 'system';
  // The weights the font really has (anything else the browser would have to fake)
  weights: number[];
  italic: boolean;
};

// How big a page is on screen, in CSS pixels at 96 per inch (the same sizes the server's print page uses)
export const PAGE_PX: Record<PageSize, { width: number; height: number }> = {
  letter: { width: 816, height: 1056 },
  legal: { width: 816, height: 1344 },
  a4: { width: 794, height: 1123 },
};

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

type Path = ReadonlyArray<string | number>;

// A copy of `value` with what is at `path` replaced; nothing else is copied more than it has to be
export function setIn<T>(value: T, path: Path, replacement: unknown): T {
  if (path.length === 0) return replacement as T;
  const [key, ...rest] = path;
  const copy: any = Array.isArray(value) ? [...value] : { ...(value as object) };
  copy[key] = setIn(copy[key], rest, replacement);
  return copy;
}

export function sameDesign(a: PrintDesign, b: PrintDesign): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// The weight a font has that is closest to the one asked for, preferring the heavier one on a tie
export function nearestWeight(weights: number[], wanted: number): number {
  if (weights.length === 0) return wanted;
  return weights.reduce((best, weight) => {
    const distance = Math.abs(weight - wanted);
    const bestDistance = Math.abs(best - wanted);
    return distance < bestDistance || (distance === bestDistance && weight > best) ? weight : best;
  });
}

// What changing a text style's font means for the rest of it: the weight and italic have to be ones the new font has
export function styleForFont(style: TextStyle, font: FontInfo): TextStyle {
  return {
    ...style,
    font: font.id,
    weight: nearestWeight(font.weights, style.weight),
    italic: font.italic ? style.italic : false,
  };
}

// '#rrggbb' or '#rrggbbaa'
export const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

// The look of a preset, with the things that belong to this menu rather than to a look kept as they
// are: whether the logo and title show (and the title's words), the footer and its words, and the
// paper size.
export function applyPreset(current: PrintDesign, preset: PrintDesign): PrintDesign {
  return {
    ...preset,
    page: { ...preset.page, size: current.page.size },
    header: {
      logo: { ...preset.header.logo, show: current.header.logo.show },
      title: { ...preset.header.title, show: current.header.title.show, text: current.header.title.text },
    },
    footer: { ...preset.footer, show: current.footer.show, text: current.footer.text },
  };
}
