import { useEffect } from 'react';
import { useBlocker } from 'react-router';

// What both design pages do to keep edits from being lost or fumbled.

// Changes that haven't been saved are not thrown away by leaving the page without asking: blocks
// navigating away within the app (the returned blocker says when it has), and closing the tab
export function useLeaveWarning(dirty: boolean, saving: boolean) {
  const leaving = useBlocker(dirty && !saving);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return leaving;
}

// Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z (or Ctrl+Y), except in a box where they mean undoing typing
export function useUndoKeys(undo: () => void, redo: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches?.('textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=range])')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) undo();
      else if ((key === 'z' && event.shiftKey) || key === 'y') redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
}
