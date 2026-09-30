import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { imageFileToPngBase64, LogoEditor } from '../../src/components/LogoEditor';
import { LoadError, Loading } from '../../src/components/QueryState';

describe('imageFileToPngBase64', () => {
  it('rejects files that are not images', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(imageFileToPngBase64(file)).rejects.toThrow('Choose an image file');
  });

  it('rejects images over 20 MB', async () => {
    const file = new File(['x'], 'huge.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024 });
    await expect(imageFileToPngBase64(file)).rejects.toThrow('over 20 MB');
  });
});

describe('LogoEditor', () => {
  const props = { label: 'Menu logo', hint: 'Shown on the menu board', onUpload: vi.fn(), onRemove: vi.fn() };

  it('offers an upload when there is no logo', () => {
    render(<LogoEditor {...props} logo={null} />);
    expect(screen.getByText('No logo yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('shows the current logo with replace and remove', () => {
    render(<LogoEditor {...props} logo="data:image/png;base64,abc" />);
    expect(screen.getByRole('img', { name: 'Menu logo' })).toHaveAttribute('src', 'data:image/png;base64,abc');
    expect(screen.getByText('Shown on the menu board')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('asks before removing the logo', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<LogoEditor {...props} onRemove={onRemove} logo="data:image/png;base64,abc" removeWarning="The board will have no logo." />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('dialog', { name: 'Remove logo?' })).toHaveTextContent('The board will have no logo.');
    expect(onRemove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove logo' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains why a picked file was refused, without uploading', async () => {
    const onUpload = vi.fn();
    const { container } = render(<LogoEditor {...props} onUpload={onUpload} logo={null} />);
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
    await userEvent.upload(input, new File(['hi'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose an image file');
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe('QueryState', () => {
  it('shows a loading status', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('shows the error with a retry button', async () => {
    const onRetry = vi.fn();
    render(<LoadError error={new Error('Server down')} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Server down');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
