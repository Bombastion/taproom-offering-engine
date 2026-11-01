import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { RUN_MS, useDesignHistory } from '../src/useDesignHistory';
import { setIn } from '../src/design';
import { printDesign } from './fixtures';

const sizeAt = (design: typeof printDesign | undefined) => design!.sections.heading.style.sizePt;
const SIZE = ['sections', 'heading', 'style', 'sizePt'];

function setup(base = printDesign) {
  return renderHook(({ base }) => useDesignHistory(base), { initialProps: { base } });
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-01T12:00:00Z') }));
afterEach(() => vi.useRealTimers());

const later = (ms: number) => vi.setSystemTime(Date.now() + ms);

describe('useDesignHistory', () => {
  it('is the saved design until something changes, and then not clean', () => {
    const { result } = setup();
    expect(result.current.design).toBe(printDesign);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
    act(() => result.current.change(SIZE, 30));
    expect(sizeAt(result.current.design)).toBe(30);
    expect(result.current.dirty).toBe(true);
  });

  it('is not a step to set what is already there', () => {
    const { result } = setup();
    act(() => result.current.change(SIZE, 18));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.dirty).toBe(false);
  });

  it('undoes and redoes, and a new change forgets what could be redone', () => {
    const { result } = setup();
    act(() => result.current.change(SIZE, 30));
    later(RUN_MS * 2);
    act(() => result.current.change(SIZE, 40));
    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(30);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(18);
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    act(() => result.current.redo());
    expect(sizeAt(result.current.design)).toBe(40);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    later(RUN_MS * 2);
    act(() => result.current.change(SIZE, 50));
    expect(result.current.canRedo).toBe(false);
  });

  it('takes a quick run of changes to one setting as one step', () => {
    const { result } = setup();
    for (const size of [3, 30, 31, 32]) {
      act(() => result.current.change(SIZE, size));
      later(RUN_MS / 4);
    }
    expect(sizeAt(result.current.design)).toBe(32);
    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(18);
    expect(result.current.canUndo).toBe(false);
  });

  it('starts a new step after a pause, or for another setting', () => {
    const { result } = setup();
    act(() => result.current.change(SIZE, 30));
    later(RUN_MS + 1);
    act(() => result.current.change(SIZE, 31));
    act(() => result.current.change(['footer', 'bottomIn'], 0.5));
    act(() => result.current.undo());
    expect(result.current.design!.footer.bottomIn).toBe(0.3);
    expect(sizeAt(result.current.design)).toBe(31);
    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(30);
    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(18);
  });

  it('makes each switch and each list change a step of its own', () => {
    const { result } = setup();
    act(() => result.current.change(['footer', 'show'], true));
    act(() => result.current.change(['footer', 'show'], false));
    act(() => result.current.change(['columns'], [...printDesign.columns].reverse()));
    act(() => result.current.change(['columns'], printDesign.columns));
    for (let n = 0; n < 4; n += 1) act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.design).toEqual(printDesign);
  });

  it('can go back to what is saved, and that can be undone too', () => {
    const { result } = setup();
    act(() => result.current.change(SIZE, 30));
    act(() => result.current.revert());
    expect(result.current.design).toBe(printDesign);
    expect(result.current.dirty).toBe(false);
    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(30);
    expect(result.current.dirty).toBe(true);
  });

  it('takes a whole design in one step (a preset)', () => {
    const { result } = setup();
    const other = setIn(printDesign, ['page', 'background'], '#fff8e7');
    act(() => result.current.replace(other));
    expect(result.current.design).toBe(other);
    act(() => result.current.undo());
    expect(result.current.design).toBe(printDesign);
  });

  it('keeps its steps through a save, and what is saved becomes the base', () => {
    const { result, rerender } = setup();
    act(() => result.current.change(SIZE, 30));
    const savedDesign = result.current.design!;
    act(() => result.current.markSaved());
    rerender({ base: savedDesign });
    expect(result.current.dirty).toBe(false);
    expect(sizeAt(result.current.design)).toBe(30);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(sizeAt(result.current.design)).toBe(18);
    expect(result.current.dirty).toBe(true);
    act(() => result.current.redo());
    expect(sizeAt(result.current.design)).toBe(30);
    expect(result.current.dirty).toBe(false);
  });

  it('forgets everything when cleared', () => {
    const { result } = setup();
    act(() => result.current.change(SIZE, 30));
    act(() => result.current.clear());
    expect(result.current.design).toBe(printDesign);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('keeps the last hundred steps', () => {
    const { result } = setup();
    for (let n = 1; n <= 120; n += 1) {
      act(() => result.current.change(SIZE, 4 + (n % 80)));
      later(RUN_MS + 1);
    }
    let undone = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      undone += 1;
    }
    expect(undone).toBe(100);
  });

  it('does nothing until the saved design is there', () => {
    const { result } = renderHook(() => useDesignHistory(undefined));
    act(() => result.current.change(SIZE, 30));
    expect(result.current.design).toBeUndefined();
    expect(result.current.canUndo).toBe(false);
  });
});
