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

export const FONTS: readonly FontEntry[] = [
  // What the item rows use when nothing else is chosen: the browser's own default serif
  { id: 'system-serif', label: 'Browser serif', category: 'system', cssFamily: null, fallback: 'serif', files: [] },
  { id: 'system-sans', label: 'Browser sans-serif', category: 'system', cssFamily: null, fallback: 'sans-serif', files: [] },
  {
    id: 'roboto', label: 'Roboto', category: 'sans', cssFamily: 'Roboto Variable', fallback: 'sans-serif',
    files: variable('roboto-latin-wght-normal.woff2', 100, 900, 'roboto-latin-wght-italic.woff2'),
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
  },
  {
    id: 'montserrat', label: 'Montserrat', category: 'sans', cssFamily: 'Montserrat Variable', fallback: 'sans-serif',
    files: variable('montserrat-latin-wght-normal.woff2', 100, 900, 'montserrat-latin-wght-italic.woff2'),
  },
  {
    id: 'lora', label: 'Lora', category: 'serif', cssFamily: 'Lora Variable', fallback: 'serif',
    files: variable('lora-latin-wght-normal.woff2', 400, 700, 'lora-latin-wght-italic.woff2'),
  },
  {
    id: 'merriweather', label: 'Merriweather', category: 'serif', cssFamily: 'Merriweather Variable', fallback: 'serif',
    files: variable('merriweather-latin-wght-normal.woff2', 300, 900, 'merriweather-latin-wght-italic.woff2'),
  },
  {
    id: 'playfair-display', label: 'Playfair Display', category: 'display', cssFamily: 'Playfair Display Variable', fallback: 'serif',
    files: variable('playfair-display-latin-wght-normal.woff2', 400, 900, 'playfair-display-latin-wght-italic.woff2'),
  },
  {
    id: 'roboto-slab', label: 'Roboto Slab', category: 'serif', cssFamily: 'Roboto Slab Variable', fallback: 'serif',
    files: variable('roboto-slab-latin-wght-normal.woff2', 100, 900),
  },
  {
    id: 'oswald', label: 'Oswald', category: 'display', cssFamily: 'Oswald Variable', fallback: 'sans-serif',
    files: variable('oswald-latin-wght-normal.woff2', 200, 700),
  },
  {
    id: 'bebas-neue', label: 'Bebas Neue', category: 'display', cssFamily: 'Bebas Neue', fallback: 'sans-serif',
    files: [{ file: 'bebas-neue-latin-400-normal.woff2', weight: 400, italic: false }],
  },
  {
    id: 'pacifico', label: 'Pacifico', category: 'script', cssFamily: 'Pacifico', fallback: 'cursive',
    files: [{ file: 'pacifico-latin-400-normal.woff2', weight: 400, italic: false }],
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

// What the admin client needs to offer the fonts: no file names
export function describeFonts() {
  return FONTS.map((font) => {
    // The weights the font really has, so a design is only offered ones the browser won't have to fake.
    // A variable font has every hundred in its range; a system font has regular and bold.
    const weights = new Set<number>();
    for (const file of font.files) {
      const [low, high] = Array.isArray(file.weight) ? file.weight : [file.weight, file.weight];
      for (let weight = Math.ceil(low / 100) * 100; weight <= high; weight += 100) weights.add(weight);
      if (!Array.isArray(file.weight)) weights.add(file.weight);
    }
    if (font.files.length === 0) [400, 700].forEach((weight) => weights.add(weight));
    return {
      id: font.id,
      label: font.label,
      category: font.category,
      weights: [...weights].sort((a, b) => a - b),
      italic: font.files.some((file) => file.italic) || font.category === 'system',
    };
  });
}
