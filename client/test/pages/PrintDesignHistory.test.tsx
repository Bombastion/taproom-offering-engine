import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { containers, defaultDesignState, designFonts, menu, menus, previewPage, printDesign } from '../fixtures';
import { PrintDesign, setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

function designer(extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return mockApi({
    'GET /api/menus': json(menus),
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/containers': json(containers),
    'GET /api/menus/m1/design/print': json(defaultDesignState),
    'POST /api/menus/m1/design/print/preview': { text: previewPage },
    ...extra,
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/print/preview');
const lastDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: PrintDesign }).design;

async function open() {
  const server = designer();
  const view = renderApp('/menus/m1/design/print');
  await screen.findByTitle('Print menu preview');
  return { server, ...view };
}

// Types into a number box, then leaves the box (as someone moving on to something else would)
async function setSize(user: Awaited<ReturnType<typeof open>>['user'], value: string) {
  const size = screen.getByLabelText('Size');
  await user.clear(size);
  await user.type(size, value);
  await user.tab();
}

describe('undo and redo', () => {
  it('are there from the start, and only usable when there is something to undo or redo', async () => {
    const { user } = await open();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

    await setSize(user, '30');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Size')).toHaveValue(18);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByLabelText('Size')).toHaveValue(30);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('take the preview along', async () => {
    const { server, user } = await open();
    await setSize(user, '30');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(lastDesign(server).sections.heading.style.sizePt).toBe(18));
  });

  it('count typing "30" as one step', async () => {
    const { user } = await open();
    await setSize(user, '30');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Size')).toHaveValue(18);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('bring back a column that was removed', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('button', { name: 'Remove Prices' }));
    expect(screen.queryByRole('button', { name: /^Prices/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /^Prices/ })).toBeInTheDocument();
  });

  it('answer to Ctrl+Z and Shift+Ctrl+Z, except while typing in a box', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');

    // In a text box the keys are for undoing the typing
    const size = screen.getByLabelText('Size');
    size.focus();
    fireEvent.keyDown(size, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');

    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(screen.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
  });

  it('can take back a revert', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(screen.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
  });

  it('go on working after a save', async () => {
    const changed = setIn(printDesign, ['sections', 'heading', 'style', 'align'], 'left');
    designer({ 'PUT /api/menus/m1/design/print': () => ({ body: { design: changed, isDefault: false, updatedAt: '2026-11-01T12:00:00.000Z' } }) });
    const { user } = await (async () => {
      const view = renderApp('/menus/m1/design/print');
      await screen.findByTitle('Print menu preview');
      return view;
    })();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('button', { name: 'Save design' }));
    await screen.findByText('Design saved');
    expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled();

    // The save can be undone, which leaves something to save again
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Save design' })).toBeEnabled();
  });
});

describe('leaving with changes that are not saved', () => {
  const leave = (user: Awaited<ReturnType<typeof open>>['user']) => user.click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Menus' }));

  it('asks first, and stays when asked to', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await leave(user);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Leave without saving?');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Still here, with the change
    expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
  });

  it('leaves, losing the changes, when asked to', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await leave(user);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Leave without saving' }));
    expect(await screen.findByText('Currently On Tap')).toBeInTheDocument();
    expect(screen.queryByTitle('Print menu preview')).not.toBeInTheDocument();
  });

  it('does not ask when nothing has changed, or after a change was changed back', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('radio', { name: 'Center' }));
    await leave(user);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Currently On Tap')).toBeInTheDocument();
  });

  it('does not ask once the changes are saved', async () => {
    const changed = setIn(printDesign, ['sections', 'heading', 'style', 'align'], 'left');
    designer({ 'PUT /api/menus/m1/design/print': () => ({ body: { design: changed, isDefault: false, updatedAt: '2026-11-01T12:00:00.000Z' } }) });
    const { user } = await (async () => {
      const view = renderApp('/menus/m1/design/print');
      await screen.findByTitle('Print menu preview');
      return view;
    })();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('button', { name: 'Save design' }));
    await screen.findByText('Design saved');
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
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    expect(closing()).toBe(true);
    await user.click(screen.getByRole('radio', { name: 'Center' }));
    expect(closing()).toBe(false);
  });
});
