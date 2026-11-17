// The fonts a menu design can use. A design names a font by its ID here, never by a file name, so a
// stored design can't ask for a file that isn't in the catalog (the files are under public/fonts).

export type FontCategory = 'sans' | 'serif' | 'display' | 'script' | 'system';

export interface FontFile {
  // Under public/fonts
  file: string;
  weight: number;
  italic: boolean;
}

export interface FontEntry {
  id: string;
  label: string;
  category: FontCategory;
  // Which standard PDF font the system fonts are drawn with
  fallback: 'serif' | 'sans-serif' | 'cursive';
  // Static files pdfkit can embed (WOFF2 and variable fonts don't work in a PDF). None for the system
  // fonts, which are drawn with the PDF standard fonts instead (see pdfFontSource); a font with no
  // files isn't available on the menu board.
  files: FontFile[];
}

// Static regular/bold (and italic) files from public/fonts/board, named like Fontsource's non-variable builds'
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
  // The PDF standard fonts: Times and Helvetica
  { id: 'system-serif', label: 'Standard serif', category: 'system', fallback: 'serif', files: [] },
  { id: 'system-sans', label: 'Standard sans-serif', category: 'system', fallback: 'sans-serif', files: [] },
  {
    id: 'roboto', label: 'Roboto', category: 'sans', fallback: 'sans-serif',
    files: board('roboto', [400, 700]),
  },
  {
    id: 'fira-sans', label: 'Fira Sans', category: 'sans', fallback: 'sans-serif',
    files: board('fira-sans', [400, 700], true, 'FiraSans-Regular.ttf'),
  },
  {
    id: 'montserrat', label: 'Montserrat', category: 'sans', fallback: 'sans-serif',
    files: board('montserrat', [400, 700]),
  },
  {
    id: 'lora', label: 'Lora', category: 'serif', fallback: 'serif',
    files: board('lora', [400, 700]),
  },
  {
    id: 'merriweather', label: 'Merriweather', category: 'serif', fallback: 'serif',
    files: board('merriweather', [400, 700], false),
  },
  {
    id: 'playfair-display', label: 'Playfair Display', category: 'display', fallback: 'serif',
    files: board('playfair-display', [400, 700]),
  },
  {
    id: 'roboto-slab', label: 'Roboto Slab', category: 'serif', fallback: 'serif',
    files: board('roboto-slab', [400, 700], false),
  },
  {
    id: 'oswald', label: 'Oswald', category: 'display', fallback: 'sans-serif',
    files: board('oswald', [400, 700], false),
  },
  {
    id: 'bebas-neue', label: 'Bebas Neue', category: 'display', fallback: 'sans-serif',
    files: board('bebas-neue', [400], false),
  },
  {
    id: 'pacifico', label: 'Pacifico', category: 'script', fallback: 'cursive',
    files: board('pacifico', [400], false),
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

// Whether the menu board can use the font (it needs static files, see FontEntry.files)
export function isBoardFontId(id: string): boolean {
  return Boolean(byId.get(id)?.files.length);
}

// The file (under public/fonts) the menu board draws a font with: the one that matches `italic`, and
// the nearest weight the family has (the board can't fake a weight it lacks). Undefined for an
// unknown font or one the board can't use.
export function boardFontFile(id: string, weight: number, italic: boolean): string | undefined {
  const files = byId.get(id)?.files;
  if (!files?.length) return undefined;
  const sameSlant = files.filter((file) => file.italic === italic);
  const candidates = sameSlant.length > 0 ? sameSlant : files;
  let best = candidates[0];
  const distance = (file: FontFile) => Math.abs(file.weight - weight);
  for (const file of candidates) {
    // The heavier one wins a tie
    const heavier = file.weight > best.weight;
    if (distance(file) < distance(best) || (distance(file) === distance(best) && heavier)) best = file;
  }
  return best.file;
}

// What pdfkit draws a font with: a static file under public/fonts, or, for the system fonts (which
// have no files of their own), one of the 14 standard fonts every PDF viewer has.
export type PdfFontSource = { file: string; builtIn?: undefined } | { builtIn: string; file?: undefined };

export function pdfFontSource(id: string, weight: number, italic: boolean): PdfFontSource | undefined {
  const font = byId.get(id);
  if (!font) return undefined;
  if (font.category === 'system') {
    // Only regular and bold exist: 600 and up is bold, like boardFontFile's nearest-weight rule
    const bold = weight >= 600;
    const names = font.fallback === 'serif'
      ? ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic']
      : ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'];
    return { builtIn: names[(italic ? 2 : 0) + (bold ? 1 : 0)] };
  }
  const file = boardFontFile(id, weight, italic);
  return file ? { file } : undefined;
}

// What the admin client needs to offer the fonts: no file names. Both views are drawn as PDFs from the
// static files, so only the weights and slants those files really have are offered. The board can't use
// the system fonts (the print menu draws them with the PDF standard fonts: regular and bold, with italics).
export function describeFonts(view: 'print' | 'board' = 'print') {
  const fonts = view === 'board' ? FONTS.filter((font) => font.files.length) : FONTS;
  return fonts.map((font) => {
    const { files } = font;
    // The weights the font really has, so a design is only offered ones the PDF wouldn't have to fake.
    // A system font has regular and bold.
    const weights = new Set<number>();
    for (const file of files) {
      weights.add(file.weight);
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
