import * as mupdf from 'mupdf';
import { zipSync } from 'fflate';

// The menu board is laid out as a PDF (pdfkit is good at that), but the TVs that show it can't
// display PDFs. These helpers turn the finished PDF into one PNG per page.
//
// The page size is in PDF points and one point becomes one pixel, so a 1080x1920 page comes out
// as a 1080x1920 image.

// Renders every page of a PDF to a PNG, in page order.
export function pdfToPngs(pdf: Buffer): Uint8Array[] {
  const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
  try {
    const pngs: Uint8Array[] = [];
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      // No alpha channel: the board paints its own background, and a TV has no use for transparency
      const pixmap = page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB, false, true);
      pngs.push(pixmap.asPNG());
      pixmap.destroy();
      page.destroy();
    }
    return pngs;
  } finally {
    doc.destroy();
  }
}

// The name a page's image is downloaded as (and stored under in the ZIP), 1-based.
export function pageFileName(pageNumber: number): string {
  return `menu-board-${pageNumber}.png`;
}

// Bundles the page images into one ZIP so they can be downloaded together. PNGs are already
// compressed, so the files are stored as-is.
export function zipPages(pngs: Uint8Array[]): Buffer {
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  pngs.forEach((png, i) => {
    files[pageFileName(i + 1)] = [png, { level: 0 }];
  });
  return Buffer.from(zipSync(files));
}
