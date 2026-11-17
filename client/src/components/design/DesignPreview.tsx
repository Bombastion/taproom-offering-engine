import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api';
import { PrintDesign, PrintPreview, PrintPreviewInfo, PrintPreviewMark } from '../../design';

// How long the design has to stop changing before the preview is asked for again
const PAUSE_MS = 300;

// What to say when the server turns a design down: the first thing wrong with it, where
export function problemText(e: unknown): string {
  if (e instanceof ApiError && e.issues && e.issues.length > 0) {
    const [first] = e.issues;
    return first.path ? `${first.path}: ${first.message}` : first.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

// How far the text was shrunk, as a percentage (null when it wasn't)
export function shrunkTo(info: PrintPreviewInfo): number | null {
  const percent = Math.round(info.scale * 100);
  return percent < 100 ? percent : null;
}

// The part of a page that was pointed at: of the marks the point is inside, the smallest one, and the
// one drawn last if two are the same size
export function markAt(marks: PrintPreviewMark[], page: number, x: number, y: number): PrintPreviewMark | null {
  let found: PrintPreviewMark | null = null;
  for (const mark of marks) {
    if (mark.page !== page || x < mark.x || x > mark.x + mark.width || y < mark.y || y > mark.y + mark.height) continue;
    if (!found || mark.width * mark.height <= found.width * found.height) found = mark;
  }
  return found;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

type Props = {
  menuId: string;
  design: PrintDesign;
  // A part of the menu was clicked: 'page', 'header', 'headings', 'rows', 'footer' or 'column:<ID>'
  onPick?: (pick: string) => void;
};

// The menu as the design draws it: a picture of each page of the PDF the print view makes, drawn by
// the same code. It follows the design as it is edited, and keeps showing the last drawing that worked
// if a newer one can't be made. Clicking a part of a page picks the controls that change it.
export function DesignPreview({ menuId, design, onPick }: Props) {
  const [preview, setPreview] = useState<PrintPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [hover, setHover] = useState<PrintPreviewMark | null>(null);
  const drawn = useRef(false);

  const designKey = JSON.stringify(design);

  // Ask for a new drawing once the design has settled; drop the request if it changes again first
  useEffect(() => {
    const controller = new AbortController();
    // The first drawing doesn't wait for anything
    const timer = window.setTimeout(async () => {
      setUpdating(true);
      try {
        const result = await api.previewPrintDesign(menuId, JSON.parse(designKey) as PrintDesign, controller.signal);
        drawn.current = true;
        setPreview(result);
        setProblem(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setProblem(problemText(e));
      }
      setUpdating(false);
    }, drawn.current ? PAUSE_MS : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [menuId, designKey]);

  // Where on a page, as fractions of it, a mouse event was
  const pointOf = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };
  const markUnder = (event: React.MouseEvent<HTMLDivElement>, page: number) => {
    const point = pointOf(event);
    return point && preview ? markAt(preview.marks, page, point.x, point.y) : null;
  };

  const info = preview?.info ?? null;
  const shrunk = info ? shrunkTo(info) : null;

  return (
    <div className="design-preview" role="group" aria-label="Print menu preview">
      <div className="design-preview-status">
        {problem ? (
          <div className="preview-problem" role="alert">
            <strong>The preview couldn't update.</strong> {problem}
            {preview !== null && ' Showing the last version that worked.'}
          </div>
        ) : (
          <span className="muted-sm" role="status">{updating || preview === null ? 'Updating preview…' : 'Preview is up to date'}</span>
        )}
        {info && (
          <span className="muted-sm design-preview-readout">
            {plural(info.pages, 'page')}
            {shrunk !== null && ` · text shrunk to ${shrunk}%`}
          </span>
        )}
      </div>
      {info && !info.fits && info.maxPages !== null && (
        <div className="notice" role="status">
          {info.fit === 'shrink-to-pages'
            ? `Even with the text shrunk as far as it goes, the menu runs to ${plural(info.pages, 'page')}, and ${info.maxPages} ${info.maxPages === 1 ? 'is' : 'are'} allowed. Allow more pages, or take something out.`
            : `At these sizes the menu runs to ${plural(info.pages, 'page')}, and ${info.maxPages} ${info.maxPages === 1 ? 'is' : 'are'} allowed. Allow more pages, make the text smaller, or choose Shrink to fit.`}
        </div>
      )}
      {preview && (
        <div className="print-pages">
          {preview.pages.map((picture, index) => {
            const page = index + 1;
            return (
              <div
                key={index}
                className="print-page"
                data-testid="print-page"
                style={hover && hover.page === page ? { cursor: 'pointer' } : undefined}
                onClick={(event) => {
                  const mark = markUnder(event, page);
                  if (mark) onPick?.(mark.pick);
                }}
                onMouseMove={(event) => {
                  const mark = markUnder(event, page);
                  setHover((current) => (current === mark ? current : mark));
                }}
                onMouseLeave={() => setHover(null)}
              >
                <img src={picture} alt={`Print menu, page ${page} of ${preview.pages.length}`} draggable={false} />
                {hover && hover.page === page && hover.pick !== 'page' && (
                  <div
                    className="print-page-hover"
                    data-testid="print-page-hover"
                    aria-hidden="true"
                    style={{ left: `${hover.x * 100}%`, top: `${hover.y * 100}%`, width: `${hover.width * 100}%`, height: `${hover.height * 100}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
