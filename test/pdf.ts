import * as mupdf from 'mupdf';
import request from 'supertest';
import type { Express } from 'express';

// Reading a PDF back, for tests of the printable menu: what text it draws, in which font and size,
// and where on which page.

export interface TextLine {
  // 1-based
  page: number;
  text: string;
  // The left end and the baseline, in points from the page's top-left corner
  x: number;
  y: number;
  width: number;
  size: number;
  // The font's name, e.g. 'Montserrat-Bold' (the random prefix pdfkit gives an embedded font is removed)
  font: string;
  // e.g. '#222222'
  color: string;
}

function open(pdf: Uint8Array): mupdf.Document {
  return mupdf.Document.openDocument(pdf, 'application/pdf');
}

export function pageCount(pdf: Uint8Array): number {
  const doc = open(pdf);
  try {
    return doc.countPages();
  } finally {
    doc.destroy();
  }
}

// The size of each page in points
export function pageSizes(pdf: Uint8Array): Array<{ width: number; height: number }> {
  const doc = open(pdf);
  try {
    return Array.from({ length: doc.countPages() }, (_, i) => {
      const [x0, y0, x1, y1] = doc.loadPage(i).getBounds();
      return { width: x1 - x0, height: y1 - y0 };
    });
  } finally {
    doc.destroy();
  }
}

// Every run of text in the PDF, page by page, top to bottom. A run is characters of one line that share a
// font, size and color: the name of a beer in bold is a run of its own, inside the line it sits in.
export function textLines(pdf: Uint8Array): TextLine[] {
  const doc = open(pdf);
  try {
    const lines: TextLine[] = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const structured = doc.loadPage(i).toStructuredText('preserve-whitespace');
      let current: (TextLine & { end: number }) | null = null;
      structured.walk({
        beginLine() {
          current = null;
        },
        onChar(c, origin, font, size, quad, color) {
          const name = font.getName().replace(/^[A-Z]{6}\+/, '');
          const rgb = (color.length === 1 ? [color[0], color[0], color[0]] : color).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
          const key = `#${rgb}`;
          const right = Math.max(quad[2], quad[6]);
          if (!current || current.font !== name || Math.abs(current.size - size) > 0.01 || current.color !== key) {
            current = { page: i + 1, text: '', x: origin[0], y: origin[1], width: 0, size, font: name, color: key, end: origin[0] };
            lines.push(current);
          }
          current.text += c;
          current.end = right;
          current.width = right - current.x;
        },
      });
    }
    return lines.map(({ end, ...line }) => line).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  } finally {
    doc.destroy();
  }
}

// The runs that sit on the same line of the page put together, left to right, with a space where there
// is a gap. `within` keeps only the runs starting between those x positions (one column, say).
export function textRows(pdf: Uint8Array, within: [number, number] = [0, Infinity]): Array<{ page: number; y: number; text: string; lines: TextLine[] }> {
  const rows: Array<{ page: number; y: number; text: string; lines: TextLine[] }> = [];
  for (const line of textLines(pdf)) {
    if (line.x < within[0] || line.x >= within[1]) continue;
    const row = rows.find((r) => r.page === line.page && Math.abs(r.y - line.y) < 2.5);
    if (row) row.lines.push(line);
    else rows.push({ page: line.page, y: line.y, text: '', lines: [line] });
  }
  for (const row of rows) {
    row.lines.sort((a, b) => a.x - b.x);
    row.text = row.lines
      .reduce((text, line, i) => {
        if (i === 0) return line.text;
        const previous = row.lines[i - 1];
        return text + (line.x - (previous.x + previous.width) > line.size * 0.12 ? ' ' : '') + line.text;
      }, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return rows;
}

// All the text, with a line break where the page has one
export function plainText(pdf: Uint8Array): string {
  return textRows(pdf).map((row) => row.text).join('\n');
}

// A page drawn as pixels, for checking colors
export function pagePixels(pdf: Uint8Array, pageNumber = 1, scale = 1) {
  const doc = open(pdf);
  try {
    const pixmap = doc.loadPage(pageNumber - 1).toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    const pixels = pixmap.getPixels();
    const stride = pixmap.getStride();
    const channels = pixmap.getNumberOfComponents();
    const result = {
      width: pixmap.getWidth(),
      height: pixmap.getHeight(),
      // The color at a point of the page, given in points
      at: (x: number, y: number) => {
        const [column, row] = [Math.floor(x * scale), Math.floor(y * scale)];
        return [...pixels.subarray(row * stride + column * channels, row * stride + column * channels + 3)];
      },
    };
    return result;
  } finally {
    doc.destroy();
  }
}

export const hex = (color: string) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
export const near = (actual: number[], expected: number[], tolerance = 4) => actual.every((value, i) => Math.abs(value - expected[i]) <= tolerance);

// Requests a PDF from an app: the response, and its body as bytes
export async function getPdf(app: Express, url: string) {
  const res = await request(app).get(url).buffer(true).parse((response, callback) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => callback(null, Buffer.concat(chunks)));
  });
  return { res, pdf: new Uint8Array(res.body as Buffer) };
}
