import { fontFaceCss } from '../models/fonts';
import { Column, ItemField, Line, parsePrintDesign, PrintDesign, TextStyle } from '../models/menuDesign';
import { designCss, ImageRegistry, num, pageDimensions, StyleRegistry } from './css';
import { FIT_SCRIPT } from './fitScript';
import { PrintItem, PrintModel, PrintSection } from './model';

/*
The printable menu as a page of HTML: the data (PrintModel) laid out as the design says. A pure
function, so the public ?format=print view and the designer's live preview are the same code.

The page is deliberately written with no doctype (the browser's "quirks mode"), as it always has been:
table sizing and text alignment behave a little differently there, and the look of existing menus
depends on it.
*/

// Text goes into the page escaped, whatever it is: the characters HTML treats specially, and anything
// outside plain ASCII as a numeric entity, so the page reads the same whatever encoding it is shown in.
export function escapeHtml(text: string): string {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (character === '&') out += '&amp;';
    else if (character === '<') out += '&lt;';
    else if (character === '>') out += '&gt;';
    else if (character === '"') out += '&quot;';
    else if (character === "'") out += '&#39;';
    else if (code > 126) out += `&#x${code.toString(16)};`;
    else out += character;
  }
  return out;
}

// Pictures are stored as bare base64. Only well-formed base64 of a known image type becomes a data:
// URL, so what is put into the page (and the stylesheet) can't contain anything but base64 characters.
export function imageDataUrl(base64: string | null | undefined): string | null {
  if (!base64) return null;
  const clean = base64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null;
  const head = Buffer.from(clean.slice(0, 24), 'base64');
  let mime = 'image/png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) mime = 'image/jpeg';
  else if (head.length >= 4 && head.subarray(0, 4).toString('ascii') === 'GIF8') mime = 'image/gif';
  else if (head.length >= 12 && head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp';
  return `data:${mime};base64,${clean}`;
}

function fieldValue(item: PrintItem, field: ItemField, fixedText: string | undefined): string | null {
  let value: string | null;
  switch (field) {
    case 'breweryName': value = item.breweryName; break;
    case 'breweryLocation': value = item.breweryLocation; break;
    case 'displayName': value = item.displayName; break;
    case 'style': value = item.style; break;
    // An ABV of 0 is a real value and is shown
    case 'abv': value = item.abv === null || item.abv === undefined ? null : String(item.abv); break;
    case 'description': value = item.description; break;
    case 'category': value = item.category; break;
    case 'text': value = fixedText ?? null; break;
  }
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export interface RenderOptions {
  // The date for {date} in the title and footer; now by default
  now?: Date;
}

export function renderPrintMenu(model: PrintModel, design: PrintDesign, options: RenderOptions = {}): string {
  // Whatever calls this, only a valid design is drawn
  const parsed = parsePrintDesign(design);
  if (!parsed.ok) {
    throw new Error(`Invalid print design: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
  }
  const d = parsed.design;
  const styles = new StyleRegistry();
  const images = new ImageRegistry();

  const date = (options.now ?? new Date()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const expandTokens = (template: string) =>
    template.replace(/\{(menu\.name|date)\}/g, (_match, token: string) => (token === 'date' ? date : model.menuName));

  const lineHtml = (line: Line, item: PrintItem): string | null => {
    let html = '';
    let printed = false;
    for (const part of line.parts) {
      const value = fieldValue(item, part.field, part.text);
      if (value === null) continue;
      // Split and join rather than replace, so a value with "$&" in it stays as it is
      const text = part.format.split('{value}').join(value);
      if (printed && part.before) html += escapeHtml(part.before);
      html += part.style
        ? `<span class="${styles.classFor({ ...line.style, ...part.style } as TextStyle)}">${escapeHtml(text)}</span>`
        : escapeHtml(text);
      printed = true;
    }
    // A line with nothing to print is left out entirely
    return printed ? `<div class="${styles.classFor(line.style)}">${html}</div>` : null;
  };

  const linesHtml = (lines: Line[], item: PrintItem) =>
    lines.map((line) => lineHtml(line, item)).filter((html): html is string => html !== null).join('');

  const sizesFor = (column: Extract<Column, { type: 'prices' }>, section: PrintSection) =>
    column.sizes === 'all' ? section.sizes : section.sizes.filter((size) => size.containerIds.some((id) => (column.sizes as string[]).includes(id)));

  const showBelowRow = d.columns.some((column) => column.type === 'fields' && column.belowLines.length > 0);
  const showHeaderRow = d.columns.some((column) => column.type === 'prices' && column.heading.show);

  const headerRow = (section: PrintSection): string => {
    if (!showHeaderRow) return '';
    const cells = d.columns.map((column, index) => {
      if (column.type !== 'prices' || !column.heading.show) return `<td class="c${index}"></td>`;
      const heading = styles.classFor(column.heading.style);
      const names = sizesFor(column, section).map((size) => `<th class="containerName ${heading}">${escapeHtml(size.displayName)}</th>`).join('');
      return `<td class="c${index}"><table class="containerNameSubTable"><tr>${names}</tr></table></td>`;
    });
    return `<tbody class="itemHeader"><tr>${cells.join('')}</tr></tbody>`;
  };

  const mainCell = (column: Column, index: number, item: PrintItem, section: PrintSection): string => {
    if (column.type === 'fields') return `<td class="c${index}">${linesHtml(column.lines, item)}</td>`;
    if (column.type === 'prices') {
      const cellClass = styles.classFor(column.cell.style);
      const cells = sizesFor(column, section).map((size) => {
        const price = item.prices.get(size.displayName);
        // A size the item doesn't come in leaves its cell empty, with no stray $
        const text = price !== undefined && price.trim() !== '' ? column.cell.format.split('{value}').join(price) : '';
        return `<td class="containerPriceCell ${cellClass}">${escapeHtml(text)}</td>`;
      });
      return `<td class="c${index}"><table class="containerPrices"><tr>${cells.join('')}</tr></table></td>`;
    }
    const picture = imageDataUrl(item.itemLogo)
      ?? (column.source === 'item-then-brewery-then-menu' ? imageDataUrl(item.breweryLogo) : null)
      ?? imageDataUrl(model.menuLogo);
    return `<td class="c${index}">${picture ? `<span class="thumb ${images.classFor(picture)}"></span>` : ''}</td>`;
  };

  const itemGroup = (item: PrintItem, section: PrintSection): string => {
    let html = `<tbody class="itemGroup"><tr>${d.columns.map((column, index) => mainCell(column, index, item, section)).join('')}</tr>`;
    if (showBelowRow) {
      const cells = d.columns.map((column, index) => `<td class="c${index}">${column.type === 'fields' ? linesHtml(column.belowLines, item) : ''}</td>`);
      html += `<tr>${cells.join('')}</tr>`;
    }
    if (d.rows.divider.show) html += `<tr class="itemDivider"><td colspan="${d.columns.length}"></td></tr>`;
    return `${html}</tbody>`;
  };

  const headingClass = styles.classFor(d.sections.heading.style);
  const sectionHtml = (section: PrintSection): string =>
    `<div class="subMenuDiv"><h3 class="header subMenuHeader ${headingClass}">${escapeHtml(section.name)}</h3>` +
    `<div><table class="itemTable">${headerRow(section)}${section.items.map((item) => itemGroup(item, section)).join('')}</table></div></div>`;

  // ---- The page ----

  const logo = d.header.logo.show ? imageDataUrl(model.menuLogo) : null;
  const logoHtml = logo ? `<div class="menuLogoUnit"><img class="menuLogo" src="${logo}" alt=""></div>` : '';
  const titleHtml = d.header.title.show && d.header.title.text.trim() !== ''
    ? `<div class="menuTitle ${styles.classFor(d.header.title.style)}">${escapeHtml(expandTokens(d.header.title.text))}</div>`
    : '';

  let footerHtml = '';
  if (d.footer.show) {
    const lines = expandTokens(d.footer.text).split('\n').filter((line) => line.trim() !== '');
    const footerClass = styles.classFor(d.footer.style, true);
    footerHtml =
      '<div class="pageFooter">' +
      (d.footer.rule.show ? '<div class="pageFooterRule"></div>' : '') +
      lines.map((line) => `<div class="pageFooterText ${footerClass}">${escapeHtml(line)}</div>`).join('') +
      '</div>';
  }

  const { heightIn } = pageDimensions(d);
  const rootAttributes =
    `data-page-height-px="${num(heightIn * 96)}" data-top-px="${num(d.page.marginsIn.top * 96)}" ` +
    `data-bottom-px="${num(d.page.marginsIn.bottom * 96)}" data-max-pages="${d.page.maxPages ?? ''}" data-fit="${d.page.fit}"`;

  const body =
    `<div id="menuRoot" ${rootAttributes}>${logoHtml}${titleHtml}${model.sections.map(sectionHtml).join('')}</div>${footerHtml}`;

  // Collected while the body was built, so the stylesheet has exactly what the page uses
  const stylesheet = [fontFaceCss(styles.fonts()), designCss(d), styles.css(), images.css()].filter(Boolean).join('\n');
  return (
    `<html><head><meta charset="utf-8"><title>${escapeHtml(model.menuName)}</title><style>\n${stylesheet}\n</style></head>` +
    `<body>${body}<script>${FIT_SCRIPT}</script></body></html>`
  );
}
