import { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { BackIcon, ChevronRight } from './Icons';

// How close to an end counts as being at it (scroll positions are fractional on some screens)
const EDGE_PX = 2;

// A row of chips under a short heading. The row scrolls sideways when the chips don't all fit, and
// shows an arrow at whichever end has more chips out of sight (a tap on it scrolls that way).
export function ChipSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ before: false, after: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const before = el.scrollLeft > EDGE_PX;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_PX;
    setMore((m) => (m.before === before && m.after === after ? m : { before, after }));
  }, []);

  // Measure again when the row, or what is in it, changes size (a window resize, a chip added)
  useEffect(() => {
    measure();
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);

  const scroll = (direction: -1 | 1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <section className="chip-section" aria-labelledby={titleId}>
      <h2 id={titleId} className="chip-section-title">{title}</h2>
      <div className="chip-scroll">
        <div className="chip-row" ref={row} onScroll={measure}>
          {children}
        </div>
        {/* For people with a mouse; a keyboard reaches every chip by tabbing, which scrolls it into view */}
        {more.before && (
          <button type="button" className="chip-edge chip-edge-before" aria-label={`Show earlier ${title} options`} tabIndex={-1} onClick={() => scroll(-1)}>
            <BackIcon size={18} />
          </button>
        )}
        {more.after && (
          <button type="button" className="chip-edge chip-edge-after" aria-label={`Show more ${title} options`} tabIndex={-1} onClick={() => scroll(1)}>
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </section>
  );
}
