import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { breweries, containers, menuItem, section } from '../fixtures';

const base = '/menus/m1/sections/s1';

function editorApi(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/containers': json(containers),
    'GET /api/breweries': json(breweries),
    'GET /api/sections/s1': json(section),
    'GET /api/menu-items/mi1': json(menuItem),
    'GET /api/menus/m1': status(404),
    'GET /api/menus': json([]),
    'GET /api/items': json([]),
    ...extra,
  });
}

describe('ItemEditorPage: new item', () => {
  it('starts blank, with the first brewery picked and no pours checked', async () => {
    editorApi();
    renderApp(`${base}/items/new`);
    expect(await screen.findByLabelText('Display name')).toHaveValue('');
    expect(screen.getByLabelText('Brewery')).toHaveValue('b1');
    expect(screen.getByRole('checkbox', { name: /Taster/ })).not.toBeChecked();
    expect(screen.getByLabelText('Price for Taster')).toBeDisabled();
    // Container names show when they differ from the display name
    expect(screen.getByLabelText('Price for Full Pour (Pint glass)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove from/ })).not.toBeInTheDocument();
    // New items start active; there's nothing to switch yet
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('highlights missing and invalid fields instead of saving', async () => {
    const server = editorApi();
    const { user } = renderApp(`${base}/items/new`);
    await user.type(await screen.findByLabelText('ABV (%)'), '150');
    await user.click(screen.getByRole('checkbox', { name: /Taster/ }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields.');
    // The error text sits inside the field's label, so match the start of it
    expect(screen.getByLabelText(/^Display name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^ABV/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Give the item a name guests will see.')).toBeInTheDocument();
    expect(screen.getByText('Enter a percentage like 5.4')).toBeInTheDocument();
    expect(screen.getByText('Enter a price for Taster')).toBeInTheDocument();
    expect(server.calls('POST', '/api/sections/s1/items')).toHaveLength(0);
  });

  it('creates the item with its prices, then returns to the section', async () => {
    const server = editorApi({ 'POST /api/sections/s1/items': json({ menuItemId: 'mi9', itemId: 'i9' }, 201) });
    const { user, location } = renderApp(`${base}/items/new`);
    await user.type(await screen.findByLabelText('Display name'), '  Dark Lager ');
    await user.selectOptions(screen.getByLabelText('Brewery'), '');
    await user.type(screen.getByLabelText('Style'), 'Schwarzbier');
    // Commas and a leading $ are accepted as typed on a phone keypad
    await user.type(screen.getByLabelText('ABV (%)'), '5,1');
    await user.click(screen.getByRole('checkbox', { name: /Full Pour/ }));
    await waitFor(() => expect(screen.getByLabelText('Price for Full Pour (Pint glass)')).toHaveFocus());
    await user.type(screen.getByLabelText('Price for Full Pour (Pint glass)'), '$7.50');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(location().pathname).toBe(base));
    expect(server.calls('POST', '/api/sections/s1/items')[0].body).toEqual({
      item: { displayName: 'Dark Lager', internalName: null, breweryId: null, style: 'Schwarzbier', abv: 5.1, description: null },
      pours: [{ containerId: 'c2', price: 7.5 }],
    });
    expect(await screen.findByText('Dark Lager added to Drafts')).toBeInTheDocument();
  });

  it('shows a save error and stays on the form', async () => {
    editorApi({ 'POST /api/sections/s1/items': status(404, 'Pour size not found') });
    const { user, location } = renderApp(`${base}/items/new`);
    await user.type(await screen.findByLabelText('Display name'), 'Dark Lager');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pour size not found');
    expect(location().pathname).toBe(`${base}/items/new`);
  });
});

describe('ItemEditorPage: existing item', () => {
  it('starts from the saved values and says where else the beer appears', async () => {
    editorApi();
    renderApp(`${base}/items/mi1`);
    expect(await screen.findByLabelText('Display name')).toHaveValue('Hazy Sequence');
    expect(screen.getByLabelText('Internal name')).toHaveValue('hazy-sequence');
    expect(screen.getByLabelText('Brewery')).toHaveValue('b1');
    expect(screen.getByLabelText('Style')).toHaveValue('NEIPA');
    expect(screen.getByLabelText('ABV (%)')).toHaveValue('6.5');
    expect(screen.getByLabelText('Description')).toHaveValue('Juicy');
    expect(screen.getByRole('checkbox', { name: /Full Pour/ })).toBeChecked();
    expect(screen.getByLabelText('Price for Full Pour (Pint glass)')).toHaveValue('8.5');
    expect(screen.getByRole('checkbox', { name: /Taster/ })).not.toBeChecked();
    expect(screen.getByText(/also appears in 2 other places/)).toBeInTheDocument();
  });

  it('saves details and prices together', async () => {
    const server = editorApi({ 'PUT /api/menu-items/mi1': status(204) });
    const { user, location } = renderApp(`${base}/items/mi1`);
    const name = await screen.findByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Hazy Sequence v2');
    await user.clear(screen.getByLabelText('ABV (%)'));
    await user.click(screen.getByRole('checkbox', { name: /Full Pour/ }));
    await user.click(screen.getByRole('checkbox', { name: /Taster/ }));
    await user.type(screen.getByLabelText('Price for Taster'), '3');
    await user.click(screen.getByRole('button', { name: 'Save item' }));

    await waitFor(() => expect(location().pathname).toBe(base));
    expect(server.calls('PUT', '/api/menu-items/mi1')[0].body).toEqual({
      item: { displayName: 'Hazy Sequence v2', internalName: 'hazy-sequence', breweryId: 'b1', style: 'NEIPA', abv: null, description: 'Juicy' },
      pours: [{ containerId: 'c1', price: 3 }],
    });
    expect(await screen.findByText('Saved Hazy Sequence v2')).toBeInTheDocument();
  });

  it('shows an active item as on the menu', async () => {
    editorApi();
    renderApp(`${base}/items/mi1`);
    expect(await screen.findByRole('switch', { name: 'Show on published menus' })).toBeChecked();
    expect(screen.getByText('Showing on the menu')).toBeInTheDocument();
  });

  it('marks an item inactive straight away, without saving the rest of the form', async () => {
    const server = editorApi({ 'PUT /api/menu-items/mi1/active': json({ menuItemId: 'mi1', active: false }) });
    const { user, location } = renderApp(`${base}/items/mi1`);
    // An unsaved edit to the form stays unsaved (and in place)
    const name = await screen.findByLabelText('Display name');
    await user.type(name, '!');
    await user.click(screen.getByRole('switch', { name: 'Show on published menus' }));

    await waitFor(() => expect(server.calls('PUT', '/api/menu-items/mi1/active')).toHaveLength(1));
    expect(server.calls('PUT', '/api/menu-items/mi1/active')[0].body).toEqual({ active: false });
    expect(server.calls('PUT', '/api/menu-items/mi1')).toHaveLength(0);
    expect(await screen.findByText('Hazy Sequence marked inactive')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show on published menus' })).not.toBeChecked();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Hazy Sequence!');
    expect(location().pathname).toBe(`${base}/items/mi1`);
  });

  it('turns an inactive item back on', async () => {
    const server = editorApi({
      'GET /api/menu-items/mi1': json({ ...menuItem, active: false }),
      'PUT /api/menu-items/mi1/active': json({ menuItemId: 'mi1', active: true }),
    });
    const { user } = renderApp(`${base}/items/mi1`);
    const toggle = await screen.findByRole('switch', { name: 'Show on published menus' });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/keeps its spot in Drafts and its prices/)).toBeInTheDocument();
    await user.click(toggle);
    await waitFor(() => expect(server.calls('PUT', '/api/menu-items/mi1/active')[0]?.body).toEqual({ active: true }));
    expect(await screen.findByText('Hazy Sequence is back on the menu')).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it('flips the switch back and says so when it cannot be saved', async () => {
    editorApi({ 'PUT /api/menu-items/mi1/active': status(500) });
    const { user } = renderApp(`${base}/items/mi1`);
    const toggle = await screen.findByRole('switch', { name: 'Show on published menus' });
    await user.click(toggle);
    expect(await screen.findByText(/Couldn't update/)).toBeInTheDocument();
    expect(toggle).toBeChecked();
  });

  it('removes the item from the section after confirming', async () => {
    const server = editorApi({ 'DELETE /api/menu-items/mi1': status(204) });
    const { user, location } = renderApp(`${base}/items/mi1`);
    await user.click(await screen.findByRole('button', { name: 'Remove from Drafts' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Hazy Sequence?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(location().pathname).toBe(base));
    expect(server.calls('DELETE', '/api/menu-items/mi1')).toHaveLength(1);
    expect(await screen.findByText('Hazy Sequence removed from Drafts')).toBeInTheDocument();
  });

  it('cancel goes back without saving', async () => {
    const server = editorApi();
    const { user, location } = renderApp(`${base}/items/mi1`);
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(location().pathname).toBe(base));
    expect(server.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  });

  it('shows an error when the item cannot be loaded', async () => {
    editorApi({ 'GET /api/menu-items/mi1': status(404, 'Menu item not found') });
    renderApp(`${base}/items/mi1`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Menu item not found');
    expect(screen.queryByRole('button', { name: 'Save item' })).not.toBeInTheDocument();
  });
});
