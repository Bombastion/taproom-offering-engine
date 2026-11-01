import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { containers, defaultDesignState, designFonts, menu, previewPage, printDesign } from '../fixtures';
import { Column, FieldsColumn, PricesColumn, PrintDesign, setIn, ThumbnailColumn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

const itemColumn = printDesign.columns[0] as FieldsColumn;
const priceColumn = printDesign.columns[1] as PricesColumn;
const withColumns = (columns: Column[]) => setIn(printDesign, ['columns'], columns);
const picture = (id: string, extra: Partial<ThumbnailColumn> = {}): ThumbnailColumn => ({ id, type: 'thumbnail', sizePx: 32, shape: 'circle', source: 'item-then-menu', ...extra });

function designer(design: PrintDesign, extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return mockApi({
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/containers': json(containers),
    'GET /api/menus/m1/design/print': json({ ...defaultDesignState, design }),
    'POST /api/menus/m1/design/print/preview': { text: previewPage },
    ...extra,
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/print/preview');
const lastDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: PrintDesign }).design;
const lastColumns = (server: Mock) => lastDesign(server).columns;
const lastFields = (server: Mock) => lastColumns(server)[0] as FieldsColumn;
const lastPrices = (server: Mock) => lastColumns(server)[1] as PricesColumn;

// Opens the designer on one of its groups, with the design to start from
async function open(design: PrintDesign = printDesign, group = 'Columns', extra?: Record<string, Parameters<typeof mockApi>[0][string]>) {
  const server = designer(design, extra);
  const view = renderApp('/menus/m1/design/print');
  await screen.findByTitle('Print menu preview');
  await view.user.click(screen.getByRole('button', { name: group }));
  return { server, ...view };
}

type User = Awaited<ReturnType<typeof open>>['user'];

async function typeInto(user: User, scope: { getByLabelText: typeof screen.getByLabelText }, label: string, value: string) {
  const box = scope.getByLabelText(label);
  await user.clear(box);
  await user.type(box, value);
}

// The entry of a list with this title (its toggle also reads out what is in it)
const entry = (title: string | RegExp) => screen.getByRole('button', { name: typeof title === 'string' ? new RegExp(`^${title}( |$)`) : title });

describe('the columns list', () => {
  it('lists each column with what is in it', async () => {
    await open();
    expect(entry('Item details')).toHaveTextContent('70% wide, brewery, name, style, ABV; description');
    expect(entry('Prices')).toHaveTextContent('shares the rest, every size');
  });

  it('moves a column, and keeps the others where they were', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Move Item details down' }));
    await waitFor(() => expect(lastColumns(server).map((c) => c.id)).toEqual(['prices', 'item']));
    expect(screen.getByRole('button', { name: 'Move Prices up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Item details down' })).toBeDisabled();
  });

  it('removes a column, but not the last one', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Remove Prices' }));
    await waitFor(() => expect(lastColumns(server).map((c) => c.id)).toEqual(['item']));
    expect(screen.getByRole('button', { name: 'Remove Item details' })).toBeDisabled();
  });

  it('adds item details, prices and pictures, opening each as it is added', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Add prices' }));
    await waitFor(() => expect(lastColumns(server)).toHaveLength(3));
    expect(lastColumns(server)[2]).toMatchObject({ id: 'prices-2', type: 'prices', widthPct: null, sizes: 'all', sizeWidthPct: 25, cell: { format: '${value}' } });
    // The two price columns are told apart by number, and the new one is open
    expect(entry('Prices 1')).toBeInTheDocument();
    expect(entry('Prices 2')).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Add a picture' }));
    await user.click(screen.getByRole('button', { name: 'Add item details' }));
    await waitFor(() => expect(lastColumns(server)).toHaveLength(5));
    expect(lastColumns(server)[3]).toEqual(picture('thumbnail'));
    expect(lastColumns(server)[4]).toMatchObject({ id: 'fields', type: 'fields', widthPct: null, belowLines: [], lines: [{ style: itemColumn.lines[0].style, parts: [{ field: 'displayName' }] }] });
  });

  it('stops at six columns', async () => {
    await open(withColumns([itemColumn, priceColumn, picture('p3'), picture('p4'), picture('p5'), picture('p6')]));
    for (const name of ['Add item details', 'Add prices', 'Add a picture']) expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByText('A row can have at most 6 columns.')).toBeInTheDocument();
  });

  it('warns when a stored design has columns wider than the row', async () => {
    await open(withColumns([{ ...itemColumn, widthPct: 70 }, { ...priceColumn, widthPct: 50 }]));
    expect(screen.getByRole('alert')).toHaveTextContent('Column widths add up to 120%');
  });
});

describe('a column’s width', () => {
  it('can be fixed, within what the other columns leave, or share the rest', async () => {
    const { server, user } = await open();
    await user.click(entry('Prices'));
    const sharing = screen.getByRole('checkbox', { name: 'Use the width the other columns leave' });
    expect(sharing).toBeChecked();
    expect(screen.queryByLabelText('Column width')).not.toBeInTheDocument();

    // The item column has 70%, so this one has 30% to give
    await user.click(sharing);
    expect(screen.getByLabelText('Column width')).toHaveValue(30);
    await waitFor(() => expect(lastPrices(server)).toMatchObject({ widthPct: 30 }));

    await typeInto(user, screen, 'Column width', '40');
    expect(screen.getByText('Use 5 to 30')).toBeInTheDocument();
    await typeInto(user, screen, 'Column width', '20');
    await waitFor(() => expect(lastPrices(server)).toMatchObject({ widthPct: 20 }));

    await user.click(screen.getByRole('checkbox', { name: 'Use the width the other columns leave' }));
    await waitFor(() => expect(lastPrices(server)).toMatchObject({ widthPct: null }));
  });

  it('cannot be given when the other columns use it all', async () => {
    const { user } = await open(withColumns([{ ...itemColumn, widthPct: 100 }, priceColumn]));
    await user.click(entry('Prices'));
    expect(screen.getByRole('checkbox', { name: 'Use the width the other columns leave' })).toBeDisabled();
    expect(screen.getByText(/use all the width, so this one has none to share/)).toBeInTheDocument();
  });
});

describe('item details', () => {
  async function openLine(design: PrintDesign = printDesign) {
    const view = await open(design);
    await view.user.click(entry('Item details'));
    await view.user.click(entry(/^Line 1/));
    return view;
  }

  it('shows the lines, and styles one', async () => {
    const { server, user } = await openLine();
    expect(entry(/^Line below 1/)).toHaveTextContent('description');
    const style = within(screen.getByRole('group', { name: 'Style of line 1' }));
    await user.selectOptions(style.getByRole('combobox', { name: 'Font' }), 'fira-sans');
    await typeInto(user, style, 'Size', '10');
    await waitFor(() => expect(lastFields(server).lines[0].style).toMatchObject({ font: 'fira-sans', sizePt: 10 }));
    // The parts and the line below are as they were
    expect(lastFields(server).lines[0].parts).toEqual(itemColumn.lines[0].parts);
    expect(lastFields(server).belowLines).toEqual(itemColumn.belowLines);
  });

  it('shows each part of the line', async () => {
    await openLine();
    const parts = screen.getAllByRole('group', { name: /^Part \d$/ });
    expect(parts).toHaveLength(4);
    const name = within(parts[1]);
    expect(name.getByRole('combobox', { name: 'Field' })).toHaveValue('displayName');
    expect(name.getByLabelText('Printed before')).toHaveValue(' • ');
    expect(name.getByLabelText('Format')).toHaveValue('{value}');
    expect(within(parts[3]).getByLabelText('Format')).toHaveValue('{value}% ABV');
    expect(within(parts[0]).getByRole('button', { name: 'Move part 1 up' })).toBeDisabled();
  });

  it('changes what a part prints, and how', async () => {
    const { server, user } = await openLine();
    const part = within(screen.getByRole('group', { name: 'Part 3' }));
    await user.selectOptions(part.getByRole('combobox', { name: 'Field' }), 'category');
    await typeInto(user, part, 'Printed before', ' | ');
    await user.clear(part.getByLabelText('Format'));
    await user.type(part.getByLabelText('Format'), '[[{{value}]');
    await waitFor(() => expect(lastFields(server).lines[0].parts[2]).toEqual({ field: 'category', before: ' | ', format: '[{value}]' }));
  });

  it('only takes a format that says where the value goes, and puts the real one back', async () => {
    const { server, user } = await openLine();
    const part = within(screen.getByRole('group', { name: 'Part 3' }));
    const format = part.getByLabelText('Format');
    await user.clear(format);
    await user.type(format, 'no value here');
    expect(format).toHaveAttribute('aria-invalid', 'true');
    expect(part.getByText('Include {value} where the value goes')).toBeInTheDocument();
    await user.tab();
    expect(format).toHaveValue('{value}');
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(previews(server)).toHaveLength(1);
  });

  it('prints fixed text, which has to be something', async () => {
    const { server, user } = await openLine();
    const part = within(screen.getByRole('group', { name: 'Part 3' }));
    await user.selectOptions(part.getByRole('combobox', { name: 'Field' }), 'text');
    expect(part.getByLabelText('Text')).toHaveValue('Text');
    await waitFor(() => expect(lastFields(server).lines[0].parts[2]).toMatchObject({ field: 'text', text: 'Text' }));

    await user.clear(part.getByLabelText('Text'));
    expect(part.getByText('Type the text to print')).toBeInTheDocument();
    await user.type(part.getByLabelText('Text'), 'Cheers');
    await waitFor(() => expect(lastFields(server).lines[0].parts[2].text).toBe('Cheers'));

    // Going back to a field leaves no text behind
    await user.selectOptions(part.getByRole('combobox', { name: 'Field' }), 'style');
    await waitFor(() => expect(lastFields(server).lines[0].parts[2]).toEqual({ field: 'style', before: ' • ', format: '{value}' }));
  });

  it('adds, moves and removes parts', async () => {
    const { server, user } = await openLine();
    await user.click(screen.getByRole('button', { name: 'Add to this line' }));
    // A field the line doesn't print yet, with a separator
    await waitFor(() => expect(lastFields(server).lines[0].parts).toHaveLength(5));
    expect(lastFields(server).lines[0].parts[4]).toEqual({ field: 'breweryLocation', before: ' • ', format: '{value}' });

    await user.click(screen.getByRole('button', { name: 'Move part 5 up' }));
    await waitFor(() => expect(lastFields(server).lines[0].parts.map((p) => p.field)).toEqual(['breweryName', 'displayName', 'style', 'breweryLocation', 'abv']));

    await user.click(screen.getByRole('button', { name: 'Remove part 1' }));
    await waitFor(() => expect(lastFields(server).lines[0].parts.map((p) => p.field)).toEqual(['displayName', 'style', 'breweryLocation', 'abv']));
  });

  it('keeps at least one part on a line, and at most eight', async () => {
    const one = setIn(printDesign, ['columns', 0, 'lines', 0, 'parts'], [itemColumn.lines[0].parts[0]]);
    const { user } = await openLine(one);
    expect(screen.getByRole('button', { name: 'Remove part 1' })).toBeDisabled();
    for (let n = 0; n < 7; n += 1) await user.click(screen.getByRole('button', { name: 'Add to this line' }));
    expect(screen.getAllByRole('group', { name: /^Part \d$/ })).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Add to this line' })).toBeDisabled();
  });

  it('styles a part differently from its line, keeping only what is different', async () => {
    const { server, user } = await openLine();
    const name = within(screen.getByRole('group', { name: 'Part 2' }));
    // The item name is bold on its own
    expect(name.getByRole('checkbox', { name: 'Style this part differently' })).toBeChecked();
    const style = within(screen.getByRole('group', { name: 'Style of part 2' }));
    expect(style.getByRole('combobox', { name: 'Weight' })).toHaveValue('700');
    expect(style.getByLabelText('Size')).toHaveValue(12);

    await user.click(style.getByRole('checkbox', { name: 'Italic' }));
    await waitFor(() => expect(lastFields(server).lines[0].parts[1].style).toEqual({ weight: 700, italic: true }));

    // What the line has, the part follows
    const line = within(screen.getByRole('group', { name: 'Style of line 1' }));
    await typeInto(user, line, 'Size', '9');
    await waitFor(() => expect(lastFields(server).lines[0].style.sizePt).toBe(9));
    expect(lastFields(server).lines[0].parts[1].style).toEqual({ weight: 700, italic: true });
    expect(within(screen.getByRole('group', { name: 'Style of part 2' })).getByLabelText('Size')).toHaveValue(9);

    await user.click(name.getByRole('checkbox', { name: 'Style this part differently' }));
    await waitFor(() => expect(lastFields(server).lines[0].parts[1]).toEqual({ field: 'displayName', before: ' • ', format: '{value}' }));
    expect(screen.queryByRole('group', { name: 'Style of part 2' })).not.toBeInTheDocument();

    await user.click(within(screen.getByRole('group', { name: 'Part 1' })).getByRole('checkbox', { name: 'Style this part differently' }));
    await waitFor(() => expect(lastFields(server).lines[0].parts[0].style).toEqual({}));
  });

  it('adds lines in the style of the others, and removes them', async () => {
    const { server, user } = await open();
    await user.click(entry('Item details'));
    await user.click(screen.getByRole('button', { name: 'Add a line below' }));
    await waitFor(() => expect(lastFields(server).belowLines).toHaveLength(2));
    expect(lastFields(server).belowLines[1]).toEqual({ style: itemColumn.belowLines[0].style, parts: [{ field: 'description', before: '', format: '{value}' }] });
    expect(entry(/^Line below 2/)).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Remove line below 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove line 1' }));
    await waitFor(() => expect(lastFields(server)).toMatchObject({ lines: [], belowLines: [{}] }));
  });

  it('has at most four lines of each kind, and follows an open line when it is moved', async () => {
    const { user } = await open();
    await user.click(entry('Item details'));
    for (let n = 0; n < 3; n += 1) await user.click(screen.getByRole('button', { name: 'Add a line' }));
    expect(screen.getByRole('button', { name: 'Add a line' })).toBeDisabled();
    // The last one added is open; moving it up takes it along
    expect(entry(/^Line 4/)).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Move line 4 up' }));
    expect(entry(/^Line 3/)).toHaveAttribute('aria-expanded', 'true');
    expect(entry(/^Line 4/)).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('prices', () => {
  async function openPrices(design: PrintDesign = printDesign, extra?: Record<string, Parameters<typeof mockApi>[0][string]>) {
    const view = await open(design, 'Columns', extra);
    await view.user.click(entry('Prices'));
    return view;
  }

  it('shows every size to begin with, or only the ones that are ticked', async () => {
    const { server, user } = await openPrices();
    expect(screen.getByRole('radio', { name: 'All of them' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('radio', { name: 'Only some' }));
    // Nothing changes at first: every size is ticked
    await waitFor(() => expect(lastPrices(server).sizes).toEqual(['c1', 'c2']));
    const sizes = within(screen.getByRole('group', { name: 'Pour sizes to show' }));
    expect(sizes.getByRole('checkbox', { name: 'Taster' })).toBeChecked();

    await user.click(sizes.getByRole('checkbox', { name: 'Taster' }));
    await waitFor(() => expect(lastPrices(server).sizes).toEqual(['c2']));
    await user.click(sizes.getByRole('checkbox', { name: 'Full Pour' }));
    await waitFor(() => expect(lastPrices(server).sizes).toEqual([]));
    expect(screen.getByText('No sizes are ticked, so this column prints no prices.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'All of them' }));
    await waitFor(() => expect(lastPrices(server).sizes).toBe('all'));
  });

  it('keeps a size that no longer exists as it is when the others are changed', async () => {
    const { server, user } = await openPrices(setIn(printDesign, ['columns', 1, 'sizes'], ['gone', 'c1']));
    const sizes = within(screen.getByRole('group', { name: 'Pour sizes to show' }));
    await user.click(sizes.getByRole('checkbox', { name: 'Full Pour' }));
    await waitFor(() => expect(lastPrices(server).sizes).toEqual(['gone', 'c1', 'c2']));
  });

  it('says so when the pour sizes cannot be loaded, and still lets the rest be edited', async () => {
    await openPrices(setIn(printDesign, ['columns', 1, 'sizes'], ['c1']), { 'GET /api/containers': status(500, 'No') });
    expect(await screen.findByText('The pour sizes couldn’t be loaded.')).toBeInTheDocument();
    expect(screen.getByLabelText('Width of each size')).toBeInTheDocument();
  });

  it('sets the width of each size and the price format', async () => {
    const { server, user } = await openPrices();
    await typeInto(user, screen, 'Width of each size', '40');
    const format = screen.getByLabelText('Price format');
    await user.clear(format);
    await user.type(format, '{{value} USD');
    await waitFor(() => expect(lastPrices(server)).toMatchObject({ sizeWidthPct: 40, cell: { format: '{value} USD' } }));

    await user.clear(format);
    await user.type(format, 'free');
    expect(screen.getByText('Include {value} where the price goes')).toBeInTheDocument();
  });

  it('styles the prices and the size names separately, and can drop the names', async () => {
    const { server, user } = await openPrices();
    await typeInto(user, within(screen.getByRole('group', { name: 'Style of prices' })), 'Size', '14');
    await user.click(within(screen.getByRole('group', { name: 'Style of size names' })).getByRole('radio', { name: 'Left' }));
    await waitFor(() => expect(lastPrices(server)).toMatchObject({ cell: { style: { sizePt: 14, align: 'center' } }, heading: { style: { align: 'left', sizePt: 12 } } }));

    await user.click(screen.getByRole('switch', { name: 'Show pour size names above the prices' }));
    await waitFor(() => expect(lastPrices(server)).toMatchObject({ heading: { show: false } }));
    expect(screen.queryByRole('group', { name: 'Style of size names' })).not.toBeInTheDocument();
  });
});

describe('pictures', () => {
  it('sets the size, shape and where the picture comes from', async () => {
    const { server, user } = await open(withColumns([itemColumn, picture('photo'), priceColumn]));
    expect(entry('Picture')).toHaveTextContent('32px, circle');
    await user.click(entry('Picture'));
    await typeInto(user, screen, 'Picture size', '48');
    await user.click(screen.getByRole('radio', { name: 'Rounded' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Picture to use' }), 'item-then-brewery-then-menu');
    await waitFor(() => expect(lastColumns(server)[1]).toEqual(picture('photo', { sizePx: 48, shape: 'rounded', source: 'item-then-brewery-then-menu' })));
  });

  it('keeps the size within what the server takes', async () => {
    const { user } = await open(withColumns([itemColumn, picture('photo')]));
    await user.click(entry('Picture'));
    await typeInto(user, screen, 'Picture size', '500');
    expect(screen.getByText('Use 16 to 200')).toBeInTheDocument();
  });
});

describe('rows', () => {
  it('sets the space under each item and the line between them', async () => {
    const { server, user } = await open(printDesign, 'Rows');
    expect(screen.queryByLabelText('Divider color')).not.toBeInTheDocument();
    await typeInto(user, screen, 'Space under each item', '0.5');
    await user.click(screen.getByRole('switch', { name: 'Line between items' }));
    await typeInto(user, screen, 'Divider thickness', '2');
    await user.click(screen.getByRole('radio', { name: 'Dashed' }));
    await waitFor(() => expect(lastDesign(server).rows).toEqual({ gapRem: 0.5, divider: { show: true, color: '#cccccc', widthPx: 2, style: 'dashed' } }));
  });
});
