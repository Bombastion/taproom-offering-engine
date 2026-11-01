import { fontStack } from '../models/fonts';
import { Box, PAGE_SIZES, PrintDesign, TextStyle } from '../models/menuDesign';

/*
Turns a design into CSS. Nothing is ever copied from the design into the stylesheet as text: every
value is a number (written by num()), a color that already passed the #rrggbb check, a word from a
fixed list, or a font looked up by ID in the catalog. The design is validated before it gets here
(renderPrintMenu does it), and the types only allow those kinds of values.
*/

// Numbers written the same way every time, never in exponent form
export function num(value: number): string {
  return String(parseFloat(value.toFixed(4)));
}

// Points to rem. The menu's normal text is 12pt = 16px = 1rem, and the menu is shrunk to fit its pages
// by scaling the root font size, so anything in rem scales along with it.
function rem(pt: number): string {
  return `${num(pt / 12)}rem`;
}

function textDeclarations(style: TextStyle, fixedSize: boolean): string {
  const declarations = [
    `font-family:${fontStack(style.font)}`,
    `font-size:${fixedSize ? `${num(style.sizePt)}pt` : rem(style.sizePt)}`,
    `font-weight:${style.weight}`,
    `font-style:${style.italic ? 'italic' : 'normal'}`,
    `color:${style.color}`,
    `text-align:${style.align}`,
    `text-transform:${style.transform}`,
  ];
  if (style.letterSpacingEm !== 0) declarations.push(`letter-spacing:${num(style.letterSpacingEm)}em`);
  if (style.lineHeight !== null) declarations.push(`line-height:${num(style.lineHeight)}`);
  return declarations.join(';');
}

// Hands out one class per distinct text style, so the page refers to styles by name and the values
// live in the stylesheet only
export class StyleRegistry {
  private classes = new Map<string, { name: string; style: TextStyle; fixedSize: boolean }>();

  // `fixedSize` writes the size in points, so it doesn't scale with the rest of the menu (the footer)
  classFor(style: TextStyle, fixedSize = false): string {
    const key = JSON.stringify([style, fixedSize]);
    let entry = this.classes.get(key);
    if (!entry) {
      entry = { name: `ts${this.classes.size}`, style, fixedSize };
      this.classes.set(key, entry);
    }
    return entry.name;
  }

  fonts(): Set<string> {
    return new Set([...this.classes.values()].map((entry) => entry.style.font));
  }

  css(): string {
    return [...this.classes.values()].map((entry) => `.${entry.name}{${textDeclarations(entry.style, entry.fixedSize)}}`).join('\n');
  }
}

// Pictures (item thumbnails) are written into the stylesheet once each, as a background image on a
// class, instead of repeating the image data on every row
export class ImageRegistry {
  private classes = new Map<string, string>();

  // `dataUrl` must already be a safe data: URL (see imageDataUrl in render.ts)
  classFor(dataUrl: string): string {
    let name = this.classes.get(dataUrl);
    if (!name) {
      name = `img${this.classes.size}`;
      this.classes.set(dataUrl, name);
    }
    return name;
  }

  css(): string {
    return [...this.classes.entries()].map(([dataUrl, name]) => `.${name}{background-image:url("${dataUrl}")}`).join('\n');
  }
}

function boxDeclarations(box: Box): string {
  const { top, right, bottom, left } = box.paddingRem;
  const declarations = [
    `padding:${num(top)}rem ${num(right)}rem ${num(bottom)}rem ${num(left)}rem`,
    box.border.style === 'none' || box.border.widthPx === 0
      ? 'border:none'
      : `border:${num(box.border.widthPx)}px ${box.border.style} ${box.border.color}`,
    `background:${box.background ?? 'transparent'}`,
  ];
  if (box.radiusPx > 0) declarations.push(`border-radius:${num(box.radiusPx)}px`);
  return declarations.join(';');
}

export function pageDimensions(design: PrintDesign) {
  const size = PAGE_SIZES[design.page.size];
  const { left, right } = design.page.marginsIn;
  return { widthIn: size.widthIn, heightIn: size.heightIn, bodyWidthIn: size.widthIn - left - right };
}

const SHAPE_RADIUS = { circle: '50%', rounded: '20%', square: '0' } as const;

// The stylesheet for everything except the text styles and pictures, which the registries write
export function designCss(design: PrintDesign): string {
  const { page, header, sections, rows, footer } = design;
  const { bodyWidthIn } = pageDimensions(design);
  const m = page.marginsIn;
  const css: string[] = [];

  // Page. The margin is 0 on purpose: browsers print their own headers and footers (URL, date, title,
  // page numbers) in the page margin, so with no margin there is nowhere for them to go. The real
  // margins are rebuilt below (and in the fit script, which also scales the root font size so the menu
  // fits its pages). Everything is in rem/em so it scales with that font size.
  css.push(`@page{size:${PAGE_SIZES[page.size].css};margin:0}`);
  css.push('html{font-size:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}');
  css.push(`body{width:${num(bodyWidthIn)}in;margin:0 0 0 ${num(m.left)}in;padding:${num(m.top)}in 0 0;background:${page.background}}`);
  // Each page after the first starts here: a hard page break, then its own top margin
  css.push(`.pageStart{break-before:page;page-break-before:always;padding-top:${num(m.top)}in}`);

  // Without a doctype the browser doesn't pass the font size down into tables
  css.push('table{font-size:inherit;border-spacing:0.125em}');
  css.push('td,th{padding:0.0625em}');
  css.push('.itemGroup,.subMenuHeader{break-inside:avoid}');
  css.push('.subMenuHeader{break-after:avoid}');

  // Logo and title
  const logoMargins = { left: 'margin-left:0;margin-right:auto', center: 'margin-left:auto;margin-right:auto', right: 'margin-left:auto;margin-right:0' };
  css.push(`.menuLogoUnit{margin-bottom:${num(header.logo.spaceBelowRem)}rem}`);
  css.push(`.menuLogo{max-width:${num(header.logo.maxWidthPct)}%;height:auto;display:block;${logoMargins[header.logo.align]}}`);

  // Sections
  css.push(`.subMenuDiv{width:${num(sections.widthPct)}%;text-align:center;margin:0 auto}`);
  if (sections.gapAboveRem > 0) {
    css.push(`.subMenuDiv:not(.continuation):not(.pageStart){margin-top:${num(sections.gapAboveRem)}rem}`);
  }
  css.push(`.subMenuHeader{margin:auto;${boxDeclarations(sections.heading.box)}}`);
  css.push('.itemTable{width:100%}');
  css.push('.containerNameSubTable,.containerPrices{width:100%}');

  // Rows
  if (rows.gapRem > 0) {
    css.push(`.itemGroup tr:last-child>td{padding-bottom:calc(0.0625em + ${num(rows.gapRem)}rem)}`);
  }
  if (rows.divider.show) {
    css.push(`.itemDivider>td{padding:0;border-bottom:${num(rows.divider.widthPx)}px ${rows.divider.style} ${rows.divider.color}}`);
  }

  // Columns: c0, c1, ... in the order of the design
  design.columns.forEach((column, index) => {
    const cell = `.itemTable td.c${index}`;
    if (column.type === 'thumbnail') {
      css.push(`${cell}{width:1%;white-space:nowrap}`);
      css.push(`.c${index} .thumb{display:block;width:${num(column.sizePx)}px;height:${num(column.sizePx)}px;border-radius:${SHAPE_RADIUS[column.shape]};background-size:cover;background-position:center;background-repeat:no-repeat}`);
      return;
    }
    if (column.widthPct !== null) {
      css.push(`${cell}{width:${num(column.widthPct)}%}`);
    } else {
      // Shares what the other columns leave: only the heading row asks for the space, as it always has
      css.push(`.itemTable .itemHeader td.c${index}{width:100%}`);
    }
    if (column.type === 'prices') {
      css.push(`.c${index} .containerName,.c${index} .containerPriceCell{width:${num(column.sizeWidthPct)}%}`);
    }
  });

  // Footer: fixed, so browsers repeat it at the bottom of every printed page
  css.push(
    `.pageFooter{position:fixed;bottom:${num(footer.bottomIn)}in;left:${num(m.left)}in;width:${num(bodyWidthIn)}in}`,
  );
  css.push('@media screen{.pageFooter{position:static;width:auto;margin:0.25in auto 0.5in}}');
  css.push(`.pageFooterRule{border-top:${num(footer.rule.widthPx)}px solid ${footer.rule.color};margin-bottom:6px}`);

  return css.join('\n');
}

// What the designer's preview adds to the page (see previewScript.ts)
export function previewCss(): string {
  return [
    // Where the preview script has put a page start: the gap down to the top of its page
    '.pageStart{margin-top:var(--toe-gap,0px)}',
    // Parts of the menu that can be clicked to find their controls
    '[data-pick]{cursor:pointer}',
    '[data-pick]:hover{outline:2px solid rgba(37,99,235,0.6);outline-offset:1px}',
  ].join('\n');
}
