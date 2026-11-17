import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { containers, defaultDesignState, designFonts, menu, menus, previewResult } from '../fixtures';
import { markAt, shrunkTo } from '../../src/components/design/DesignPreview';

// What the designer's preview shows of the PDF: how its pages came out, and what a click on a page picks.

function designer(result: unknown = previewResult) {
  return mockApi({
    'GET /api/menus': json(menus),
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/containers': json(containers),
    'GET /api/menus/m1/design/print': json(defaultDesignState),
    'POST /api/menus/m1/design/print/preview': json(result),
  });
}

async function open(result: unknown = previewResult) {
  designer(result);
  const view = renderApp('/menus/m1/design/print');
  const pages = await screen.findAllByTestId('print-page');
  return { pages, ...view };
}

const info = (change: Partial<typeof previewResult.info>) => ({ ...previewResult, info: { ...previewResult.info, ...change } });

describe('the preview of the pages', () => {
  it('says how many pages the menu comes to', async () => {
    await open(info({ pages: 3, maxPages: 3 }));
    expect(await screen.findByText('3 pages')).toBeInTheDocument();
  });

  it('says it in the singular for one page', async () => {
    await open({ ...info({ pages: 1 }), pages: [previewResult.pages[0]] });
    expect(await screen.findByText('1 page')).toBeInTheDocument();
  });

  it('says how far the text was shrunk, but only when it was', async () => {
    const { unmount } = await open(info({ scale: 0.78 }));
    expect(await screen.findByText('2 pages · text shrunk to 78%')).toBeInTheDocument();
    unmount();
    await open();
    expect(await screen.findByText('2 pages')).toBeInTheDocument();
    expect(screen.queryByText(/shrunk/)).not.toBeInTheDocument();
  });

  it('warns when the menu does not fit even when shrunk as far as it goes', async () => {
    await open(info({ pages: 3, scale: 0.19, fits: false }));
    expect(await screen.findByText(/Even with the text shrunk as far as it goes, the menu runs to 3 pages, and 2 are allowed/)).toBeInTheDocument();
  });

  it('warns when sizes that are kept make the menu longer than the pages allowed', async () => {
    await open(info({ pages: 3, fit: 'none', fits: false, maxPages: 1 }));
    expect(await screen.findByText(/At these sizes the menu runs to 3 pages, and 1 is allowed/)).toBeInTheDocument();
  });

  it('does not warn when the menu fits', async () => {
    await open();
    await screen.findByText('2 pages');
    expect(screen.queryByText(/runs to/)).not.toBeInTheDocument();
  });

  it('says how much text was shrunk to, in whole percents', () => {
    expect(shrunkTo({ ...previewResult.info, fit: 'shrink-to-pages', scale: 1 })).toBeNull();
    expect(shrunkTo({ ...previewResult.info, fit: 'shrink-to-pages', scale: 0.784 })).toBe(78);
    // So close to full size that it reads as 100%
    expect(shrunkTo({ ...previewResult.info, fit: 'shrink-to-pages', scale: 0.999 })).toBeNull();
  });
});

describe('finding the part of the menu a point is on', () => {
  const marks = [
    { page: 1, pick: 'page', x: 0, y: 0, width: 1, height: 1 },
    { page: 1, pick: 'column:item', x: 0.1, y: 0.2, width: 0.5, height: 0.2 },
    // A thin line over the item column's row
    { page: 1, pick: 'rows', x: 0.1, y: 0.39, width: 0.5, height: 0.01 },
    { page: 2, pick: 'footer', x: 0.1, y: 0.9, width: 0.8, height: 0.05 },
  ];

  it('is the smallest part that holds the point', () => {
    expect(markAt(marks, 1, 0.3, 0.3)?.pick).toBe('column:item');
    expect(markAt(marks, 1, 0.3, 0.395)?.pick).toBe('rows');
    expect(markAt(marks, 1, 0.9, 0.9)?.pick).toBe('page');
  });

  it('only looks at the page the point is on', () => {
    expect(markAt(marks, 2, 0.3, 0.92)?.pick).toBe('footer');
    expect(markAt(marks, 1, 0.3, 0.92)?.pick).toBe('page');
    expect(markAt(marks, 3, 0.3, 0.92)).toBeNull();
  });

  it('is the one drawn last when two are the same size', () => {
    const same = [
      { page: 1, pick: 'first', x: 0, y: 0, width: 0.5, height: 0.5 },
      { page: 1, pick: 'second', x: 0, y: 0, width: 0.5, height: 0.5 },
    ];
    expect(markAt(same, 1, 0.1, 0.1)?.pick).toBe('second');
  });
});

describe('clicking the menu in the preview', () => {
  const expanded = (name: string | RegExp) => screen.getByRole('button', { name }).getAttribute('aria-expanded');

  // Pages have no size in jsdom, so give each the size of a 100x200 box at the origin
  function lay(page: HTMLElement) {
    page.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 200, width: 100, height: 200, x: 0, y: 0, toJSON: () => ({}) });
  }
  // Clicks a point of a page given as fractions of it
  function click(page: HTMLElement, x: number, y: number) {
    lay(page);
    fireEvent.click(page, { clientX: x * 100, clientY: y * 200 });
  }

  it('opens the controls for the part that was clicked', async () => {
    const { pages } = await open();
    expect(expanded('Section headings')).toBe('true');

    click(pages[1], 0.5, 0.92);
    await waitFor(() => expect(expanded('Footer')).toBe('true'));
    expect(expanded('Section headings')).toBe('false');
    expect(screen.getByRole('switch', { name: /footer/i })).toBeInTheDocument();

    // Nothing in particular: the page itself
    click(pages[0], 0.95, 0.95);
    await waitFor(() => expect(expanded('Page')).toBe('true'));
    click(pages[0], 0.5, 0.12);
    await waitFor(() => expect(expanded('Section headings')).toBe('true'));
  });

  it('opens the column that was clicked, in the columns', async () => {
    const { pages } = await open();
    click(pages[0], 0.75, 0.25);
    await waitFor(() => expect(expanded('Columns')).toBe('true'));
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
    expect(expanded(/^Item details/)).toBe('false');

    click(pages[0], 0.3, 0.25);
    await waitFor(() => expect(expanded(/^Item details/)).toBe('true'));
  });

  it('opens a column again when it is clicked after being closed', async () => {
    const { pages, user } = await open();
    click(pages[0], 0.75, 0.25);
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
    await user.click(screen.getByRole('button', { name: /^Prices/ }));
    expect(expanded(/^Prices/)).toBe('false');
    click(pages[0], 0.75, 0.25);
    await waitFor(() => expect(expanded(/^Prices/)).toBe('true'));
  });

  it('ignores a column that is not there', async () => {
    const { pages } = await open({ ...previewResult, marks: [...previewResult.marks, { page: 1, pick: 'column:nothing', x: 0.1, y: 0.5, width: 0.5, height: 0.1 }] });
    click(pages[0], 0.3, 0.55);
    await waitFor(() => expect(expanded('Columns')).toBe('true'));
    expect(screen.queryByRole('button', { name: /^Prices/, expanded: true })).not.toBeInTheDocument();
  });

  it('shows what a click would pick while the pointer is over it', async () => {
    const { pages } = await open();
    lay(pages[0]);
    fireEvent.mouseMove(pages[0], { clientX: 75, clientY: 50 });
    const outline = await within(pages[0]).findByTestId('print-page-hover');
    expect(outline).toHaveStyle({ left: '65%', top: '20%', width: '25%', height: '10%' });
    // Nothing is outlined when it would pick the page as a whole, or once the pointer leaves
    fireEvent.mouseMove(pages[0], { clientX: 98, clientY: 198 });
    await waitFor(() => expect(within(pages[0]).queryByTestId('print-page-hover')).not.toBeInTheDocument());
    fireEvent.mouseMove(pages[0], { clientX: 75, clientY: 50 });
    await within(pages[0]).findByTestId('print-page-hover');
    fireEvent.mouseLeave(pages[0]);
    await waitFor(() => expect(within(pages[0]).queryByTestId('print-page-hover')).not.toBeInTheDocument());
  });
});
