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

type Props = { menuId: string; design: PrintDesign };

// The menu as the design draws it, from the same code that draws the print view. It follows the
// design as it is edited, and keeps showing the last drawing that worked if a newer one can't be made.
export function DesignPreview({ menuId, design }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [width, setWidth] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const frameLoaded = useRef(false);
  const drawn = useRef(false);

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
  const pages = Math.max(1, design.page.maxPages ?? 2);
  const scale = width > 0 ? width / page.width : 1;

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
      </div>
      <div ref={holder} className="design-preview-holder" style={{ height: page.height * pages * scale }}>
        <iframe
          ref={frame}
          className="design-preview-frame"
          title="Print menu preview"
          src={FRAME_URL}
          // Scripts so the menu can fit itself to its pages; nothing else (no access to this app)
          sandbox="allow-scripts"
          width={page.width}
          height={page.height * pages}
          style={{ transform: `scale(${scale})` }}
          onLoad={() => {
            frameLoaded.current = true;
            send(html);
          }}
        />
      </div>
    </div>
  );
}
