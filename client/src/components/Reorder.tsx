import { DownIcon, UpIcon } from './Icons';

// Up/down buttons shown in place of a row's chevron while a list is in reorder mode.
// (Buttons rather than drag-and-drop: easier to hit on a phone and usable with a keyboard.)
export function MoveButtons({ label, index, count, onMove }: { label: string; index: number; count: number; onMove: (from: number, to: number) => void }) {
  return (
    <div className="move-btns">
      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <UpIcon />
      </button>
      <button type="button" className="icon-btn icon-btn-sm" aria-label={`Move ${label} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
        <DownIcon />
      </button>
    </div>
  );
}

export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [entry] = next.splice(from, 1);
  next.splice(to, 0, entry);
  return next;
}
