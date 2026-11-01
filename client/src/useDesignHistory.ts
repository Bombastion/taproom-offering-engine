import { useCallback, useReducer } from 'react';
import { PrintDesign, sameDesign, setIn } from './design';

/*
The design being edited, with undo and redo.

`present` is the edited design, or null while nothing has been changed from `base` (the saved design,
which can change underneath: saving it, or loading it again). Everything in `past` and `future` is a
whole design, so what a step takes back doesn't depend on what is saved at the time.

A run of changes to the same setting made in quick succession (typing a number, dragging a color)
is one step, so undo goes back to before the run and not to the last keystroke.
*/

type Path = (string | number)[];

type State = {
  past: PrintDesign[];
  present: PrintDesign | null;
  future: PrintDesign[];
  // The setting changed last and when, for joining a run of changes into one step
  last: { key: string; at: number } | null;
};

type Action =
  | { type: 'change'; base: PrintDesign; path: Path; value: unknown; now: number }
  | { type: 'replace'; base: PrintDesign; design: PrintDesign }
  | { type: 'revert'; base: PrintDesign }
  | { type: 'undo'; base: PrintDesign }
  | { type: 'redo'; base: PrintDesign }
  | { type: 'saved' }
  | { type: 'clear' };

const EMPTY: State = { past: [], present: null, future: [], last: null };

// How far apart two changes to one setting can be and still count as the same run
export const RUN_MS = 800;
const MAX_STEPS = 100;

// Lists (a column moved, a line removed) and switches are each a step of their own
const joinable = (value: unknown) => !Array.isArray(value) && typeof value !== 'boolean';

function remember(past: PrintDesign[], design: PrintDesign): PrintDesign[] {
  return [...past, design].slice(-MAX_STEPS);
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'change': {
      const current = state.present ?? action.base;
      const next = setIn(current, action.path, action.value);
      if (sameDesign(next, current)) return state;
      const key = JSON.stringify(action.path);
      const joins = joinable(action.value) && state.last !== null && state.last.key === key && action.now - state.last.at < RUN_MS;
      return {
        past: joins ? state.past : remember(state.past, current),
        present: next,
        future: [],
        last: joinable(action.value) ? { key, at: action.now } : null,
      };
    }
    case 'replace': {
      const current = state.present ?? action.base;
      if (sameDesign(action.design, current)) return state;
      return { past: remember(state.past, current), present: action.design, future: [], last: null };
    }
    case 'revert':
      return state.present === null ? state : { past: remember(state.past, state.present), present: null, future: [], last: null };
    case 'undo': {
      if (state.past.length === 0) return state;
      const current = state.present ?? action.base;
      return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [current, ...state.future], last: null };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const current = state.present ?? action.base;
      return { past: remember(state.past, current), present: state.future[0], future: state.future.slice(1), last: null };
    }
    case 'saved':
      return { ...state, present: null, last: null };
    case 'clear':
      return EMPTY;
  }
}

export function useDesignHistory(base: PrintDesign | undefined) {
  const [state, dispatch] = useReducer(reduce, EMPTY);

  const design = state.present ?? base;
  const dirty = base !== undefined && state.present !== null && !sameDesign(state.present, base);

  return {
    design,
    dirty,
    canUndo: base !== undefined && state.past.length > 0,
    canRedo: base !== undefined && state.future.length > 0,
    // Sets what is at `path`
    change: useCallback((path: Path, value: unknown) => base && dispatch({ type: 'change', base, path, value, now: Date.now() }), [base]),
    // Takes the place of the whole design (a preset)
    replace: useCallback((next: PrintDesign) => base && dispatch({ type: 'replace', base, design: next }), [base]),
    // Back to what is saved
    revert: useCallback(() => base && dispatch({ type: 'revert', base }), [base]),
    undo: useCallback(() => base && dispatch({ type: 'undo', base }), [base]),
    redo: useCallback(() => base && dispatch({ type: 'redo', base }), [base]),
    // What was edited is now what is saved
    markSaved: useCallback(() => dispatch({ type: 'saved' }), []),
    // Forget every change and every step (after the saved design is removed)
    clear: useCallback(() => dispatch({ type: 'clear' }), []),
  };
}
