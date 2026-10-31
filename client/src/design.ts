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

// A line of item text. Its parts (which field, what is printed before it) have no controls yet.
export type Line = { style: TextStyle; parts: ReadonlyArray<{ field: string; style?: Partial<TextStyle>; [other: string]: unknown }>; [other: string]: unknown };

export type FieldsColumn = { id: string; type: 'fields'; lines: Line[]; belowLines: Line[]; [other: string]: unknown };

export type PricesColumn = {
  id: string;
  type: 'prices';
  heading: { show: boolean; style: TextStyle };
  cell: { style: TextStyle; format: string };
  [other: string]: unknown;
};

export type OtherColumn = { id: string; type: 'thumbnail'; [other: string]: unknown };

export type Column = FieldsColumn | PricesColumn | OtherColumn;

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
  footer: {
    show: boolean;
    text: string;
    style: TextStyle;
    rule: { show: boolean; color: string; widthPx: number };
    bottomIn: number;
  };
  // rows has no controls yet
  [other: string]: unknown;
};

// The first column of a kind, and where it is in the design (the designer edits the first of each
// until it has a columns editor)
export function findColumn<T extends Column['type']>(design: PrintDesign, type: T): { index: number; column: Extract<Column, { type: T }> } | null {
  const index = design.columns.findIndex((column) => column.type === type);
  return index < 0 ? null : { index, column: design.columns[index] as Extract<Column, { type: T }> };
}

const FIELD_NAMES: Record<string, string> = {
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

// The parts of a line that are styled differently from the rest of it (the item name is bold by default)
export function styledSeparately(line: Line): string[] {
  return line.parts.filter((part) => part.style && Object.keys(part.style).length > 0).map((part) => FIELD_NAMES[part.field] ?? part.field);
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
