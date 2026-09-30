import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { moved, MoveButtons } from '../../src/components/Reorder';

describe('moved', () => {
  it('moves an entry up and down without changing the original list', () => {
    const list = ['a', 'b', 'c', 'd'];
    expect(moved(list, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moved(list, 0, 3)).toEqual(['b', 'c', 'd', 'a']);
    expect(list).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('MoveButtons', () => {
  it('moves the row one step each way', async () => {
    const onMove = vi.fn();
    render(<MoveButtons label="Pils" index={1} count={3} onMove={onMove} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move Pils up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move Pils down' }));
    expect(onMove.mock.calls).toEqual([[1, 0], [1, 2]]);
  });

  it("can't move the first row up or the last row down", () => {
    const { rerender } = render(<MoveButtons label="Pils" index={0} count={2} onMove={() => {}} />);
    expect(screen.getByRole('button', { name: 'Move Pils up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Pils down' })).toBeEnabled();
    rerender(<MoveButtons label="Pils" index={1} count={2} onMove={() => {}} />);
    expect(screen.getByRole('button', { name: 'Move Pils down' })).toBeDisabled();
  });
});
