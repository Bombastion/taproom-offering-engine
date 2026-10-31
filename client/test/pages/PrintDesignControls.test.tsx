import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { defaultDesignState, designFonts, menu, previewPage, printDesign } from '../fixtures';
import { PrintDesign, setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

// The designer with a design to start from
function designer(design: PrintDesign = printDesign) {
  return mockApi({
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/menus/m1/design/print': json({ ...defaultDesignState, design }),
    'POST /api/menus/m1/design/print/preview': { text: previewPage },
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/print/preview');
const lastDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: PrintDesign }).design;

async function open(group?: string, design?: PrintDesign) {
  const server = designer(design);
  const view = renderApp('/menus/m1/design/print');
  await screen.findByTitle('Print menu preview');
  if (group) await view.user.click(screen.getByRole('button', { name: group }));
  return { server, ...view };
}

async function typeInto(user: Awaited<ReturnType<typeof open>>['user'], label: string, value: string, scope: { getByLabelText: typeof screen.getByLabelText } = screen) {
  const box = scope.getByLabelText(label);
  await user.clear(box);
  await user.type(box, value);
}

describe('the print designer’s groups', () => {
  it('has one for each part of the menu, opening one at a time', async () => {
    const { user } = await open();
    const names = [...document.querySelectorAll('.design-group-title button')].map((b) => b.textContent);
    expect(names).toEqual(['Page', 'Logo and title', 'Section headings', 'Item text', 'Prices', 'Footer']);
    expect(screen.getByRole('button', { name: 'Section headings' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Prices' }));
    expect(screen.getByRole('button', { name: 'Section headings' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Prices' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('Page', () => {
  it('sets the margins', async () => {
    const { server, user } = await open('Page');
    expect(screen.getByLabelText('Top margin')).toHaveValue(0.5);
    expect(screen.getByLabelText('Left margin')).toHaveValue(0.3);
    await typeInto(user, 'Top margin', '0.75');
    await typeInto(user, 'Left margin', '1');
    await waitFor(() => expect(lastDesign(server).page.marginsIn).toEqual({ top: 0.75, right: 0.3, bottom: 0.75, left: 1 }));
  });

  it('refuses margins the server would', async () => {
    const { user } = await open('Page');
    await typeInto(user, 'Top margin', '3');
    expect(screen.getByLabelText('Top margin')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use 0 to 2')).toBeInTheDocument();
  });

  it('shrinks to a number of pages, whole ones only', async () => {
    const { server, user } = await open('Page');
    expect(screen.getByRole('radio', { name: 'Shrink to fit' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Fit within')).toHaveValue(2);

    await typeInto(user, 'Fit within', '1.5');
    expect(screen.getByLabelText('Fit within')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use a whole number, 1 to 20')).toBeInTheDocument();

    await typeInto(user, 'Fit within', '3');
    await waitFor(() => expect(lastDesign(server).page).toMatchObject({ fit: 'shrink-to-pages', maxPages: 3 }));
  });

  it('can keep the sizes as they are, and go back to shrinking with the pages it had', async () => {
    const { server, user } = await open('Page');
    await user.click(screen.getByRole('radio', { name: 'Keep sizes' }));
    await waitFor(() => expect(lastDesign(server).page).toMatchObject({ fit: 'none', maxPages: 2 }));
    expect(screen.queryByLabelText('Fit within')).not.toBeInTheDocument();
    expect(screen.getByText(/continues onto more pages than the preview shows/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Shrink to fit' }));
    await waitFor(() => expect(lastDesign(server).page).toMatchObject({ fit: 'shrink-to-pages', maxPages: 2 }));
    expect(screen.getByLabelText('Fit within')).toHaveValue(2);
  });

  it('treats shrinking with no page limit as not shrinking, and gives it a limit when shrinking is chosen', async () => {
    const noLimit = setIn(setIn(printDesign, ['page', 'maxPages'], null), ['page', 'fit'], 'shrink-to-pages');
    const { server, user } = await open('Page', noLimit);
    expect(screen.getByRole('radio', { name: 'Keep sizes' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Shrink to fit' }));
    await waitFor(() => expect(lastDesign(server).page).toMatchObject({ fit: 'shrink-to-pages', maxPages: 2 }));
  });

  it('sets the page color', async () => {
    const { server } = await open('Page');
    fireEvent.change(screen.getByLabelText('Pick page color'), { target: { value: '#fff8e7' } });
    await waitFor(() => expect(lastDesign(server).page.background).toBe('#fff8e7'));
  });
});

describe('Logo and title', () => {
  it('sets how the logo looks, and hides its controls when it is off', async () => {
    const { server, user } = await open('Logo and title');
    await typeInto(user, 'Largest width', '20');
    await typeInto(user, 'Space below the logo', '1.5');
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await waitFor(() => expect(lastDesign(server).header.logo).toEqual({ show: true, maxWidthPct: 20, align: 'left', spaceBelowRem: 1.5 }));

    await user.click(screen.getByRole('switch', { name: 'Show the logo' }));
    expect(screen.queryByLabelText('Largest width')).not.toBeInTheDocument();
    await waitFor(() => expect(lastDesign(server).header.logo.show).toBe(false));
    // What was set is kept for turning it back on
    expect(lastDesign(server).header.logo.maxWidthPct).toBe(20);
  });

  it('adds a title, with the words and the look of it', async () => {
    const { server, user } = await open('Logo and title');
    expect(screen.getByRole('switch', { name: 'Show a title' })).not.toBeChecked();
    expect(screen.queryByLabelText('Title text')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show a title' }));
    expect(screen.getByLabelText('Title text')).toHaveValue('{menu.name}');
    expect(screen.getByText('{menu.name} and {date} are filled in.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Title text'));
    await user.type(screen.getByLabelText('Title text'), 'On tap {{date}');
    const style = within(screen.getByRole('group', { name: 'Title style' }));
    await typeInto(user, 'Size', '30', style);
    await user.selectOptions(style.getByRole('combobox', { name: 'Font' }), 'bebas-neue');

    await waitFor(() => expect(lastDesign(server).header.title).toMatchObject({ show: true, text: 'On tap {date}', style: { sizePt: 30, font: 'bebas-neue', weight: 400 } }));
  });
});

describe('Section headings', () => {
  it('sets their width, spacing, padding and corners', async () => {
    const { server, user } = await open();
    await typeInto(user, 'Section width', '80');
    await typeInto(user, 'Space above', '1');
    await typeInto(user, 'Top padding', '0.25');
    await typeInto(user, 'Left padding', '2');
    await typeInto(user, 'Rounded corners', '12');
    await waitFor(() => expect(lastDesign(server).sections).toMatchObject({ widthPct: 80, gapAboveRem: 1 }));
    expect(lastDesign(server).sections.heading.box).toMatchObject({ paddingRem: { top: 0.25, right: 0.625, bottom: 0.625, left: 2 }, radiusPx: 12 });
  });

  it('keeps the width within what the server takes', async () => {
    const { user } = await open();
    await typeInto(user, 'Section width', '10');
    expect(screen.getByText('Use 30 to 100')).toBeInTheDocument();
  });
});

describe('Item text', () => {
  it('styles the main line, and says what is on it', async () => {
    const { server, user } = await open('Item text');
    expect(screen.getByText('Prints: brewery, name, style, ABV. Styled separately: name.')).toBeInTheDocument();
    const main = within(screen.getByRole('group', { name: 'Main line' }));
    expect(main.getByRole('combobox', { name: 'Font' })).toHaveValue('system-serif');

    await user.selectOptions(main.getByRole('combobox', { name: 'Font' }), 'fira-sans');
    await typeInto(user, 'Size', '10', main);
    await waitFor(() => expect(lastDesign(server).columns[0]).toMatchObject({ lines: [{ style: { font: 'fira-sans', sizePt: 10 } }] }));
    // The line below, and the name's own style, are as they were
    const column = lastDesign(server).columns[0] as unknown as { belowLines: unknown[]; lines: { parts: unknown[] }[] };
    const original = printDesign.columns[0] as unknown as { belowLines: unknown[]; lines: { parts: unknown[] }[] };
    expect(column.belowLines).toEqual(original.belowLines);
    expect(column.lines[0].parts).toEqual(original.lines[0].parts);
  });

  it('styles the line below on its own', async () => {
    const { server, user } = await open('Item text');
    await user.click(screen.getByRole('radio', { name: 'Line below' }));
    expect(screen.getByText('Prints: description.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Main line' })).not.toBeInTheDocument();

    const below = within(screen.getByRole('group', { name: 'Line below' }));
    await user.click(below.getByRole('checkbox', { name: 'Italic' }));
    await waitFor(() => expect(lastDesign(server).columns[0]).toMatchObject({ belowLines: [{ style: { italic: true } }], lines: [{ style: { italic: false } }] }));
  });

  it('says so when there is no text to style', async () => {
    await open('Item text', setIn(printDesign, ['columns'], [printDesign.columns[1]]));
    expect(screen.getByText('This design has no item text to style.')).toBeInTheDocument();
  });

  it('finds the text wherever its column is', async () => {
    const reordered = setIn(printDesign, ['columns'], [printDesign.columns[1], printDesign.columns[0]]);
    const { server, user } = await open('Item text', reordered);
    await typeInto(user, 'Size', '9', within(screen.getByRole('group', { name: 'Main line' })));
    await waitFor(() => expect((lastDesign(server).columns[1] as { lines: { style: { sizePt: number } }[] }).lines[0].style.sizePt).toBe(9));
    expect(lastDesign(server).columns[0]).toEqual(printDesign.columns[1]);
  });
});

describe('Prices', () => {
  it('styles the prices and the size names separately', async () => {
    const { server, user } = await open('Prices');
    expect(screen.getByRole('switch', { name: 'Show pour size names above the prices' })).toBeChecked();
    const prices = within(screen.getByRole('group', { name: 'Prices' }));
    await typeInto(user, 'Size', '14', prices);
    await waitFor(() => expect(lastDesign(server).columns[1]).toMatchObject({ cell: { style: { sizePt: 14 } }, heading: { style: { sizePt: 12 } } }));

    await user.click(screen.getByRole('radio', { name: 'Size names' }));
    await user.click(within(screen.getByRole('group', { name: 'Size names' })).getByRole('radio', { name: 'Left' }));
    await waitFor(() => expect(lastDesign(server).columns[1]).toMatchObject({ heading: { style: { align: 'left' } }, cell: { style: { align: 'center' } } }));
  });

  it('can drop the size names, which takes away their style', async () => {
    const { server, user } = await open('Prices');
    await user.click(screen.getByRole('switch', { name: 'Show pour size names above the prices' }));
    await waitFor(() => expect(lastDesign(server).columns[1]).toMatchObject({ heading: { show: false } }));
    expect(screen.queryByRole('radio', { name: 'Size names' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Prices' })).toBeInTheDocument();
  });

  it('says so when there are no prices', async () => {
    await open('Prices', setIn(printDesign, ['columns'], [printDesign.columns[0]]));
    expect(screen.getByText('This design has no prices to style.')).toBeInTheDocument();
  });
});

describe('Footer', () => {
  it('sets where it sits and how thick its line is', async () => {
    const withFooter = setIn(printDesign, ['footer', 'show'], true);
    const { server, user } = await open('Footer', withFooter);
    await typeInto(user, 'Distance from the bottom edge', '0.5');
    await typeInto(user, 'Line thickness', '2');
    await waitFor(() => expect(lastDesign(server).footer).toMatchObject({ bottomIn: 0.5, rule: { widthPx: 2, show: true } }));
  });
});

describe('spacing in a text style', () => {
  it('is tucked away until it is wanted', async () => {
    const { server, user } = await open();
    const details = screen.getByText('Spacing').closest('details')!;
    expect(details).not.toHaveAttribute('open');

    await user.click(screen.getByText('Spacing'));
    expect(details).toHaveAttribute('open');
    await typeInto(user, 'Letter spacing', '0.1');
    await waitFor(() => expect(lastDesign(server).sections.heading.style.letterSpacingEm).toBe(0.1));
  });

  it('sets the line height, or leaves it normal', async () => {
    const { server, user } = await open();
    await user.click(screen.getByText('Spacing'));
    expect(screen.queryByLabelText('Line height')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Set the line height' }));
    expect(screen.getByLabelText('Line height')).toHaveValue(1.2);
    await waitFor(() => expect(lastDesign(server).sections.heading.style.lineHeight).toBe(1.2));

    await typeInto(user, 'Line height', '1.5');
    await waitFor(() => expect(lastDesign(server).sections.heading.style.lineHeight).toBe(1.5));

    await user.click(screen.getByRole('checkbox', { name: 'Set the line height' }));
    await waitFor(() => expect(lastDesign(server).sections.heading.style.lineHeight).toBeNull());
  });

  it('is shown open when the text already has some', async () => {
    await open('Footer', setIn(setIn(printDesign, ['footer', 'show'], true), ['footer', 'style', 'letterSpacingEm'], 0.05));
    expect(screen.getByText('Spacing').closest('details')).toHaveAttribute('open');
    expect(screen.getByLabelText('Letter spacing')).toHaveValue(0.05);
  });

  it('does not accept spacing the server would not', async () => {
    const { user } = await open();
    await user.click(screen.getByText('Spacing'));
    await typeInto(user, 'Letter spacing', '2');
    expect(screen.getByText('Use -0.2 to 1')).toBeInTheDocument();
  });
});
