import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { boardDesign, boardFonts, boardPages, boardPresets, defaultBoardState, menu, menus, savedBoardState } from '../fixtures';
import { BoardDesign } from '../../src/boardDesign';
import { setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;
type Handlers = Parameters<typeof mockApi>[0];

function designer(extra: Handlers = {}) {
  return mockApi({
    'GET /api/menus': json(menus),
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(boardFonts),
    'GET /api/design/presets': json(boardPresets),
    'GET /api/menus/m1/design/board': json(defaultBoardState),
    'POST /api/menus/m1/design/board/preview': json(boardPages),
    ...extra,
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/board/preview');
const lastDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: BoardDesign }).design;

async function open() {
  const view = renderApp('/menus/m1/design/board');
  await screen.findAllByRole('img', { name: /Menu board, page/ });
  return view;
}

describe('BoardDesignPage', () => {
  it('shows a picture of each page of the board, and the controls for the design', async () => {
    const server = designer();
    await open();
    expect(screen.getByRole('heading', { name: 'Menu board design' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Menu board, page 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Menu board, page 2 of 2' })).toBeInTheDocument();
    expect(screen.getByText('2 pages')).toBeInTheDocument();
    expect(screen.getByLabelText('Bar height')).toHaveValue(52.5);
    // The editor asks for the board's fonts and nothing else
    expect(server.calls('GET', '/api/design/fonts')[0].search).toBe('?view=board');
    expect(server.calls('GET', '/api/design/presets')).toHaveLength(0);
    expect(previews(server)[0].body).toEqual({ design: boardDesign });
  });

  it('only lists the board’s fonts', async () => {
    designer();
    await open();
    const options = within(screen.getByRole('combobox', { name: 'Font' })).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Fira Sans', 'Montserrat', 'Bebas Neue']);
  });

  it('starts from the saved design, not the standard one', async () => {
    designer({ 'GET /api/menus/m1/design/board': json(savedBoardState) });
    await open();
    expect(screen.getByRole('button', { name: 'Reset to standard design' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Background and margin' }));
    expect(screen.getByLabelText('Pick background color')).toHaveValue('#101010');
  });

  it('does not offer a reset for the standard design', async () => {
    designer();
    await open();
    expect(screen.queryByRole('button', { name: 'Reset to standard design' })).not.toBeInTheDocument();
  });

  it('has the groups of the board, with the section bars open', async () => {
    const { user } = (designer(), await (async () => { const v = renderApp('/menus/m1/design/board'); await screen.findAllByRole('img', { name: /Menu board, page/ }); return v; })());
    const names = [...document.querySelectorAll('.design-group-title button')].map((b) => b.textContent);
    expect(names).toEqual(['Background and margin', 'Logo and title', 'Section bars', 'Items']);
    expect(screen.getByRole('button', { name: 'Section bars' })).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'Items' }));
    expect(screen.getByRole('button', { name: 'Section bars' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Items' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('can show or hide a guide for the safe margin', async () => {
    designer();
    const { user } = await open();
    const guides = screen.getAllByTestId('safe-margin');
    expect(guides).toHaveLength(2);
    // 40 of 1080 across, 40 of 1920 down
    expect(guides[0]).toHaveStyle({ left: `${(40 / 1080) * 100}%`, top: `${(40 / 1920) * 100}%` });
    await user.click(screen.getByRole('checkbox', { name: 'Show the safe margin' }));
    expect(screen.queryByTestId('safe-margin')).not.toBeInTheDocument();
  });

  it('says so when the design cannot be loaded, and can try again', async () => {
    designer({ 'GET /api/menus/m1/design/board': { status: 500, body: 'Nope' } });
    renderApp('/menus/m1/design/board');
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('says when the stored design could not be read', async () => {
    designer({ 'GET /api/menus/m1/design/board': json({ ...defaultBoardState, storedDesignInvalid: true }) });
    await open();
    expect(screen.getByText(/saved design couldn't be read/)).toBeInTheDocument();
  });
});

describe('the board preview', () => {
  it('follows changes to the design', async () => {
    const server = designer();
    await open();
    fireEvent.change(screen.getByLabelText('Bar height'), { target: { value: '70' } });
    await waitFor(() => expect(lastDesign(server).sections.bar.heightPx).toBe(70));
  });

  it('keeps showing the last picture when a newer one cannot be made', async () => {
    let fail = false;
    designer({ 'POST /api/menus/m1/design/board/preview': () => (fail ? { status: 400, body: { error: 'The design is not valid.' } } : json(boardPages)) });
    await open();
    fail = true;
    fireEvent.change(screen.getByLabelText('Bar height'), { target: { value: '70' } });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("The preview couldn't update.");
    expect(alert).toHaveTextContent('Showing the last version that worked.');
    expect(screen.getAllByRole('img', { name: /Menu board, page/ })).toHaveLength(2);

    fail = false;
    fireEvent.change(screen.getByLabelText('Bar height'), { target: { value: '71' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('says so when there is not yet a picture to show', async () => {
    designer({ 'POST /api/menus/m1/design/board/preview': status(500, 'Broken') });
    renderApp('/menus/m1/design/board');
    expect(await screen.findByRole('alert')).toHaveTextContent("The preview couldn't update.");
    expect(screen.queryByRole('img', { name: /Menu board, page/ })).not.toBeInTheDocument();
  });

  it('says how many pages there are', async () => {
    designer({ 'POST /api/menus/m1/design/board/preview': json({ pages: [boardPages.pages[0]] }) });
    await open();
    expect(screen.getByText('1 page')).toBeInTheDocument();
  });
});

describe('saving the board design', () => {
  it('sends the whole design, then has nothing left to save', async () => {
    const changed = setIn(boardDesign, ['canvas', 'background'], '#202020');
    const server = designer({ 'PUT /api/menus/m1/design/board': () => json({ design: changed, isDefault: false, updatedAt: '2026-11-01T12:00:00.000Z' }) });
    const { user } = await open();
    expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Background and margin' }));
    fireEvent.change(screen.getByLabelText('Pick background color'), { target: { value: '#202020' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save design' }));

    await screen.findByText('Design saved');
    expect(server.calls('PUT', '/api/menus/m1/design/board')[0].body).toEqual({ design: changed });
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled();
    // It is no longer the standard design, so it can be reset
    expect(screen.getByRole('button', { name: 'Reset to standard design' })).toBeInTheDocument();
  });

  it('says so when it cannot be saved, and keeps the changes', async () => {
    designer({ 'PUT /api/menus/m1/design/board': { status: 400, body: { error: 'Nope, not that.' } } });
    const { user } = await open();
    fireEvent.change(screen.getByLabelText('Bar height'), { target: { value: '70' } });
    await user.click(screen.getByRole('button', { name: 'Save design' }));
    expect(await screen.findByText(/Couldn't save the design: Nope, not that\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Bar height')).toHaveValue(70);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save design' })).toBeEnabled();
  });

  it('goes back to what was saved on Revert', async () => {
    const { user } = (designer(), await open());
    fireEvent.change(screen.getByLabelText('Bar height'), { target: { value: '70' } });
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(screen.getByLabelText('Bar height')).toHaveValue(52.5);
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
});

describe('resetting the board design', () => {
  it('asks first, then removes the saved design and shows the standard one', async () => {
    let removed = false;
    const server = designer({
      'GET /api/menus/m1/design/board': () => json(removed ? defaultBoardState : savedBoardState),
      'DELETE /api/menus/m1/design/board': () => {
        removed = true;
        return { status: 204 };
      },
    });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Reset to standard design' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Reset to the standard design?');
    expect(server.calls('DELETE', '/api/menus/m1/design/board')).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Reset design' }));
    await screen.findByText('Back to the standard design');
    expect(server.calls('DELETE', '/api/menus/m1/design/board')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset to standard design' })).not.toBeInTheDocument());
    await waitFor(() => expect(lastDesign(server).canvas.background).toBe('#175a6c'));
  });
});

describe('getting around the board designer', () => {
  it('leads back to the menu from the breadcrumb', async () => {
    designer();
    await open();
    const crumbs = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(crumbs.getByText('Board design')).toHaveAttribute('aria-current', 'page');
    expect(crumbs.getByRole('link', { name: 'Currently On Tap' })).toHaveAttribute('href', '/menus/m1');
  });

  it('links to the board images already saved', async () => {
    designer();
    await open();
    expect(screen.getByRole('link', { name: 'Saved board images' })).toHaveAttribute('href', '/menus/m1?format=digital');
  });
});
