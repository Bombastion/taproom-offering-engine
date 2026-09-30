import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { breweries, brewery, containers, library } from '../fixtures';

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
});

describe('PourSizesPage', () => {
  it('lists pour sizes in menu order', async () => {
    mockApi({ 'GET /api/containers': json(containers) });
    renderApp('/pour-sizes');
    expect(await screen.findByText('2 sizes, in menu order')).toBeInTheDocument();
    const names = [...document.querySelectorAll('.lib-name')].map((el) => el.textContent);
    expect(names).toEqual(['Taster', 'Full Pour']);
    expect(screen.getByRole('link', { name: /classic editor/ })).toHaveAttribute('href', '/containers/manage');
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
