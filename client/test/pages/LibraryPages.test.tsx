import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { breweries, brewery, containers, fullPourUses, library, libraryItem, unplacedItem } from '../fixtures';

describe('ItemsPage', () => {
  it('lists the library and searches by name, style or brewery', async () => {
    mockApi({ 'GET /api/items': json(library) });
    const { user } = renderApp('/items');
    expect(await screen.findByText('3 items. Add them to a menu from any section.')).toBeInTheDocument();
    expect(screen.getByText('NEIPA · 6.5% · Zymos Brewing')).toBeInTheDocument();
    // Nothing but a name: falls back to the internal name
    expect(screen.getByText('pretzel')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search items'), 'zymos');
    expect(screen.getByText('Hazy Sequence')).toBeInTheDocument();
    expect(screen.queryByText('Guest Sour')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search items'));
    await user.type(screen.getByLabelText('Search items'), 'porter');
    expect(screen.getByText('No items match "porter".')).toBeInTheDocument();
  });

  it('links each item to its editor, and to a new one', async () => {
    mockApi({ 'GET /api/items': json(library) });
    renderApp('/items');
    expect(await screen.findByRole('link', { name: /Hazy Sequence/ })).toHaveAttribute('href', '/items/i1');
    expect(screen.getByRole('link', { name: 'New item' })).toHaveAttribute('href', '/items/new');
  });
});

describe('LibraryItemPage', () => {
  it('adds an item to the library, starting on the first brewery', async () => {
    const server = mockApi({
      'GET /api/breweries': json(breweries),
      'POST /api/items': json({ ...libraryItem, id: 'i9', displayName: 'Cold IPA' }, 201),
      'GET /api/items': json(library),
    });
    const { user, location } = renderApp('/items/new');
    expect(await screen.findByText(/add it to a menu from any section/)).toBeInTheDocument();
    expect(screen.getByLabelText('Brewery')).toHaveValue('b1');
    await user.type(screen.getByLabelText('Display name'), ' Cold IPA ');
    await user.type(screen.getByLabelText('Style'), 'IPA');
    await user.type(screen.getByLabelText('ABV (%)'), '6,8');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await waitFor(() => expect(location().pathname).toBe('/items'));
    expect(await screen.findByText('Cold IPA added to your items')).toBeInTheDocument();
    expect(server.calls('POST', '/api/items')[0].body).toEqual({
      displayName: 'Cold IPA',
      internalName: null,
      breweryId: 'b1',
      style: 'IPA',
      abv: 6.8,
      description: null,
    });
  });

  it('checks the name and ABV before saving', async () => {
    const server = mockApi({ 'GET /api/breweries': json(breweries) });
    const { user } = renderApp('/items/new');
    await user.type(await screen.findByLabelText('ABV (%)'), 'strong');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByText('Give the item a name guests will see.')).toBeInTheDocument();
    expect(screen.getByText('Enter a percentage like 5.4')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Check the highlighted fields.');
    expect(server.calls('POST', '/api/items')).toHaveLength(0);
  });

  it('edits an item, noting the menus it is on', async () => {
    const server = mockApi({
      'GET /api/breweries': json(breweries),
      'GET /api/items/i1': json(libraryItem),
      'PUT /api/items/i1': json(libraryItem),
      'GET /api/items': json(library),
    });
    const { user, location } = renderApp('/items/i1');
    expect(await screen.findByText(/on 2 menu sections; changes here show up there too/)).toBeInTheDocument();
    expect(screen.getByLabelText('Display name')).toHaveValue('Hazy Sequence');
    await user.selectOptions(screen.getByLabelText('Brewery'), '');
    await user.clear(screen.getByLabelText('Description'));
    await user.click(screen.getByRole('button', { name: 'Save item' }));
    await waitFor(() => expect(location().pathname).toBe('/items'));
    expect(server.calls('PUT', '/api/items/i1')[0].body).toEqual({
      displayName: 'Hazy Sequence',
      internalName: 'hazy-sequence',
      breweryId: null,
      style: 'NEIPA',
      abv: 6.5,
      description: null,
    });
  });

  it("lists the sections it's on, and only offers deleting once it's on none", async () => {
    mockApi({ 'GET /api/breweries': json(breweries), 'GET /api/items/i1': json(libraryItem) });
    renderApp('/items/i1');
    expect(await screen.findByRole('link', { name: /Drafts/ })).toHaveAttribute('href', '/menus/m1/sections/s1/items/mi1');
    expect(screen.getByRole('link', { name: /Cans/ })).toHaveAttribute('href', '/menus/m2/sections/s9/items/mi7');
    expect(screen.getByText('To delete this item, take it off these sections first.')).toBeInTheDocument();
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete item' })).not.toBeInTheDocument();
  });

  it('marks the sections where it is inactive', async () => {
    const placements = [{ ...libraryItem.placements[0], active: false }, libraryItem.placements[1]];
    mockApi({ 'GET /api/breweries': json(breweries), 'GET /api/items/i1': json({ ...libraryItem, placements }) });
    renderApp('/items/i1');
    expect(await screen.findByRole('link', { name: /Drafts/ })).toHaveTextContent('Inactive');
    expect(screen.getByRole('link', { name: /Cans/ })).not.toHaveTextContent('Inactive');
  });

  it('deletes an item that is on no menu', async () => {
    const server = mockApi({
      'GET /api/breweries': json(breweries),
      'GET /api/items/i4': json(unplacedItem),
      'DELETE /api/items/i4': status(204),
      'GET /api/items': json(library),
    });
    const { user, location } = renderApp('/items/i4');
    expect(await screen.findByText(/isn't on any menu/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete item' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(location().pathname).toBe('/items'));
    expect(await screen.findByText('Deleted Pretzel')).toBeInTheDocument();
    expect(server.calls('DELETE', '/api/items/i4')).toHaveLength(1);
  });

  it('shows why a delete was refused', async () => {
    mockApi({
      'GET /api/breweries': json(breweries),
      'GET /api/items/i4': json(unplacedItem),
      'DELETE /api/items/i4': status(409, 'This item is still on 1 menu section. Take it off first.'),
    });
    const { user, location } = renderApp('/items/i4');
    await user.click(await screen.findByRole('button', { name: 'Delete item' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('This item is still on 1 menu section. Take it off first.')).toBeInTheDocument();
    expect(location().pathname).toBe('/items/i4');
  });

  it('shows a save error and stays on the form', async () => {
    mockApi({
      'GET /api/breweries': json(breweries),
      'GET /api/items/i1': json(libraryItem),
      'PUT /api/items/i1': status(404, 'Item not found'),
    });
    const { user, location } = renderApp('/items/i1');
    await user.click(await screen.findByRole('button', { name: 'Save item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Item not found');
    expect(location().pathname).toBe('/items/i1');
  });
});

describe('PourSizesPage', () => {
  it('lists pour sizes in menu order', async () => {
    mockApi({ 'GET /api/containers': json(containers) });
    renderApp('/pour-sizes');
    expect(await screen.findByText('2 sizes, in menu order')).toBeInTheDocument();
    const names = [...document.querySelectorAll('.lib-name')].map((el) => el.textContent);
    expect(names).toEqual(['Taster', 'Full Pour']);
  });

  it('adds a pour size', async () => {
    const server = mockApi({
      'GET /api/containers': json(containers),
      'POST /api/containers': json({ id: 'c3', displayName: 'Crowler', containerName: 'Crowler', order: 3 }, 201),
    });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: 'New pour size' }));
    await user.type(screen.getByLabelText('Display name'), ' Crowler ');
    await user.click(screen.getByRole('button', { name: 'Add pour size' }));
    expect(await screen.findByText('Added Crowler')).toBeInTheDocument();
    expect(server.calls('POST', '/api/containers')[0].body).toEqual({ displayName: 'Crowler', containerName: null });
    // The list is reloaded
    expect(server.calls('GET', '/api/containers')).toHaveLength(2);
  });

  it('requires a display name', async () => {
    const server = mockApi({ 'GET /api/containers': json(containers) });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: 'New pour size' }));
    await user.type(screen.getByLabelText('Glass or container'), 'Growler');
    await user.click(screen.getByRole('button', { name: 'Add pour size' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the pour size a name guests will see.');
    expect(server.calls('POST', '/api/containers')).toHaveLength(0);
  });

  it('edits a pour size', async () => {
    const server = mockApi({
      'GET /api/containers': json(containers),
      'PATCH /api/containers/c2': json({ ...containers[1], containerName: '20 oz imperial pint' }),
      'GET /api/containers/c2/uses': json(fullPourUses),
    });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: /Full Pour/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit pour size' });
    expect(within(dialog).getByLabelText('Display name')).toHaveValue('Full Pour');
    expect(within(dialog).getByLabelText('Glass or container')).toHaveValue('Pint glass');
    await user.clear(within(dialog).getByLabelText('Glass or container'));
    await user.type(within(dialog).getByLabelText('Glass or container'), '20 oz imperial pint');
    await user.click(within(dialog).getByRole('button', { name: 'Save pour size' }));
    expect(await screen.findByText('Saved Full Pour')).toBeInTheDocument();
    expect(server.calls('PATCH', '/api/containers/c2')[0].body).toEqual({ displayName: 'Full Pour', containerName: '20 oz imperial pint' });
  });

  it('shows which pour sizes are in use', async () => {
    mockApi({ 'GET /api/containers': json(containers) });
    renderApp('/pour-sizes');
    expect(await screen.findByText('Taster · Not used yet')).toBeInTheDocument();
    expect(screen.getByText('Pint glass · 2 prices')).toBeInTheDocument();
  });

  it('deletes a pour size nothing uses', async () => {
    const server = mockApi({ 'GET /api/containers': json(containers), 'DELETE /api/containers/c1': status(204) });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: /Taster/ }));
    await user.click(screen.getByRole('button', { name: 'Delete pour size' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Taster?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Deleted Taster')).toBeInTheDocument();
    expect(server.calls('DELETE', '/api/containers/c1')).toHaveLength(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can back out of deleting a pour size', async () => {
    const server = mockApi({ 'GET /api/containers': json(containers) });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: /Taster/ }));
    await user.click(screen.getByRole('button', { name: 'Delete pour size' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Edit pour size' })).toBeInTheDocument();
    expect(server.calls('DELETE', '/api/containers/c1')).toHaveLength(0);
  });

  it('lists the items using a pour size instead of offering to delete it', async () => {
    mockApi({ 'GET /api/containers': json(containers), 'GET /api/containers/c2/uses': json(fullPourUses) });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: /Full Pour/ }));
    const dialog = screen.getByRole('dialog', { name: 'Edit pour size' });
    expect(within(dialog).queryByRole('button', { name: 'Delete pour size' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('Used by 2 prices. To delete it, remove it from these items first.')).toBeInTheDocument();
    const links = await within(dialog).findAllByRole('link', { name: /Hazy Sequence/ });
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/menus/m1/sections/s1/items/mi1', '/menus/m2/sections/s9/items/mi7']);
    expect(within(dialog).getByText('Patio · Cans · $9')).toBeInTheDocument();
  });

  it('starts the container name blank when it just repeats the display name', async () => {
    mockApi({ 'GET /api/containers': json(containers) });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: /Taster/ }));
    expect(screen.getByLabelText('Glass or container')).toHaveValue('');
  });

  it('reorders pour sizes', async () => {
    const server = mockApi({ 'GET /api/containers': json(containers), 'PUT /api/containers/order': status(204) });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: 'Reorder' }));
    expect(screen.queryByRole('button', { name: 'New pour size' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Taster down' }));
    await waitFor(() => expect(server.calls('PUT', '/api/containers/order')).toHaveLength(1));
    expect(server.calls('PUT', '/api/containers/order')[0].body).toEqual({ containerIds: ['c2', 'c1'] });
  });

  it('puts the order back if reordering fails', async () => {
    mockApi({ 'GET /api/containers': json(containers), 'PUT /api/containers/order': status(400, 'nope') });
    const { user } = renderApp('/pour-sizes');
    await user.click(await screen.findByRole('button', { name: 'Reorder' }));
    await user.click(screen.getByRole('button', { name: 'Move Taster down' }));
    expect(await screen.findByText("Couldn't reorder: nope")).toBeInTheDocument();
    const names = [...document.querySelectorAll('.lib-name')].map((el) => el.textContent);
    expect(names).toEqual(['Taster', 'Full Pour']);
  });
});

describe('BreweriesPage', () => {
  it('lists breweries, noting missing locations and logos', async () => {
    mockApi({ 'GET /api/breweries': json(breweries) });
    renderApp('/breweries');
    expect(await screen.findByRole('link', { name: /Zymos Brewing/ })).toHaveTextContent('Littleton, CO · No logo');
    expect(screen.getByRole('link', { name: /Guest Co/ })).toHaveTextContent('No location set');
    expect(screen.getByRole('link', { name: /Guest Co/ })).not.toHaveTextContent('No logo');
    expect(screen.getByText('2 breweries')).toBeInTheDocument();
  });

  it('creates a brewery and opens it', async () => {
    const server = mockApi({
      'GET /api/breweries': json(breweries),
      'POST /api/breweries': json({ id: 'b9', name: 'Odell', location: null, hasLogo: false }, 201),
      'GET /api/breweries/b9': json({ ...brewery, id: 'b9', name: 'Odell', location: null, items: [] }),
    });
    const { user, location } = renderApp('/breweries');
    await user.click(await screen.findByRole('button', { name: 'New brewery' }));
    await user.type(screen.getByLabelText('Brewery name'), 'Odell');
    await user.click(screen.getByRole('button', { name: 'Create brewery' }));
    await waitFor(() => expect(location().pathname).toBe('/breweries/b9'));
    expect(server.calls('POST', '/api/breweries')[0].body).toEqual({ name: 'Odell' });
  });
});

describe('BreweryPage', () => {
  it("shows the brewery and its beers", async () => {
    mockApi({ 'GET /api/breweries/b1': json(brewery) });
    renderApp('/breweries/b1');
    expect(await screen.findByRole('heading', { name: 'Zymos Brewing' })).toBeInTheDocument();
    expect(screen.getByText('1 item in your library')).toBeInTheDocument();
    expect(screen.getByText('NEIPA · 6.5%')).toBeInTheDocument();
  });

  it('only enables saving once something changed, and saves the trimmed values', async () => {
    const server = mockApi({
      'GET /api/breweries/b1': json(brewery),
      'PATCH /api/breweries/b1': json({ ...brewery, location: null }),
      'GET /api/breweries': json(breweries),
      'GET /api/items': json([]),
    });
    const { user } = renderApp('/breweries/b1');
    const save = await screen.findByRole('button', { name: 'Save details' });
    expect(save).toBeDisabled();
    await user.clear(screen.getByLabelText('Location'));
    await user.type(screen.getByLabelText('Location'), '   ');
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await screen.findByText('Brewery saved')).toBeInTheDocument();
    expect(server.calls('PATCH', '/api/breweries/b1')[0].body).toEqual({ name: 'Zymos Brewing', location: null });
  });

  it('requires a name', async () => {
    const server = mockApi({ 'GET /api/breweries/b1': json(brewery) });
    const { user } = renderApp('/breweries/b1');
    await user.clear(await screen.findByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByRole('alert')).toHaveTextContent('The brewery needs a name.');
    expect(server.calls('PATCH', '/api/breweries/b1')).toHaveLength(0);
  });

  it('shows a save error', async () => {
    mockApi({ 'GET /api/breweries/b1': json(brewery), 'PATCH /api/breweries/b1': status(422, 'name is required') });
    const { user } = renderApp('/breweries/b1');
    await user.type(await screen.findByLabelText('Location'), '!');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    const form = screen.getByRole('button', { name: 'Save details' }).closest('form')!;
    expect(await within(form).findByRole('alert')).toHaveTextContent('name is required');
  });
});
