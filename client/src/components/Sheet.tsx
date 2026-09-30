import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { CloseIcon } from './Icons';

type SheetProps = {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
};

// A bottom sheet dialog: slides up over the current screen, closes on Escape, the scrim, or the
// close button, and keeps keyboard focus inside while it's open.
export function Sheet({ title, eyebrow, onClose, children, tall }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select');
    (first ?? panel.current)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab' && panel.current) {
        const focusable = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea')];
        if (focusable.length === 0) return;
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
    // Only on open/close; onClose identity changes shouldn't refocus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sheet-layer">
      <button type="button" className="sheet-scrim" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={panel} className={`sheet${tall ? ' sheet-tall' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <div className="sheet-titles">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id={titleId} className="sheet-title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type NameSheetProps = {
  title: string;
  eyebrow?: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<unknown>;
};

// A sheet with a single required text field, for creating or renaming menus and sections.
export function NameSheet({ title, eyebrow, label, initialValue = '', placeholder, submitLabel, onClose, onSubmit }: NameSheetProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${label} can't be empty.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={title} eyebrow={eyebrow} onClose={onClose}>
      <form className="sheet-body stack" onSubmit={submit} noValidate>
        <label className="field-label">
          {label}
          <input
            className="field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            maxLength={200}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </form>
    </Sheet>
  );
}

type ConfirmSheetProps = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
};

export function ConfirmSheet({ title, message, confirmLabel, onClose, onConfirm }: ConfirmSheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="sheet-body stack">
        <p className="muted">{message}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={confirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
