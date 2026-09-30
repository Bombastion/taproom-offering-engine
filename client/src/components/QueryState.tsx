import { errorMessage } from '../api';

// Loading and error placeholders for data-driven screens
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state-box" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="state-box state-error" role="alert">
      <div>{errorMessage(error)}</div>
      <button type="button" className="btn-secondary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
