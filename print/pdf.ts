import pdfkit from 'pdfkit';
import { Box, Column, Line, PAGE_SIZES, parsePrintDesign, PrintDesign, TextStyle } from '../models/menuDesign';
import { pdfToPngs } from '../routes/menuBoardImages';
import { applyFormat, fieldValue } from './fields';
import { PrintItem, PrintModel, PrintSection } from './model';
import { colorOf, fragment, Fragment, LaidText, layoutText, drawText, Measurer } from './text';

/*
The printable menu, drawn as a PDF: the data (PrintModel) laid out as the design says. A pure function
of the two, so the public ?format=print view and the designer's preview are the same code.

Everything is laid out here, on the server, so the menu comes out the same whatever browser or PDF viewer
opens it. The layout follows the design's own vocabulary: a section is a heading and a table whose
columns are the design's columns (item text, prices, a picture), one row per item (plus a second row
for the lines below, and a divider). Items are never split across pages, and a section heading always
travels with the first item under it.

With the design's "shrink to fit" on, the whole menu is laid out again at smaller and smaller sizes until
it fits within the page limit: every font size and every space measured in rem scales together, while
line widths, pictures and the footer keep their size.
*/

const PT_PER_IN = 72;
// Line widths and picture sizes are in CSS pixels, spacing is in rem: 1px is 0.75pt, 1rem is 12pt (16px)
const PX = 0.75;
const REM = 12;
// Space in the table around and between cells, as a browser leaves it by default (in px at full size)
const CELL_PADDING = 1;
const CELL_SPACING = 2;
// Room kept free at the bottom of each page, so a row that just fits doesn't touch the margin
const SLACK = 6 * PX;
// The smallest the menu is shrunk to (3px text, as before), however much it overflows
const MIN_SCALE = 3 / 16;
const SEARCH_STEPS = 14;
// Between the footer's rule and its text
const FOOTER_RULE_GAP = 6 * PX;

export interface PrintOptions {
  // The date for {date} in the title and footer; now by default
  now?: Date;
}

// How the menu came out, for the designer to say
export interface PrintLayoutInfo {
  pages: number;
  // The design's limit, or null
  maxPages: number | null;
  fit: 'shrink-to-pages' | 'none';
  // Whether the menu is within its page limit
  fits: boolean;
  // How much the sizes were shrunk to fit: 1 = not at all
  scale: number;
}

// A part of the page that belongs to one group of controls in the designer (what is clicked to find
// them). The position is as a fraction of the page, from its top-left corner.
export interface PrintMark {
  // 1-based
  page: number;
  // 'page', 'header', 'headings', 'rows', 'footer' or 'column:<ID>'
  pick: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrintPdf {
  pdf: Buffer;
  info: PrintLayoutInfo;
  marks: PrintMark[];
}

// What the page is drawn on
interface Surface {
  page: number;
  mark(pick: string, x: number, y: number, width: number, height: number): void;
}

interface Block {
  height: number;
  draw(surface: Surface, top: number): void;
}

// A piece of the menu that stays whole on one page
interface Unit extends Block {
  kind: 'logo' | 'title' | 'lead' | 'item';
  // The space above and below, which collapses with a neighbour's (the larger of the two is kept)
  marginTop: number;
  marginBottom: number;
}

interface Picture {
  image: unknown;
  // Natural size, in px
  width: number;
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];

type FieldsColumn = Extract<Column, { type: 'fields' }>;
type PricesColumn = Extract<Column, { type: 'prices' }>;
type ThumbnailColumn = Extract<Column, { type: 'thumbnail' }>;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export async function renderPrintPdf(model: PrintModel, design: PrintDesign, options: PrintOptions = {}): Promise<PrintPdf> {
  // Whatever calls this, only a valid design is drawn
  const parsed = parsePrintDesign(design);
  if (!parsed.ok) {
    throw new Error(`Invalid print design: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
  }
  const d = parsed.design;
  const now = options.now ?? new Date();

  const size = PAGE_SIZES[d.page.size];
  const pageWidth = size.widthIn * PT_PER_IN;
  const pageHeight = size.heightIn * PT_PER_IN;
  const margins = d.page.marginsIn;
  const left = margins.left * PT_PER_IN;
  const bodyWidth = Math.max(1, pageWidth - left - margins.right * PT_PER_IN);
  const topMargin = margins.top * PT_PER_IN;
  const bottomMargin = margins.bottom * PT_PER_IN;
  const contentHeight = pageHeight - topMargin - bottomMargin;

  const doc = new pdfkit({
    size: [pageWidth, pageHeight],
    margin: 0,
    info: { Title: model.menuName || 'Menu', CreationDate: now },
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const measurer = new Measurer(doc);

  const date = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const expandTokens = (template: string) =>
    template.replace(/\{(menu\.name|date)\}/g, (_match, token: string) => (token === 'date' ? date : model.menuName));

  // ---- Pictures ----

  // Stored pictures are bare base64. pdfkit can draw PNG and JPEG; anything else (or anything damaged) is
  // left out rather than taking the whole menu down.
  const pictures = new Map<string, Picture | null>();
  const pictureOf = (base64: string | null | undefined): Picture | null => {
    if (!base64) return null;
    if (pictures.has(base64)) return pictures.get(base64)!;
    let picture: Picture | null = null;
    try {
      const clean = base64.replace(/\s+/g, '');
      if (/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
        const bytes = Buffer.from(clean, 'base64');
        const isPng = PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        if (isPng || isJpeg) {
          const image = (doc as any).openImage(bytes);
          if (image.width > 0 && image.height > 0) picture = { image, width: image.width, height: image.height };
        }
      }
    } catch {
      picture = null;
    }
    pictures.set(base64, picture);
    return picture;
  };

  // ---- Drawing helpers ----

  const fillRect = (x: number, y: number, width: number, height: number, color: string, radius = 0) => {
    const { rgb, alpha } = colorOf(color);
    doc.save();
    if (radius > 0) doc.roundedRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
    else doc.rect(x, y, width, height);
    doc.fillColor(rgb, alpha).fill();
    doc.restore();
  };

  // A line in one of the design's line styles, with `width` points of thickness
  const strokeLine = (x1: number, y1: number, x2: number, y2: number, width: number, style: 'solid' | 'dashed' | 'dotted', color: string) => {
    const { rgb, alpha } = colorOf(color);
    doc.save();
    doc.lineWidth(width).strokeColor(rgb, alpha);
    if (style === 'dashed') doc.dash(width * 3, { space: width * 2 });
    else if (style === 'dotted') doc.lineCap('round').dash(0.01, { space: width * 2 });
    doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
    doc.restore();
  };

  const drawBox = (x: number, y: number, width: number, height: number, box: Box, borderWidth: number) => {
    const radius = box.radiusPx * PX;
    if (box.background) fillRect(x, y, width, height, box.background, radius);
    if (borderWidth <= 0) return;
    const { rgb, alpha } = colorOf(box.border.color);
    const outline = (inset: number, thickness: number, dash: boolean) => {
      doc.save();
      doc.lineWidth(thickness).strokeColor(rgb, alpha);
      if (dash && box.border.style === 'dashed') doc.dash(thickness * 3, { space: thickness * 2 });
      else if (dash && box.border.style === 'dotted') doc.lineCap('round').dash(0.01, { space: thickness * 2 });
      const w = width - 2 * inset;
      const h = height - 2 * inset;
      if (radius > 0) doc.roundedRect(x + inset, y + inset, w, h, Math.max(0, Math.min(radius - inset, w / 2, h / 2)));
      else doc.rect(x + inset, y + inset, w, h);
      doc.stroke();
      doc.restore();
    };
    if (box.border.style === 'double' && borderWidth >= 3 * PX) {
      // Two lines of a third of the width each, with a third between them
      const third = borderWidth / 3;
      outline(third / 2, third, false);
      outline(borderWidth - third / 2, third, false);
    } else {
      outline(borderWidth / 2, borderWidth, true);
    }
  };

  const baseOf = (style: TextStyle, scale: number): Fragment => fragment('', style, scale);

  // ---- The menu at one size ----

  const build = (scale: number): Unit[] => {
    const rem = REM * scale;
    const padding = CELL_PADDING * PX * scale;
    const spacing = CELL_SPACING * PX * scale;
    const units: Unit[] = [];

    // -- Logo and title --
    const logo = d.header.logo.show ? pictureOf(model.menuLogo) : null;
    if (logo) {
      const width = Math.min(logo.width * PX, (bodyWidth * d.header.logo.maxWidthPct) / 100);
      const height = (width * logo.height) / logo.width;
      units.push({
        kind: 'logo', marginTop: 0, marginBottom: d.header.logo.spaceBelowRem * rem, height,
        draw: (surface, top) => {
          const x = left + (d.header.logo.align === 'left' ? 0 : d.header.logo.align === 'right' ? bodyWidth - width : (bodyWidth - width) / 2);
          doc.image((logo as Picture).image as never, x, top, { width, height });
          surface.mark('header', left, top, bodyWidth, height);
        },
      });
    }
    const titleText = expandTokens(d.header.title.text);
    if (d.header.title.show && titleText.trim() !== '') {
      const style = d.header.title.style;
      const laid = layoutText(measurer, [fragment(titleText, style, scale)], baseOf(style, scale), bodyWidth);
      units.push({
        kind: 'title', marginTop: 0, marginBottom: 0, height: laid.height,
        draw: (surface, top) => {
          drawText(measurer, laid, left, top);
          surface.mark('header', left, top, bodyWidth, laid.height);
        },
      });
    }

    // -- Item text --
    const lineFragments = (line: Line, item: PrintItem): Fragment[] | null => {
      const frags: Fragment[] = [];
      let printed = false;
      for (const part of line.parts) {
        const value = fieldValue(item, part.field, part.text);
        if (value === null) continue;
        // The separator is in the line's own style, the part itself in its style on top of that
        if (printed && part.before) frags.push(fragment(part.before, line.style, scale));
        frags.push(fragment(applyFormat(part.format, value), part.style ? ({ ...line.style, ...part.style } as TextStyle) : line.style, scale));
        printed = true;
      }
      // A line with nothing to print is left out entirely
      return printed ? frags : null;
    };

    const sizesFor = (column: PricesColumn, section: PrintSection) =>
      column.sizes === 'all' ? section.sizes : section.sizes.filter((size) => size.containerIds.some((id) => (column.sizes as string[]).includes(id)));

    const showBelowRow = d.columns.some((column) => column.type === 'fields' && column.belowLines.length > 0);
    const showHeaderRow = d.columns.some((column) => column.type === 'prices' && column.heading.show);

    // -- One section's table: where each column goes --
    interface Geometry {
      x: number;
      width: number;
      cols: Array<{ x: number; width: number }>;
    }
    const geometryOf = (): Geometry => {
      const width = (bodyWidth * d.sections.widthPct) / 100;
      const x = left + (bodyWidth - width) / 2;
      const count = d.columns.length;
      const room = width - spacing * (count + 1);
      const thumbs = d.columns.map((column) => (column.type === 'thumbnail' ? column.sizePx * PX + 2 * padding : 0));
      const percents = d.columns.map((column) => (column.type !== 'thumbnail' && column.widthPct !== null ? (width * column.widthPct) / 100 : 0));
      const flexible = d.columns.filter((column) => column.type !== 'thumbnail' && column.widthPct === null).length;
      const thumbTotal = sum(thumbs);
      const percentTotal = sum(percents);
      let factor = 1;
      if (flexible > 0) {
        // The columns without a width share what is left, but are never squeezed out of existence
        const available = Math.max(0, room - thumbTotal - flexible * 24);
        if (percentTotal > available) factor = available / percentTotal;
      } else if (percentTotal > 0) {
        // A table is as wide as its section: with nothing to take up the slack, the columns share it
        factor = Math.max(0, room - thumbTotal) / percentTotal;
      }
      const flexWidth = flexible > 0 ? (room - thumbTotal - percentTotal * factor) / flexible : 0;
      let cursor = x + spacing;
      const cols = d.columns.map((column, index) => {
        const columnWidth = column.type === 'thumbnail' ? thumbs[index] : column.widthPct === null ? flexWidth : percents[index] * factor;
        const placed = { x: cursor, width: columnWidth };
        cursor += columnWidth + spacing;
        return placed;
      });
      return { x, width, cols };
    };

    // The cells of a prices column's inner table, side by side. The cells share the column's width.
    const priceCells = (geo: Geometry, index: number, count: number) => {
      const innerX = geo.cols[index].x + padding;
      const room = geo.cols[index].width - 2 * padding - spacing * (count + 1);
      const cellWidth = count > 0 ? Math.max(1, room / count) : 0;
      return Array.from({ length: count }, (_, i) => ({ x: innerX + spacing + i * (cellWidth + spacing), width: cellWidth }));
    };
    // What a prices column's inner table adds around its cells' text
    const nestedExtra = 2 * padding + 2 * spacing + 2 * padding;

    // A cell: how tall its content makes the row, and how to draw it in a row of a given height
    interface Cell {
      height: number;
      // Whether there is something here to click on in the designer (an empty cell is only padding)
      marked: boolean;
      draw(surface: Surface, rowTop: number, rowHeight: number): void;
    }
    const emptyCell = (): Cell => ({ height: 2 * padding, marked: false, draw: () => {} });

    const textCell = (geo: Geometry, index: number, lines: Line[], item: PrintItem): Cell => {
      const width = Math.max(1, geo.cols[index].width - 2 * padding);
      const laid: LaidText[] = [];
      for (const line of lines) {
        const frags = lineFragments(line, item);
        if (frags) laid.push(layoutText(measurer, frags, baseOf(line.style, scale), width));
      }
      const height = sum(laid.map((l) => l.height));
      return {
        height: height + 2 * padding,
        marked: true,
        draw: (_surface, rowTop, rowHeight) => {
          let y = rowTop + (rowHeight - height) / 2;
          for (const l of laid) {
            drawText(measurer, l, geo.cols[index].x + padding, y);
            y += l.height;
          }
        },
      };
    };

    // The text of each cell in a prices column's inner table: the price of each size, or the sizes' names
    const pricesCell = (geo: Geometry, index: number, style: TextStyle, texts: string[]): Cell => {
      const cells = priceCells(geo, index, texts.length);
      const laid = texts.map((text, i) =>
        layoutText(measurer, text === '' ? [] : [fragment(text, style, scale)], baseOf(style, scale), Math.max(1, cells[i].width - 2 * padding)));
      const height = laid.length > 0 ? Math.max(...laid.map((l) => l.height)) : 0;
      return {
        height: height + nestedExtra,
        marked: true,
        draw: (_surface, rowTop, rowHeight) => {
          const y = rowTop + (rowHeight - height) / 2;
          laid.forEach((l, i) => drawText(measurer, l, cells[i].x + padding, y));
        },
      };
    };

    const thumbnailCell = (geo: Geometry, index: number, column: ThumbnailColumn, item: PrintItem): Cell => {
      const side = column.sizePx * PX;
      const picture = pictureOf(item.itemLogo)
        ?? (column.source === 'item-then-brewery-then-menu' ? pictureOf(item.breweryLogo) : null)
        ?? pictureOf(model.menuLogo);
      return {
        height: side + 2 * padding,
        marked: true,
        draw: (_surface, rowTop, rowHeight) => {
          if (!picture) return;
          const x = geo.cols[index].x + padding;
          const y = rowTop + (rowHeight - side) / 2;
          doc.save();
          if (column.shape === 'circle') doc.circle(x + side / 2, y + side / 2, side / 2).clip();
          else if (column.shape === 'rounded') doc.roundedRect(x, y, side, side, side * 0.2).clip();
          else doc.rect(x, y, side, side).clip();
          // Fills the square, cropping what overflows it, as a background image set to "cover" does
          doc.image(picture.image as never, x, y, { cover: [side, side], align: 'center', valign: 'center' });
          doc.restore();
        },
      };
    };

    // -- A row, and the rows that make up an item --
    const rowBlock = (geo: Geometry, cells: Cell[]): Block => {
      const height = Math.max(...cells.map((cell) => cell.height));
      return {
        height: spacing + height,
        draw: (surface, top) => {
          const rowTop = top + spacing;
          cells.forEach((cell, index) => {
            cell.draw(surface, rowTop, height);
            if (cell.marked) surface.mark(`column:${d.columns[index].id}`, geo.cols[index].x, rowTop, geo.cols[index].width, height);
          });
        },
      };
    };

    const itemGroup = (geo: Geometry, section: PrintSection, item: PrintItem): Block => {
      const main = d.columns.map((column, index): Cell => {
        if (column.type === 'fields') return textCell(geo, index, column.lines, item);
        if (column.type === 'thumbnail') return thumbnailCell(geo, index, column, item);
        const texts = sizesFor(column, section).map((size) => {
          const price = item.prices.get(size.displayName);
          // A size the item doesn't come in leaves its cell empty, with no stray $
          return price !== undefined && price.trim() !== '' ? column.cell.format.split('{value}').join(price) : '';
        });
        return pricesCell(geo, index, column.cell.style, texts);
      });
      const rows: Block[] = [rowBlock(geo, main)];
      if (showBelowRow) {
        rows.push(rowBlock(geo, d.columns.map((column, index) => (column.type === 'fields' ? textCell(geo, index, column.belowLines, item) : emptyCell()))));
      }
      const gap = d.rows.gapRem * rem;
      const divider = d.rows.divider;
      const dividerWidth = divider.show ? divider.widthPx * PX : 0;
      // The space under an item sits above its divider line, or at the bottom of its last row
      const dividerHeight = divider.show ? gap + padding + dividerWidth : 0;
      const height = sum(rows.map((row) => row.height)) + (divider.show ? dividerHeight : gap);
      return {
        height,
        draw: (surface, top) => {
          let y = top;
          for (const row of rows) {
            row.draw(surface, y);
            y += row.height;
          }
          if (divider.show) {
            const lineY = top + height - dividerWidth / 2;
            strokeLine(geo.x + spacing, lineY, geo.x + geo.width - spacing, lineY, dividerWidth, divider.style, divider.color);
            surface.mark('rows', geo.x + spacing, top + height - dividerHeight, geo.width - 2 * spacing, dividerHeight);
          }
        },
      };
    };

    // The row of pour size names above a section's items
    const headerRow = (geo: Geometry, section: PrintSection): Block | null => {
      if (!showHeaderRow) return null;
      const cells = d.columns.map((column, index): Cell => {
        if (column.type !== 'prices' || !column.heading.show) return emptyCell();
        return pricesCell(geo, index, column.heading.style, sizesFor(column, section).map((size) => size.displayName));
      });
      return rowBlock(geo, cells);
    };

    // The heading: a box with the section's name in it
    const heading = (geo: Geometry, name: string): Block => {
      const { style, box } = d.sections.heading;
      const borderWidth = box.border.style === 'none' ? 0 : box.border.widthPx * PX;
      const top = box.paddingRem.top * rem;
      const bottom = box.paddingRem.bottom * rem;
      const leftPad = box.paddingRem.left * rem;
      const rightPad = box.paddingRem.right * rem;
      const inner = Math.max(1, geo.width - 2 * borderWidth - leftPad - rightPad);
      const laid = layoutText(measurer, [fragment(name, style, scale)], baseOf(style, scale), inner);
      const height = laid.height + top + bottom + 2 * borderWidth;
      return {
        height,
        draw: (surface, y) => {
          drawBox(geo.x, y, geo.width, height, box, borderWidth);
          drawText(measurer, laid, geo.x + borderWidth + leftPad, y + borderWidth + top);
          surface.mark('headings', geo.x, y, geo.width, height);
        },
      };
    };

    // -- The sections --
    for (const section of model.sections) {
      const geo = geometryOf();
      const head = heading(geo, section.name);
      const header = headerRow(geo, section);
      const groups = section.items.map((item) => itemGroup(geo, section, item));
      const first = groups[0];
      // A heading never stands alone at the bottom of a page: it moves with the first item under it
      units.push({
        kind: 'lead',
        marginTop: d.sections.gapAboveRem * rem,
        marginBottom: 0,
        height: head.height + (header?.height ?? 0) + (first?.height ?? 0),
        draw: (surface, top) => {
          head.draw(surface, top);
          let y = top + head.height;
          if (header) {
            header.draw(surface, y);
            y += header.height;
          }
          first?.draw(surface, y);
        },
      });
      for (const group of groups.slice(1)) units.push({ kind: 'item', marginTop: 0, marginBottom: 0, height: group.height, draw: group.draw });
    }
    return units;
  };

  // ---- Pages ----

  interface Placement {
    unit: Unit;
    page: number;
    top: number;
  }

  // Which page each unit goes on, and where. A unit that doesn't fit what is left of its page starts the
  // next one (unless it is taller than a page, which nothing can help).
  const paginate = (units: Unit[]): { placements: Placement[]; pages: number } => {
    const placements: Placement[] = [];
    const limit = pageHeight - bottomMargin - SLACK;
    let page = 0;
    let y = topMargin;
    let atTop = true;
    let previousMargin = 0;
    for (const unit of units) {
      let top = atTop ? y : y + Math.max(previousMargin, unit.marginTop);
      if (!atTop && top + unit.height > limit && unit.height < contentHeight) {
        page += 1;
        top = topMargin;
      }
      placements.push({ unit, page, top });
      y = top + unit.height;
      atTop = false;
      previousMargin = unit.marginBottom;
    }
    return { placements, pages: page + 1 };
  };

  // Shrinks the menu, if the design says to, to the largest size that fits its page limit
  const maxPages = d.page.maxPages;
  const shrinking = d.page.fit === 'shrink-to-pages' && maxPages !== null;
  let scale = 1;
  let layout = paginate(build(scale));
  if (shrinking && layout.pages > maxPages!) {
    let low = MIN_SCALE;
    let high = 1;
    for (let step = 0; step < SEARCH_STEPS; step++) {
      const middle = (low + high) / 2;
      if (paginate(build(middle)).pages <= maxPages!) low = middle;
      else high = middle;
    }
    scale = low;
    layout = paginate(build(scale));
  }

  // ---- The footer, on every page ----

  const footerLines = d.footer.show ? expandTokens(d.footer.text).split('\n').filter((line) => line.trim() !== '') : null;
  const footer = footerLines
    ? (() => {
        const style = d.footer.style;
        // The footer keeps its size however much the menu is shrunk
        const laid = footerLines.map((line) => layoutText(measurer, [fragment(line, style, 1)], baseOf(style, 1), bodyWidth));
        const rule = d.footer.rule.show ? d.footer.rule.widthPx * PX + FOOTER_RULE_GAP : 0;
        return { laid, rule, height: rule + sum(laid.map((l) => l.height)) };
      })()
    : null;

  // ---- Drawing ----

  const marks: PrintMark[] = [];
  const pages = layout.pages;
  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage({ size: [pageWidth, pageHeight], margin: 0 });
    const surface: Surface = {
      page: page + 1,
      mark: (pick, x, y, width, height) =>
        marks.push({ page: page + 1, pick, x: x / pageWidth, y: y / pageHeight, width: width / pageWidth, height: height / pageHeight }),
    };
    fillRect(0, 0, pageWidth, pageHeight, d.page.background);
    surface.mark('page', 0, 0, pageWidth, pageHeight);
    for (const placement of layout.placements.filter((p) => p.page === page)) placement.unit.draw(surface, placement.top);
    if (footer) {
      const top = pageHeight - d.footer.bottomIn * PT_PER_IN - footer.height;
      if (d.footer.rule.show) {
        const ruleWidth = d.footer.rule.widthPx * PX;
        strokeLine(left, top + ruleWidth / 2, left + bodyWidth, top + ruleWidth / 2, ruleWidth, 'solid', d.footer.rule.color);
      }
      let y = top + footer.rule;
      for (const laid of footer.laid) {
        drawText(measurer, laid, left, y);
        y += laid.height;
      }
      surface.mark('footer', left, top, bodyWidth, footer.height);
    }
  }

  doc.end();
  const pdf = await finished;
  return {
    pdf,
    marks,
    info: { pages, maxPages, fit: d.page.fit, fits: maxPages === null || pages <= maxPages, scale },
  };
}

// The menu as one PNG per page, for the designer's preview. `scale` is how many pixels there are to
// a point of the page (1 = 612 pixels across a letter page).
export async function renderPrintPages(
  model: PrintModel,
  design: PrintDesign,
  options: PrintOptions & { scale?: number } = {},
): Promise<{ pages: Uint8Array[]; info: PrintLayoutInfo; marks: PrintMark[] }> {
  const { pdf, info, marks } = await renderPrintPdf(model, design, options);
  return { pages: pdfToPngs(pdf, options.scale ?? 1), info, marks };
}
