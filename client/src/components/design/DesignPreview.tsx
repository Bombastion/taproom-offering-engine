import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api';
import { PAGE_PX, PrintDesign } from '../../design';

// How long the design has to stop changing before the preview is asked for again
const PAUSE_MS = 300;

// Where the preview is drawn: a page of its own (client/public/preview-frame.html), because the
// print menu can't be shown in an iframe's srcdoc. See that file for why.
const FRAME_URL = `${import.meta.env.BASE_URL}preview-frame.html`;

// What to say when the server turns a design down: the first thing wrong with it, where
function problemText(e: unknown): string {
  if (e instanceof ApiError && e.issues && e.issues.length > 0) {
    const [first] = e.issues;
    return first.path ? `${first.path}: ${first.message}` : first.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

// What the menu page says about itself once it has laid itself out (see print/previewScript.ts)
type PreviewInfo = {
  pages: number;
  maxPages: number | null;
  // The size the text ended up at, and the normal size, in px
  fontPx: number;
  normalPx: number;
  fit: 'shrink-to-pages' | 'none';
  fits: boolean;
  // The height of all of its pages, at full size
  heightPx: number;
};

function readInfo(data: Record<string, unknown>): PreviewInfo | null {
  const { pages, maxPages, fontPx, normalPx, fit, fits, heightPx } = data;
  const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (!positive(pages) || !positive(fontPx) || !positive(normalPx) || !positive(heightPx) || typeof fits !== 'boolean') return null;
  if (maxPages !== null && !positive(maxPages)) return null;
  return { pages, maxPages: maxPages as number | null, fontPx, normalPx, fit: fit === 'none' ? 'none' : 'shrink-to-pages', fits, heightPx };
}

// How far the text was shrunk, as a percentage (null when it wasn't)
export function shrunkTo(info: PreviewInfo): number | null {
  const percent = Math.round((info.fontPx / info.normalPx) * 100);
  return info.fontPx < info.normalPx - 0.05 && percent < 100 ? percent : null;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

type Props = {
  menuId: string;
  design: PrintDesign;
  // A part of the menu was clicked: 'page', 'header', 'headings', 'rows', 'footer' or 'column:<ID>'
  onPick?: (pick: string) => void;
};

// The menu as the design draws it, from the same code that draws the print view. It follows the
// design as it is edited, and keeps showing the last drawing that worked if a newer one can't be made.
export function DesignPreview({ menuId, design, onPick }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [width, setWidth] = useState(0);
  const [info, setInfo] = useState<PreviewInfo | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const frameLoaded = useRef(false);
  const drawn = useRef(false);
  const picked = useRef(onPick);
  picked.current = onPick;

  const designKey = JSON.stringify(design);

  // Ask for a new drawing once the design has settled; drop the request if it changes again first
  useEffect(() => {
    const controller = new AbortController();
    // The first drawing doesn't wait for anything
    const timer = window.setTimeout(async () => {
      setUpdating(true);
      try {
        const page = await api.previewPrintDesign(menuId, JSON.parse(designKey) as PrintDesign, controller.signal);
        drawn.current = true;
        setHtml(page);
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

  // Hand the page to the frame, once it is there to take it
  const send = (page: string | null) => {
    if (page !== null && frameLoaded.current) frame.current?.contentWindow?.postMessage({ type: 'toe-preview', html: page }, '*');
  };
  useEffect(() => send(html), [html]);

  // What the page says back: how it came out, and what was clicked. Only from the frame itself.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'toe-preview-info') {
        const next = readInfo(data);
        if (next) setInfo(next);
      } else if (data.type === 'toe-preview-pick' && typeof data.pick === 'string') {
        picked.current?.(data.pick);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Scale the page to the room there is
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const page = PAGE_PX[design.page.size];
  // All of the pages, once the page has said how many there are (until then, as many as it may have)
  const frameHeight = info?.heightPx ?? page.height * Math.max(1, design.page.maxPages ?? 2);
  const scale = width > 0 ? width / page.width : 1;
  const shrunk = info ? shrunkTo(info) : null;

  return (
    <div className="design-preview">
      <div className="design-preview-status">
        {problem ? (
          <div className="preview-problem" role="alert">
            <strong>The preview couldn't update.</strong> {problem}
            {html !== null && ' Showing the last version that worked.'}
          </div>
        ) : (
          <span className="muted-sm" role="status">{updating || html === null ? 'Updating preview…' : 'Preview is up to date'}</span>
        )}
        {info && (
          <span className="muted-sm design-preview-readout" title="The dotted lines show the margins. They are only a guide and are not printed.">
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
      <div ref={holder} className="design-preview-holder" style={{ height: frameHeight * scale }}>
        <iframe
          ref={frame}
          className="design-preview-frame"
          title="Print menu preview"
          src={FRAME_URL}
          // Scripts so the menu can fit itself to its pages; nothing else (no access to this app)
          sandbox="allow-scripts"
          width={page.width}
          height={frameHeight}
          style={{ transform: `scale(${scale})` }}
          onLoad={() => {
            // Writing a page into the frame loads it again, so only the first time is the frame
            // arriving; sending again here would write the page again, without end
            if (frameLoaded.current) return;
            frameLoaded.current = true;
            send(html);
          }}
        />
      </div>
    </div>
  );
}
