import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { containers, defaultDesignState, designFonts, menu, menus, previewPage } from '../fixtures';

// What the menu page says back to the designer (print/previewScript.ts): how its pages came out,
// and which part of it was clicked.

function designer() {
  return mockApi({
    'GET /api/menus': json(menus),
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/containers': json(containers),
    'GET /api/menus/m1/design/print': json(defaultDesignState),
    'POST /api/menus/m1/design/print/preview': { text: previewPage },
  });
}

async function open() {
  designer();
  const view = renderApp('/menus/m1/design/print');
  const frame = (await screen.findByTitle('Print menu preview')) as HTMLIFrameElement;
  return { frame, ...view };
}

const info = { type: 'toe-preview-info', pages: 2, maxPages: 2, fontPx: 16, normalPx: 16, fit: 'shrink-to-pages', fits: true, heightPx: 2112 };

function say(frame: HTMLIFrameElement, data: unknown, source: unknown = frame.contentWindow) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source: source as Window }));
  });
}

describe('the frame the preview is drawn in', () => {
  it('is given the page once when it arrives, and not again each time it loads what it was given', async () => {
    const { frame } = await open();
    await waitFor(() => expect(screen.getByText('Preview is up to date')).toBeInTheDocument());
    const send = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'toe-preview', html: previewPage });
    // Writing the page into the frame loads it again, which must not send it again
    fireEvent.load(frame);
    fireEvent.load(frame);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('the preview of the pages', () => {
  it('says how many pages the menu comes to, and sizes the frame to all of them', async () => {
    const { frame } = await open();
    expect(screen.queryByText(/pages?$/)).not.toBeInTheDocument();
    say(frame, { ...info, pages: 3, maxPages: 3, heightPx: 3168 });
    expect(await screen.findByText('3 pages')).toBeInTheDocument();
    expect(frame).toHaveAttribute('height', '3168');
    say(frame, { ...info, pages: 1, heightPx: 1056 });
    expect(await screen.findByText('1 page')).toBeInTheDocument();
    expect(frame).toHaveAttribute('height', '1056');
  });

  it('says how far the text was shrunk, but only when it was', async () => {
    const { frame } = await open();
    say(frame, { ...info, fontPx: 12.5 });
    expect(await screen.findByText('2 pages · text shrunk to 78%')).toBeInTheDocument();
    say(frame, info);
    expect(await screen.findByText('2 pages')).toBeInTheDocument();
  });

  it('warns when the menu does not fit even when shrunk as far as it goes', async () => {
    const { frame } = await open();
    expect(screen.queryByText(/runs to/)).not.toBeInTheDocument();
    say(frame, { ...info, pages: 3, fontPx: 3, fits: false, heightPx: 3168 });
    expect(await screen.findByText(/Even with the text shrunk as far as it goes, the menu runs to 3 pages, and 2 are allowed/)).toBeInTheDocument();
    say(frame, info);
    await waitFor(() => expect(screen.queryByText(/runs to/)).not.toBeInTheDocument());
  });

  it('warns when sizes that are kept make the menu longer than the pages allowed', async () => {
    const { frame } = await open();
    say(frame, { ...info, pages: 3, fit: 'none', fits: false, maxPages: 1, heightPx: 3168 });
    expect(await screen.findByText(/At these sizes the menu runs to 3 pages, and 1 is allowed/)).toBeInTheDocument();
  });

  it('ignores anything that does not come from the preview frame or is not what it says', async () => {
    const { frame } = await open();
    say(frame, { ...info, pages: 5 }, window);
    say(frame, { ...info, pages: -1 });
    say(frame, { ...info, fits: 'yes' });
    say(frame, 'pages: 7');
    say(frame, null);
    expect(screen.queryByText(/pages?$/)).not.toBeInTheDocument();
  });
});

describe('clicking the menu in the preview', () => {
  const pick = (frame: HTMLIFrameElement, target: unknown) => say(frame, { type: 'toe-preview-pick', pick: target });
  const expanded = (name: string | RegExp) => screen.getByRole('button', { name }).getAttribute('aria-expanded');

  it('opens the controls for the part that was clicked', async () => {
    const { frame } = await open();
    expect(expanded('Section headings')).toBe('true');

    pick(frame, 'footer');
    await waitFor(() => expect(expanded('Footer')).toBe('true'));
    expect(expanded('Section headings')).toBe('false');
    expect(screen.getByRole('switch', { name: /footer/i })).toBeInTheDocument();

    pick(frame, 'page');
    await waitFor(() => expect(expanded('Page')).toBe('true'));
    pick(frame, 'header');
    await waitFor(() => expect(expanded('Logo and title')).toBe('true'));
    pick(frame, 'rows');
    await waitFor(() => expect(expanded('Rows')).toBe('true'));
    pick(frame, 'headings');
    await waitFor(() => expect(expanded('Section headings')).toBe('true'));
  });

  it('opens the column that was clicked, in the columns', async () => {
    const { frame } = await open();
    pick(frame, 'column:prices');
    await waitFor(() => expect(expanded('Columns')).toBe('true'));
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
    expect(expanded(/^Item details/)).toBe('false');

    pick(frame, 'column:item');
    await waitFor(() => expect(expanded(/^Item details/)).toBe('true'));
  });

  it('opens a column again when it is clicked after being closed', async () => {
    const { frame, user } = await open();
    pick(frame, 'column:prices');
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
    await user.click(screen.getByRole('button', { name: /^Prices/ }));
    expect(expanded(/^Prices/)).toBe('false');
    pick(frame, 'column:prices');
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
  });

  it('does not reopen the column when the columns are closed and opened again', async () => {
    const { frame, user } = await open();
    pick(frame, 'column:prices');
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    expect(expanded(/^Prices/)).toBe('false');
  });

  it('ignores a column that is not there, something unknown, and anything from elsewhere', async () => {
    const { frame } = await open();
    pick(frame, 'column:nothing');
    await waitFor(() => expect(expanded('Columns')).toBe('true'));
    expect(screen.queryByRole('button', { name: /^Prices/, expanded: true })).not.toBeInTheDocument();
    pick(frame, 'somewhere-else');
    pick(frame, 7);
    say(frame, { type: 'toe-preview-pick', pick: 'footer' }, window);
    expect(expanded('Columns')).toBe('true');
    expect(expanded('Footer')).toBe('false');
  });
});
