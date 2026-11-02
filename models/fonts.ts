// The fonts a menu design can use. A design names a font by its ID here, never by a CSS family
// name, so a stored design can't smuggle anything into the stylesheet and every font it can ask
// for is one this server actually hosts (public/fonts, served at /fonts).

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'system';

export interface FontFile {
  // Under public/fonts
  file: string;
  // A single weight, or the range a variable font covers
  weight: number | [number, number];
  italic: boolean;
}

export interface FontEntry {
  id: string;
  label: string;
  category: FontCategory;
  // The family name the @font-face rules declare; null for the system fonts, which have no files
  cssFamily: string | null;
  // What to fall back on if the font hasn't loaded (or lacks a character)
  fallback: 'serif' | 'sans-serif' | 'cursive';
  files: FontFile[];
  // The same family as static files that pdfkit can embed, for the menu board (which is drawn as a PDF
  // and can't use the web files: WOFF2 and variable fonts don't work there). Under public/fonts.
  // Absent = the font isn't available on the board.
  boardFiles?: FontFile[];
}

// The characters the Latin subsets of the font files cover. A character outside this range falls
// back to the next font in the stack instead of being asked of a file that lacks it.
export const LATIN_UNICODE_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

function variable(file: string, min: number, max: number, italicFile?: string): FontFile[] {
  const files: FontFile[] = [{ file, weight: [min, max], italic: false }];
  if (italicFile) files.push({ file: italicFile, weight: [min, max], italic: true });
  return files;
}

// Static regular/bold (and italic) files from public/fonts/board, named like Fontsource's
function board(family: string, weights: number[], italics = true, first?: string): FontFile[] {
  const files: FontFile[] = [];
  for (const weight of weights) {
    for (const italic of italics ? [false, true] : [false]) {
      const name = `board/${family}-latin-${weight}-${italic ? 'italic' : 'normal'}.woff`;
      files.push({ file: first && weight === 400 && !italic ? first : name, weight, italic });
    }
  }
  return files;
}

export const FONTS: readonly FontEntry[] = [
  // What the item rows use when nothing else is chosen: the browser's own default serif
  { id: 'system-serif', label: 'Browser serif', category: 'system', cssFamily: null, fallback: 'serif', files: [] },
  { id: 'system-sans', label: 'Browser sans-serif', category: 'system', cssFamily: null, fallback: 'sans-serif', files: [] },
  {
    id: 'roboto', label: 'Roboto', category: 'sans', cssFamily: 'Roboto Variable', fallback: 'sans-serif',
    files: variable('roboto-latin-wght-normal.woff2', 100, 900, 'roboto-latin-wght-italic.woff2'),
    boardFiles: board('roboto', [400, 700]),
  },
  {
    id: 'fira-sans', label: 'Fira Sans', category: 'sans', cssFamily: 'Fira Sans', fallback: 'sans-serif',
    files: [
      { file: 'fira-sans-latin-400-normal.woff2', weight: 400, italic: false },
      { file: 'fira-sans-latin-400-italic.woff2', weight: 400, italic: true },
      { file: 'fira-sans-latin-500-normal.woff2', weight: 500, italic: false },
      { file: 'fira-sans-latin-700-normal.woff2', weight: 700, italic: false },
      { file: 'fira-sans-latin-700-italic.woff2', weight: 700, italic: true },
    ],
    boardFiles: board('fira-sans', [400, 700], true, 'FiraSans-Regular.ttf'),
  },
  {
    id: 'montserrat', label: 'Montserrat', category: 'sans', cssFamily: 'Montserrat Variable', fallback: 'sans-serif',
    files: variable('montserrat-latin-wght-normal.woff2', 100, 900, 'montserrat-latin-wght-italic.woff2'),
    boardFiles: board('montserrat', [400, 700]),
  },
  {
    id: 'lora', label: 'Lora', category: 'serif', cssFamily: 'Lora Variable', fallback: 'serif',
    files: variable('lora-latin-wght-normal.woff2', 400, 700, 'lora-latin-wght-italic.woff2'),
    boardFiles: board('lora', [400, 700]),
  },
  {
    id: 'merriweather', label: 'Merriweather', category: 'serif', cssFamily: 'Merriweather Variable', fallback: 'serif',
    files: variable('merriweather-latin-wght-normal.woff2', 300, 900, 'merriweather-latin-wght-italic.woff2'),
    boardFiles: board('merriweather', [400, 700], false),
  },
  {
    id: 'playfair-display', label: 'Playfair Display', category: 'display', cssFamily: 'Playfair Display Variable', fallback: 'serif',
    files: variable('playfair-display-latin-wght-normal.woff2', 400, 900, 'playfair-display-latin-wght-italic.woff2'),
    boardFiles: board('playfair-display', [400, 700]),
  },
  {
    id: 'roboto-slab', label: 'Roboto Slab', category: 'serif', cssFamily: 'Roboto Slab Variable', fallback: 'serif',
    files: variable('roboto-slab-latin-wght-normal.woff2', 100, 900),
    boardFiles: board('roboto-slab', [400, 700], false),
  },
  {
    id: 'oswald', label: 'Oswald', category: 'display', cssFamily: 'Oswald Variable', fallback: 'sans-serif',
    files: variable('oswald-latin-wght-normal.woff2', 200, 700),
    boardFiles: board('oswald', [400, 700], false),
  },
  {
    id: 'bebas-neue', label: 'Bebas Neue', category: 'display', cssFamily: 'Bebas Neue', fallback: 'sans-serif',
    files: [{ file: 'bebas-neue-latin-400-normal.woff2', weight: 400, italic: false }],
    boardFiles: board('bebas-neue', [400], false),
  },
  {
    id: 'pacifico', label: 'Pacifico', category: 'script', cssFamily: 'Pacifico', fallback: 'cursive',
    files: [{ file: 'pacifico-latin-400-normal.woff2', weight: 400, italic: false }],
    boardFiles: board('pacifico', [400], false),
  },
];

export const FONT_IDS: readonly string[] = FONTS.map((font) => font.id);

const byId = new Map(FONTS.map((font) => [font.id, font]));

export function getFont(id: string): FontEntry | undefined {
  return byId.get(id);
}

export function isFontId(id: string): boolean {
  return byId.has(id);
}

// Whether the menu board can use the font (it needs static files, see FontEntry.boardFiles)
export function isBoardFontId(id: string): boolean {
  return Boolean(byId.get(id)?.boardFiles?.length);
}

// The file (under public/fonts) the menu board draws a font with: the one that matches `italic`, and
// the nearest weight the family has (the board can't fake a weight it lacks). Undefined for an
// unknown font or one the board can't use.
export function boardFontFile(id: string, weight: number, italic: boolean): string | undefined {
  const files = byId.get(id)?.boardFiles;
  if (!files?.length) return undefined;
  const sameSlant = files.filter((file) => file.italic === italic);
  const candidates = sameSlant.length > 0 ? sameSlant : files;
  let best = candidates[0];
  const distance = (file: FontFile) => Math.abs((Array.isArray(file.weight) ? file.weight[0] : file.weight) - weight);
  for (const file of candidates) {
    // The heavier one wins a tie
    const heavier = (Array.isArray(file.weight) ? file.weight[0] : file.weight) > (Array.isArray(best.weight) ? best.weight[0] : best.weight);
    if (distance(file) < distance(best) || (distance(file) === distance(best) && heavier)) best = file;
  }
  return best.file;
}

// The value of a CSS font-family declaration for a font. Only ever built from catalog entries.
export function fontStack(id: string): string {
  const font = byId.get(id);
  if (!font) throw new Error(`Unknown font: ${id}`);
  return font.cssFamily ? `'${font.cssFamily}', ${font.fallback}` : font.fallback;
}

// The @font-face rules needed for the given fonts (system fonts need none)
export function fontFaceCss(ids: Iterable<string>): string {
  const rules: string[] = [];
  for (const id of new Set(ids)) {
    const font = byId.get(id);
    if (!font?.cssFamily) continue;
    for (const file of font.files) {
      const weight = Array.isArray(file.weight) ? `${file.weight[0]} ${file.weight[1]}` : String(file.weight);
      rules.push(
        `@font-face{font-family:'${font.cssFamily}';font-style:${file.italic ? 'italic' : 'normal'};font-display:swap;` +
        `font-weight:${weight};src:url(/fonts/${file.file}) format('woff2');unicode-range:${LATIN_UNICODE_RANGE}}`,
      );
    }
  }
  return rules.join('\n');
}

// What the admin client needs to offer the fonts: no file names. For the menu board, only the fonts it
// can draw, with the weights and slants it really has.
export function describeFonts(view: 'print' | 'board' = 'print') {
  const fonts = view === 'board' ? FONTS.filter((font) => font.boardFiles?.length) : FONTS;
  return fonts.map((font) => {
    const files = view === 'board' ? font.boardFiles! : font.files;
    // The weights the font really has, so a design is only offered ones the browser won't have to fake.
    // A variable font has every hundred in its range; a system font has regular and bold.
    const weights = new Set<number>();
    for (const file of files) {
      const [low, high] = Array.isArray(file.weight) ? file.weight : [file.weight, file.weight];
      for (let weight = Math.ceil(low / 100) * 100; weight <= high; weight += 100) weights.add(weight);
      if (!Array.isArray(file.weight)) weights.add(file.weight);
    }
    if (files.length === 0) [400, 700].forEach((weight) => weights.add(weight));
    return {
      id: font.id,
      label: font.label,
      category: font.category,
      weights: [...weights].sort((a, b) => a - b),
      italic: files.some((file) => file.italic) || font.category === 'system',
    };
  });
}
