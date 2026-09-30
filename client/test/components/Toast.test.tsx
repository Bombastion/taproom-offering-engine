import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from '../../src/components/Toast';

function Trigger({ message, tone }: { message: string; tone?: 'success' | 'error' }) {
  const toast = useToast();
  return <button type="button" onClick={() => toast(message, tone)}>show {message}</button>;
}

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const renderToasts = () =>
    render(
      <ToastProvider>
        <Trigger message="Saved" />
        <Trigger message="Failed" tone="error" />
      </ToastProvider>,
    );

  it('announces a success message and hides it after a few seconds', () => {
    renderToasts();
    act(() => screen.getByText('show Saved').click());
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => vi.advanceTimersByTime(2700));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps errors up longer', () => {
    renderToasts();
    act(() => screen.getByText('show Failed').click());
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole('status')).toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('replaces the current toast and restarts its timer', () => {
    renderToasts();
    act(() => screen.getByText('show Failed').click());
    act(() => vi.advanceTimersByTime(4000));
    act(() => screen.getByText('show Saved').click());
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('status')).not.toHaveTextContent('Failed');
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
