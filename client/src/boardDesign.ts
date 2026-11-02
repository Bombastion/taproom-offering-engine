import type { Align, DesignState, ItemField, Line, Part } from './design';

// The menu board design as the admin app edits it. The server (models/boardDesign.ts) decides what a
// valid design is; like the print design, the designer holds the whole design it was given and sends it
// all back. Every size is in pixels of the board's picture (BOARD_WIDTH x BOARD_HEIGHT).

export const BOARD_WIDTH = 1080;
export const BOARD_HEIGHT = 1920;

export type BoardTextStyle = {
  font: string;
  sizePx: number;
  weight: number;
  italic: boolean;
  color: string;
  align: Align;
  transform: 'none' | 'uppercase';
  letterSpacingEm: number;
};

export type BoardLine = Line<BoardTextStyle>;
export type BoardPart = Part<BoardTextStyle>;

export type LogoShape = 'circle' | 'rounded' | 'square';

export type BoardDesign = {
  version: number;
  canvas: { background: string; safeMarginPx: number };
  header: {
    logo: { show: boolean; sizePx: number; align: Align; fit: 'stretch' | 'contain' };
    title: { show: boolean; text: string; gapAbovePx: number; style: BoardTextStyle };
    gapBelowPx: number;
  };
  sections: {
    gapPx: number;
    bar: {
      heightPx: number;
      marginTopPx: number;
      insetPx: number;
      textTopPx: number;
      background: string | null;
      radiusPx: number;
      continuedSuffix: string;
      style: BoardTextStyle;
    };
  };
  items: {
    gapPx: number;
    logo: { show: boolean; sizePx: number; shape: LogoShape; source: 'item-then-menu' | 'item-then-brewery-then-menu' };
    lines: BoardLine[];
  };
  // Anything a newer server adds is carried along untouched
  [other: string]: unknown;
};

export type BoardDesignState = DesignState<BoardDesign>;

export const MAX_BOARD_LINES = 3;

// What the server lets a text style's numbers be
export const BOARD_TEXT_LIMITS = { sizePx: { min: 10, max: 200 }, letterSpacingEm: { min: -0.1, max: 0.5 } } as const;

export function isBoardStyle(style: object): style is BoardTextStyle {
  return 'sizePx' in style;
}

// A line to start from, in the style of the first one
export function newBoardLine(lines: BoardLine[]): BoardLine {
  const first = lines[0]?.style;
  const style: BoardTextStyle = first
    ? { ...first, sizePx: Math.max(BOARD_TEXT_LIMITS.sizePx.min, Math.round(first.sizePx * 0.6)) }
    : { font: 'fira-sans', sizePx: 32, weight: 400, italic: false, color: '#f3f3f3', align: 'left', transform: 'none', letterSpacingEm: 0 };
  return { style, parts: [{ field: 'description' as ItemField, before: '', format: '{value}' }] };
}

// The look of a preset, with what belongs to this menu and its screen kept as it is: whether the
// logo and title show (and the title's words), and how far from the edge the TV needs things to stay.
export function applyBoardPreset(current: BoardDesign, preset: BoardDesign): BoardDesign {
  return {
    ...preset,
    canvas: { ...preset.canvas, safeMarginPx: current.canvas.safeMarginPx },
    header: {
      ...preset.header,
      logo: { ...preset.header.logo, show: current.header.logo.show },
      title: { ...preset.header.title, show: current.header.title.show, text: current.header.title.text },
    },
  };
}
