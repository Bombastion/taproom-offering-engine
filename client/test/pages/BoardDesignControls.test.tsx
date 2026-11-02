import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { boardDesign, boardFonts, boardPages, defaultBoardState, menu } from '../fixtures';
import { BoardDesign } from '../../src/boardDesign';
import { setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

function designer(design: BoardDesign = boardDesign) {
  return mockApi({
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(boardFonts),
    'GET /api/menus/m1/design/board': json({ ...defaultBoardState, design }),
    'POST /api/menus/m1/design/board/preview': json(boardPages),
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/board/preview');
const lastDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: BoardDesign }).design;

async function open(group?: string, design?: BoardDesign) {
  const server = designer(design);
  const view = renderApp('/menus/m1/design/board');
  await screen.findAllByRole('img', { name: /Menu board, page/ });
  if (group) await view.user.click(screen.getByRole('button', { name: group }));
  return { server, ...view };
}

type User = Awaited<ReturnType<typeof open>>['user'];

async function typeInto(user: User, label: string, value: string, scope: { getByLabelText: typeof screen.getByLabelText } = screen) {
  const box = scope.getByLabelText(label);
  await user.clear(box);
  await user.type(box, value);
}

describe('Background and margin', () => {
  it('sets the background color and the safe margin', async () => {
    const { server, user } = await open('Background and margin');
    fireEvent.change(screen.getByLabelText('Pick background color'), { target: { value: '#112233' } });
    await typeInto(user, 'Safe margin', '60');
    await waitFor(() => expect(lastDesign(server).canvas).toEqual({ background: '#112233', safeMarginPx: 60 }));
  });

  it('moves the guide with the margin', async () => {
    const { user } = await open('Background and margin');
    await typeInto(user, 'Safe margin', '108');
    await waitFor(() => expect(screen.getAllByTestId('safe-margin')[0]).toHaveStyle({ left: '10%' }));
  });

  it('refuses a margin the server would', async () => {
    const { user } = await open('Background and margin');
    await typeInto(user, 'Safe margin', '300');
    expect(screen.getByLabelText('Safe margin')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use 0 to 200')).toBeInTheDocument();
  });
});

describe('Logo and title', () => {
  it('sets how the logo looks, and hides its controls when it is off', async () => {
    const { server, user } = await open('Logo and title');
    await typeInto(user, 'Logo size', '200');
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('radio', { name: 'Keep proportions' }));
    await waitFor(() => expect(lastDesign(server).header.logo).toEqual({ show: true, sizePx: 200, align: 'left', fit: 'contain' }));

    await user.click(screen.getByRole('switch', { name: 'Show the logo' }));
    expect(screen.queryByLabelText('Logo size')).not.toBeInTheDocument();
    await waitFor(() => expect(lastDesign(server).header.logo.show).toBe(false));
    expect(lastDesign(server).header.logo.sizePx).toBe(200);
  });

  it('adds a title, with the words and the look of it', async () => {
    const { server, user } = await open('Logo and title');
    expect(screen.getByRole('switch', { name: 'Show a title' })).not.toBeChecked();
    expect(screen.queryByLabelText('Title text')).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show a title' }));
    expect(screen.getByLabelText('Title text')).toHaveValue('{menu.name}');
    await user.clear(screen.getByLabelText('Title text'));
    await user.type(screen.getByLabelText('Title text'), 'On tap {{date}');
    const style = within(screen.getByRole('group', { name: 'Title style' }));
    await typeInto(user, 'Size', '90', style);
    await user.selectOptions(style.getByRole('combobox', { name: 'Font' }), 'bebas-neue');
    await typeInto(user, 'Space above the title', '20');
    await typeInto(user, 'Space below the header', '30');

    await waitFor(() => expect(lastDesign(server).header).toMatchObject({
      title: { show: true, text: 'On tap {date}', gapAbovePx: 20, style: { sizePx: 90, font: 'bebas-neue', weight: 400, italic: false } },
      gapBelowPx: 30,
    }));
  });

  it('refuses a logo size the server would', async () => {
    const { user } = await open('Logo and title');
    await typeInto(user, 'Logo size', '5');
    expect(screen.getByText('Use 20 to 600')).toBeInTheDocument();
  });
});

describe('Section bars', () => {
  it('sets the size and spacing of a bar', async () => {
    const { server, user } = await open();
    await typeInto(user, 'Bar height', '80');
    await typeInto(user, 'Space above the bar', '20');
    await typeInto(user, 'Name inset', '12');
    await typeInto(user, 'Name from the top', '9');
    await typeInto(user, 'Space between sections', '45');
    await waitFor(() => expect(lastDesign(server).sections).toMatchObject({ gapPx: 45, bar: { heightPx: 80, marginTopPx: 20, insetPx: 12, textTopPx: 9 } }));
  });

  it('colors the bar, and can leave it without one', async () => {
    const { server, user } = await open();
    fireEvent.change(screen.getByLabelText('Pick bar color'), { target: { value: '#aa5500' } });
    await typeInto(user, 'Rounded corners', '14');
    await waitFor(() => expect(lastDesign(server).sections.bar).toMatchObject({ background: '#aa5500', radiusPx: 14 }));

    await user.click(screen.getByRole('switch', { name: 'Fill the bar with a color' }));
    expect(screen.queryByLabelText('Rounded corners')).not.toBeInTheDocument();
    await waitFor(() => expect(lastDesign(server).sections.bar.background).toBeNull());

    // Turning it back on starts from the standard bar color
    await user.click(screen.getByRole('switch', { name: 'Fill the bar with a color' }));
    await waitFor(() => expect(lastDesign(server).sections.bar.background).toBe('#2b2b2b'));
  });

  it('sets the words added when a section continues', async () => {
    const { server, user } = await open();
    const box = screen.getByLabelText('Added when a section continues');
    await user.clear(box);
    await user.type(box, ' (more)');
    await waitFor(() => expect(lastDesign(server).sections.bar.continuedSuffix).toBe(' (more)'));
  });

  it('styles the section names, in pixels and without line height', async () => {
    const { server, user } = await open();
    const style = within(screen.getByRole('group', { name: 'Style of section names' }));
    await typeInto(user, 'Size', '50', style);
    await user.click(style.getByRole('radio', { name: 'Right' }));
    await waitFor(() => expect(lastDesign(server).sections.bar.style).toMatchObject({ sizePx: 50, align: 'right' }));
    expect(screen.queryByText('pt')).not.toBeInTheDocument();
    await user.click(screen.getByText('Spacing'));
    expect(screen.queryByLabelText('Line height')).not.toBeInTheDocument();
    await typeInto(user, 'Letter spacing', '0.2');
    await waitFor(() => expect(lastDesign(server).sections.bar.style.letterSpacingEm).toBe(0.2));
  });

  it('keeps sizes within what the server takes', async () => {
    const { user } = await open();
    await typeInto(user, 'Bar height', '5');
    expect(screen.getByText('Use 20 to 300')).toBeInTheDocument();
    const style = within(screen.getByRole('group', { name: 'Style of section names' }));
    await typeInto(user, 'Size', '500', style);
    expect(screen.getByText('Use 10 to 200')).toBeInTheDocument();
  });
});

describe('Items', () => {
  it('sets the picture beside each item, and hides its controls when it is off', async () => {
    const { server, user } = await open('Items');
    await typeInto(user, 'Picture size', '80');
    await user.click(screen.getByRole('radio', { name: 'Square' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Picture to use' }), 'item-then-brewery-then-menu');
    await typeInto(user, 'Space around each item', '24');
    await waitFor(() => expect(lastDesign(server).items).toMatchObject({ gapPx: 24, logo: { show: true, sizePx: 80, shape: 'square', source: 'item-then-brewery-then-menu' } }));

    await user.click(screen.getByRole('switch', { name: 'Show a picture beside each item' }));
    expect(screen.queryByLabelText('Picture size')).not.toBeInTheDocument();
    await waitFor(() => expect(lastDesign(server).items.logo.show).toBe(false));
  });

  const line1 = () => screen.getByRole('button', { name: /^Line 1/ });

  it('shows the lines, and their parts when one is opened', async () => {
    const { user } = await open('Items');
    expect(line1()).toHaveAttribute('aria-expanded', 'false');
    await user.click(line1());
    expect(screen.getByRole('group', { name: 'Style of line 1' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Part 1' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Part 4' })).toBeInTheDocument();
    expect(screen.getByText('Prices are not shown on the board.', { exact: false })).toBeInTheDocument();
  });

  it('adds a line in the same style as the first, smaller, and takes it away again', async () => {
    const { server, user } = await open('Items');
    await user.click(screen.getByRole('button', { name: 'Add a line' }));
    await waitFor(() => expect(lastDesign(server).items.lines).toHaveLength(2));
    const added = lastDesign(server).items.lines[1];
    expect(added.style).toEqual({ ...boardDesign.items.lines[0].style, sizePx: 32 });
    expect(added.parts).toEqual([{ field: 'description', before: '', format: '{value}' }]);
    // The new line is open for editing
    expect(screen.getByRole('button', { name: /^Line 2/ })).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Remove line 2' }));
    await waitFor(() => expect(lastDesign(server).items.lines).toHaveLength(1));
  });

  it('stops at three lines', async () => {
    const { user } = await open('Items');
    const add = screen.getByRole('button', { name: 'Add a line' });
    await user.click(add);
    expect(add).toBeEnabled();
    await user.click(add);
    expect(add).toBeDisabled();
  });

  it('keeps at least one line', async () => {
    await open('Items');
    expect(screen.getByRole('button', { name: 'Remove line 1' })).toBeDisabled();
  });

  it('adds a part with the separator the board uses', async () => {
    const { server, user } = await open('Items');
    await user.click(line1());
    await user.click(screen.getByRole('button', { name: 'Add to this line' }));
    await waitFor(() => expect(lastDesign(server).items.lines[0].parts).toHaveLength(5));
    expect(lastDesign(server).items.lines[0].parts[4].before).toBe(' · ');
  });

  it('styles a part without a size or alignment of its own', async () => {
    const { server, user } = await open('Items');
    await user.click(line1());
    await user.click(within(screen.getByRole('group', { name: 'Part 1' })).getByRole('checkbox', { name: 'Style this part differently' }));
    const style = within(screen.getByRole('group', { name: 'Style of part 1' }));
    expect(style.queryByLabelText('Size')).not.toBeInTheDocument();
    expect(style.queryByRole('radio', { name: 'Center' })).not.toBeInTheDocument();
    // The line's own style does have them
    expect(within(screen.getByRole('group', { name: 'Style of line 1' })).getByLabelText('Size')).toHaveValue(52.5);

    fireEvent.change(style.getByLabelText('Pick color'), { target: { value: '#ff0000' } });
    await waitFor(() => expect(lastDesign(server).items.lines[0].parts[0].style).toEqual({ color: '#ff0000' }));
  });

  it('changes what a part shows', async () => {
    const { server, user } = await open('Items');
    await user.click(line1());
    const part = within(screen.getByRole('group', { name: 'Part 4' }));
    await user.selectOptions(part.getByRole('combobox', { name: 'Field' }), 'description');
    await waitFor(() => expect(lastDesign(server).items.lines[0].parts[3].field).toBe('description'));
  });
});

describe('every control reports only what the server would take', () => {
  it('sends nothing out of range', async () => {
    const { server, user } = await open('Background and margin');
    const before = previews(server).length;
    await typeInto(user, 'Safe margin', '999');
    await new Promise((r) => setTimeout(r, 400));
    for (const call of previews(server).slice(before)) {
      expect((call.body as { design: BoardDesign }).design.canvas.safeMarginPx).toBeLessThanOrEqual(200);
    }
  });

  it('starts from a stored design that has no logo, title or fill', async () => {
    let design = setIn(boardDesign, ['header', 'logo', 'show'], false);
    design = setIn(design, ['sections', 'bar', 'background'], null);
    await open('Logo and title', design);
    expect(screen.getByRole('switch', { name: 'Show the logo' })).not.toBeChecked();
    expect(screen.queryByLabelText('Logo size')).not.toBeInTheDocument();
  });
});
