import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmSheet, NameSheet, Sheet } from '../../src/components/Sheet';

describe('Sheet', () => {
  it('is a labelled modal dialog that focuses its first field', () => {
    render(
      <Sheet title="Rename" onClose={() => {}}>
        <input aria-label="Name" />
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Rename' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Name')).toHaveFocus();
  });

  it('closes on Escape and from the close button', async () => {
    const onClose = vi.fn();
    render(<Sheet title="Rename" onClose={onClose}><p>Body</p></Sheet>);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[1]);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab focus inside the sheet', async () => {
    render(
      <>
        <button type="button">Outside</button>
        <Sheet title="Rename" onClose={() => {}}>
          <input aria-label="Name" />
          <button type="button">Save</button>
        </Sheet>
      </>,
    );
    // Focus starts on the field
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    // Past the last control, focus wraps to the first (the close button) instead of leaving
    await userEvent.tab();
    expect(screen.getAllByRole('button', { name: 'Close' })[1]).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Outside' })).not.toHaveFocus();
  });
});

describe('NameSheet', () => {
  it('submits the trimmed name', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NameSheet title="New menu" label="Menu name" submitLabel="Create menu" onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Menu name'), '  Patio  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create menu' }));
    expect(onSubmit).toHaveBeenCalledWith('Patio');
  });

  it('refuses an empty name', async () => {
    const onSubmit = vi.fn();
    render(<NameSheet title="New menu" label="Menu name" submitLabel="Create menu" onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Menu name'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Create menu' }));
    expect(screen.getByRole('alert')).toHaveTextContent("Menu name can't be empty.");
    expect(screen.getByLabelText('Menu name')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('starts from the current name when renaming', () => {
    render(<NameSheet title="Rename" label="Menu name" initialValue="On Tap" submitLabel="Save" onClose={() => {}} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('Menu name')).toHaveValue('On Tap');
  });

  it('shows a failed save and lets you try again', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Server says no')).mockResolvedValueOnce(undefined);
    render(<NameSheet title="New menu" label="Menu name" submitLabel="Create menu" onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Menu name'), 'Patio');
    await userEvent.click(screen.getByRole('button', { name: 'Create menu' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server says no');
    const button = screen.getByRole('button', { name: 'Create menu' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('disables the button while saving', async () => {
    let finish!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(<NameSheet title="New menu" label="Menu name" submitLabel="Create menu" onClose={() => {}} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Menu name'), 'Patio');
    await userEvent.click(screen.getByRole('button', { name: 'Create menu' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    finish();
  });
});

describe('ConfirmSheet', () => {
  it('focuses Cancel first, so a stray Enter does nothing destructive', () => {
    render(<ConfirmSheet title="Delete?" message="Gone for good" confirmLabel="Delete" onClose={() => {}} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByText('Gone for good')).toBeInTheDocument();
  });

  it('confirms and cancels', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<ConfirmSheet title="Delete?" message="x" confirmLabel="Delete" onClose={onClose} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a failure', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Nope'));
    render(<ConfirmSheet title="Delete?" message="x" confirmLabel="Delete" onClose={() => {}} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });
});
