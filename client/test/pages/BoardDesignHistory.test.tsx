import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { boardFonts, boardPages, boardPresets, defaultBoardState, menu, menus } from '../fixtures';
import { BoardDesign } from '../../src/boardDesign';

type Mock = ReturnType<typeof mockApi>;

function designer() {
  return mockApi({
    'GET /api/menus': json(menus),
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(boardFonts),
    'GET /api/design/presets': json(boardPresets),
    'GET /api/menus/m1/design/board': json(defaultBoardState),
    'POST /api/menus/m1/design/board/preview': json(boardPages),
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/board/preview');
const lastDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: BoardDesign }).design;

async function open() {
  const server = designer();
  const view = renderApp('/menus/m1/design/board');
  await screen.findAllByRole('img', { name: /Menu board, page/ });
  return { server, ...view };
}

type User = Awaited<ReturnType<typeof open>>['user'];

async function setHeight(user: User, value: string) {
  const box = screen.getByLabelText('Bar height');
  await user.clear(box);
  await user.type(box, value);
  await user.tab();
}

describe('undo and redo on the board designer', () => {
  it('are only usable when there is something to undo or redo', async () => {
    const { user } = await open();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await setHeight(user, '80');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Bar height')).toHaveValue(52.5);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByLabelText('Bar height')).toHaveValue(80);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('take the preview along', async () => {
    const { server, user } = await open();
    await setHeight(user, '80');
    await waitFor(() => expect(lastDesign(server).sections.bar.heightPx).toBe(80));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(lastDesign(server).sections.bar.heightPx).toBe(52.5));
  });

  it('bring back a line that was removed', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Items' }));
    await user.click(screen.getByRole('button', { name: 'Add a line' }));
    expect(screen.getByRole('button', { name: 'Remove line 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove line 2' }));
    expect(screen.queryByRole('button', { name: 'Remove line 2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Remove line 2' })).toBeInTheDocument();
  });

  it('answer to Ctrl+Z and Shift+Ctrl+Z, except while typing in a box', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Logo and title' }));
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');

    const box = screen.getByLabelText('Logo size');
    box.focus();
    fireEvent.keyDown(box, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');

    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('leaving the board designer with changes that are not saved', () => {
  const leave = (user: User) => user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Menus' }));

  it('asks first, and stays when asked to', async () => {
    const { user } = await open();
    await setHeight(user, '80');
    await leave(user);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Leave without saving?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bar height')).toHaveValue(80);
  });

  it('leaves, losing the changes, when asked to', async () => {
    const { user } = await open();
    await setHeight(user, '80');
    await leave(user);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('Currently On Tap')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Menu board, page/ })).not.toBeInTheDocument();
  });

  it('does not ask when nothing has changed', async () => {
    const { user } = await open();
    await leave(user);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('also asks before the page is closed or reloaded', async () => {
    const { user } = await open();
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(closing()).toBe(false);
    await setHeight(user, '80');
    expect(closing()).toBe(true);
  });
});

describe('board presets', () => {
  it('are listed in a sheet, asked for with the board view', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    const sheet = await screen.findByRole('dialog', { name: 'Start from a design' });
    expect(await within(sheet).findByText('Near-black background with amber section bars.')).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Classic');
    expect(sheet).toHaveTextContent('Dark');
    expect(server.calls('GET', '/api/design/presets').at(-1)!.search).toBe('?view=board');
  });

  it('change the look of the draft, and keep the logo, title and safe margin', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    await user.click(await screen.findByRole('button', { name: 'Use Dark' }));

    await waitFor(() => expect(lastDesign(server).canvas.background).toBe('#141414'));
    const design = lastDesign(server);
    expect(design.sections.bar).toMatchObject({ background: '#e0a526', heightPx: 60 });
    // The menu's own choices stay
    expect(design.canvas.safeMarginPx).toBe(40);
    expect(design.header.logo.show).toBe(true);
    expect(design.header.title.show).toBe(false);
    expect(design.header.title.text).toBe('{menu.name}');
    expect(screen.queryByRole('dialog', { name: 'Start from a design' })).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(server.calls('PUT', '/api/menus/m1/design/board')).toHaveLength(0);
  });

  it('can be undone', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    await user.click(await screen.findByRole('button', { name: 'Use Dark' }));
    await waitFor(() => expect(lastDesign(server).canvas.background).toBe('#141414'));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(lastDesign(server).canvas.background).toBe('#175a6c'));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
});
