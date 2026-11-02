import path from 'path';
import pdfkit from 'pdfkit';
import { BOARD_HEIGHT, BOARD_WIDTH, BoardDesign, BoardLine, BoardTextStyle } from '../models/boardDesign';
import { boardFontFile } from '../models/fonts';
import { applyFormat, fieldValue } from '../print/fields';
import { PrintItem, PrintModel } from '../print/model';
import { pdfToPngs } from '../routes/menuBoardImages';

/*
The menu board, drawn from the data (PrintModel) and a design (BoardDesign) as a PDF with one page per
screenful, then turned into one PNG per page (the TVs can't show a PDF). The PDF is laid out in pixels:
a 1080x1920 page, one PDF point per pixel.

Nothing is drawn inside the design's safe margin of any edge except the background colour.
*/

// pdfkit reads the fonts from the same folder the server serves them from for the print menu
const FONT_FOLDER = path.join(import.meta.dirname, '..', 'public', 'fonts');

// A run of text in one style: a line is one or more of them, side by side
interface Run {
  text: string;
  style: BoardTextStyle;
}

const sameStyle = (a: BoardTextStyle, b: BoardTextStyle) =>
  a.font === b.font && a.sizePx === b.sizePx && a.weight === b.weight && a.italic === b.italic && a.color === b.color &&
  a.align === b.align && a.transform === b.transform && a.letterSpacingEm === b.letterSpacingEm;

function fontPath(style: BoardTextStyle): string {
  // The design is validated, so the font exists; the fallback only guards a catalog without static files
  const file = boardFontFile(style.font, style.weight, style.italic) ?? boardFontFile('fira-sans', 400, false)!;
  return path.join(FONT_FOLDER, file);
}

// The runs of one line for an item: each part that has something to show, with its separator in front,
// neighbours in the same style merged into one run. Null when nothing at all is left to show.
function lineRuns(line: BoardLine, item: PrintItem): Run[] | null {
  const runs: Run[] = [];
  let printed = false;
  for (const part of line.parts) {
    const value = fieldValue(item, part.field, part.text);
    if (value === null) continue;
    const style: BoardTextStyle = { ...line.style, ...part.style };
    const text = (printed ? part.before : '') + applyFormat(part.format, value);
    const last = runs[runs.length - 1];
    if (last && sameStyle(last.style, style)) last.text += text;
    else runs.push({ text, style });
    printed = true;
  }
  if (!printed) return null;
  for (const run of runs) if (run.style.transform === 'uppercase') run.text = run.text.toUpperCase();
  return runs;
}

// Draws runs one after another, wrapping within `width`. With x and y it starts there, otherwise it
// carries on from where pdfkit left off.
function drawRuns(doc: pdfkit, runs: Run[], x: number, y: number, width: number) {
  runs.forEach((run, index) => {
    doc.font(fontPath(run.style)).fontSize(run.style.sizePx).fillColor(run.style.color);
    const options: Record<string, unknown> = { width, align: runs[0].style.align, continued: index < runs.length - 1 };
    if (run.style.letterSpacingEm) options.characterSpacing = run.style.letterSpacingEm * run.style.sizePx;
    if (index === 0) doc.text(run.text, x, y, options);
    else doc.text(run.text, options);
  });
}

export interface BoardOptions {
  // The date for {date} in the title; now by default
  now?: Date;
}

// Lays the board out as a PDF
export async function layoutBoardPdf(model: PrintModel, design: BoardDesign, options: BoardOptions = {}): Promise<Buffer> {
  const doc = new pdfkit({ size: [BOARD_WIDTH, BOARD_HEIGHT], margin: 0 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Text is measured by drawing it on a page of its own, which is thrown away: pdfkit can only say how
  // tall text is by laying it out, and a line made of several styles can't be measured in one call
  const ruler = new pdfkit({ size: [BOARD_WIDTH, 20000], margin: 0 });
  ruler.on('data', () => {});
  ruler.on('error', () => {});
  const heightOf = (runs: Run[], width: number): number => {
    ruler.x = 0;
    ruler.y = 0;
    drawRuns(ruler, runs, 0, 0, width);
    return ruler.y;
  };

  const d = design;
  const margin = d.canvas.safeMarginPx;
  const contentLeft = margin;
  const contentRight = BOARD_WIDTH - margin;
  const contentBottom = BOARD_HEIGHT - margin;
  const contentWidth = contentRight - contentLeft;

  const menuLogo = model.menuLogo ? Buffer.from(model.menuLogo, 'base64') : null;
  const date = (options.now ?? new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const titleText = d.header.title.text.replace(/\{(menu\.name|date)\}/g, (_match, token: string) => (token === 'date' ? date : model.menuName));

  // Where the first section starts on every page, below the header
  let firstRowTop = margin;
  const headerRuns: Run[] | null = d.header.title.show && titleText.trim() !== ''
    ? [{ text: d.header.title.style.transform === 'uppercase' ? titleText.toUpperCase() : titleText, style: d.header.title.style }]
    : null;
  if (d.header.logo.show && menuLogo) firstRowTop += d.header.logo.sizePx;
  if (headerRuns) firstRowTop += d.header.title.gapAbovePx + heightOf(headerRuns, contentWidth);
  firstRowTop += d.header.gapBelowPx;

  // Paints the background across the whole page, margins included, so the picture has no unpainted
  // edge for the TV to show, then the header
  const paintPage = () => {
    doc.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill(d.canvas.background);
    let y = margin;
    if (d.header.logo.show && menuLogo) {
      const size = d.header.logo.sizePx;
      const x = d.header.logo.align === 'left' ? contentLeft : d.header.logo.align === 'right' ? contentRight - size : BOARD_WIDTH / 2 - size / 2;
      if (d.header.logo.fit === 'contain') doc.image(menuLogo, x, y, { fit: [size, size], align: 'center', valign: 'center' });
      else doc.image(menuLogo, x, y, { width: size, height: size });
      y += size;
    }
    if (headerRuns) drawRuns(doc, headerRuns, contentLeft, y + d.header.title.gapAbovePx, contentWidth);
  };

  const bar = d.sections.bar;
  const logoSize = d.items.logo.sizePx;
  const logoShown = d.items.logo.show;
  const gap = d.items.gapPx;
  // An item's text starts after its picture and wraps before the margin, rather than running into it
  const itemTextLeft = contentLeft + (logoShown ? logoSize + gap : 0);
  const itemTextWidth = contentRight - itemTextLeft;
  // Room that has to be left under a row for another one to start, or a new page is begun
  const endOfPageReserve = Math.max(logoShown ? logoSize : 0, d.items.lines[0].style.sizePx) + 2 * gap;

  interface Row {
    item: PrintItem;
    lines: Run[][];
    textHeight: number;
    // The height of the row without its gaps
    height: number;
  }
  const rowFor = (item: PrintItem): Row => {
    const lines = d.items.lines.map((line) => lineRuns(line, item)).filter((runs): runs is Run[] => runs !== null);
    const textHeight = lines.reduce((sum, runs) => sum + heightOf(runs, itemTextWidth), 0);
    return { item, lines, textHeight, height: Math.max(textHeight, logoShown ? logoSize + gap / 2 : 0) };
  };

  const drawBar = (name: string, top: number) => {
    const barTop = top + bar.marginTopPx;
    if (bar.background) {
      if (bar.radiusPx > 0) doc.roundedRect(contentLeft, barTop, contentWidth, bar.heightPx, Math.min(bar.radiusPx, bar.heightPx / 2)).fill(bar.background);
      else doc.rect(contentLeft, barTop, contentWidth, bar.heightPx).fill(bar.background);
    }
    const runs: Run[] = [{ text: bar.style.transform === 'uppercase' ? name.toUpperCase() : name, style: bar.style }];
    drawRuns(doc, runs, contentLeft + bar.insetPx, barTop + bar.textTopPx, contentWidth - 2 * bar.insetPx);
    return top + bar.marginTopPx + bar.heightPx;
  };

  const drawLogo = (item: PrintItem, top: number) => {
    const picture = item.itemLogo ?? (d.items.logo.source === 'item-then-brewery-then-menu' ? item.breweryLogo ?? model.menuLogo : model.menuLogo);
    if (!picture) return;
    const size = logoSize;
    doc.save();
    if (d.items.logo.shape === 'circle') doc.circle(contentLeft + size / 2, top + size / 2, size / 2).clip();
    else if (d.items.logo.shape === 'rounded') doc.roundedRect(contentLeft, top, size, size, size * 0.2).clip();
    doc.image(Buffer.from(picture, 'base64'), contentLeft, top, { height: size, width: size });
    doc.restore();
  };

  paintPage();
  let y = firstRowTop;

  for (const section of model.sections) {
    // Make sure this section's bar and at least its first item fit on the current page
    const first = rowFor(section.items[0]);
    // A section that follows another one on the same page starts a little lower, to set it apart
    // from the items above it. A section at the top of a page needs no gap.
    let sectionGap = y > firstRowTop ? d.sections.gapPx : 0;
    if (y + sectionGap + bar.marginTopPx + bar.heightPx + first.textHeight + endOfPageReserve >= contentBottom) {
      doc.addPage({ size: [BOARD_WIDTH, BOARD_HEIGHT], margin: 0 });
      paintPage();
      y = firstRowTop;
      sectionGap = 0;
    }
    y += sectionGap;
    y = drawBar(section.name, y);

    for (const item of section.items) {
      const row = rowFor(item);
      if (y + row.height + endOfPageReserve > contentBottom) {
        doc.addPage({ size: [BOARD_WIDTH, BOARD_HEIGHT], margin: 0 });
        paintPage();
        y = drawBar(section.name + bar.continuedSuffix, firstRowTop);
      }

      if (logoShown) drawLogo(item, y + gap);

      // Describe the actual beer
      let lineTop = y + gap / 2;
      doc.save();
      for (const runs of row.lines) {
        drawRuns(doc, runs, itemTextLeft, lineTop, itemTextWidth);
        lineTop = doc.y;
      }
      doc.restore();

      y += row.height + gap;
    }
  }

  doc.end();
  ruler.end();
  return finished;
}

// The board as one PNG per page. `scale` shrinks the pictures (the designer's preview doesn't need all
// 1080x1920 pixels of each page).
export async function renderBoardPages(model: PrintModel, design: BoardDesign, options: BoardOptions & { scale?: number } = {}): Promise<Uint8Array[]> {
  return pdfToPngs(await layoutBoardPdf(model, design, options), options.scale ?? 1);
}
