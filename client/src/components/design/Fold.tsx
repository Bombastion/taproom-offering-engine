import { ReactNode, useId } from 'react';
import { ChevronRight } from '../Icons';

type Props = {
  title: string;
  // What is inside, in a few words, shown while it is closed
  summary?: string;
  open: boolean;
  onToggle: () => void;
  // Buttons that belong to the entry itself (move, remove); they sit beside the toggle, not inside it
  actions?: ReactNode;
  children: ReactNode;
};

// An entry of a list that opens to show its controls
export function Fold({ title, summary, open, onToggle, actions, children }: Props) {
  const bodyId = useId();
  return (
    <div className={`fold${open ? ' fold-open' : ''}`}>
      <div className="fold-head">
        <button type="button" className="fold-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span className="fold-text">
            <span className="fold-title">{title}</span>
            {/* The space keeps the two apart for a screen reader, which reads them as one name */}
            {summary && ' '}
            {summary && <span className="fold-summary">{summary}</span>}
          </span>
          <span className={`design-group-chevron${open ? ' open' : ''}`}><ChevronRight /></span>
        </button>
        {actions && <div className="fold-actions">{actions}</div>}
      </div>
      {open && (
        <div id={bodyId} className="fold-body stack-sm">
          {children}
        </div>
      )}
    </div>
  );
}
