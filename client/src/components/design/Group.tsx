import { ReactNode, useId } from 'react';
import { ChevronRight } from '../Icons';

type GroupProps<Id extends string> = { id: Id; title: string; open: boolean; onToggle: (open: Id | null) => void; children: ReactNode };

// One set of controls, opened by its heading; opening one closes the others
export function Group<Id extends string>({ id, title, open, onToggle, children }: GroupProps<Id>) {
  const bodyId = useId();
  return (
    <section id={`design-group-${id}`} className="panel design-group">
      <h2 className="design-group-title">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(open ? null : id)}>
          {title}
          <span className={`design-group-chevron${open ? ' open' : ''}`}><ChevronRight /></span>
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="design-group-body stack-sm">
          {children}
        </div>
      )}
    </section>
  );
}
