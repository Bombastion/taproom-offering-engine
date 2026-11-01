import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { containers, defaultDesignState, designFonts, menu, previewPage, printDesign } from '../fixtures';
import { PrintDesign, setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

// The designer with a design to start from
function designer(design: PrintDesign = printDesign) {
  return mockApi({
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/containers': json(containers),
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
    expect(names).toEqual(['Page', 'Logo and title', 'Section headings', 'Columns', 'Rows', 'Footer']);
    expect(screen.getByRole('button', { name: 'Section headings' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Rows' }));
    expect(screen.getByRole('button', { name: 'Section headings' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Rows' })).toHaveAttribute('aria-expanded', 'true');
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
    expect(screen.getByText(/continues onto more pages, and the preview shows them all/)).toBeInTheDocument();

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
