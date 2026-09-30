import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { library, section } from '../fixtures';

const base = '/menus/m1/sections/s1';

function sectionOrder() {
  return [...document.querySelectorAll('.card-title')].map((el) => el.textContent);
}

describe('SectionPage', () => {
  it("lists the section's items with their pours and prices", async () => {
    mockApi({ 'GET /api/sections/s1': json(section) });
    renderApp(base);
    const hazy = await screen.findByRole('link', { name: /Hazy Sequence/ });
    expect(hazy).toHaveAttribute('href', `${base}/items/mi1`);
    expect(hazy).toHaveTextContent('6.5% ABV');
    expect(hazy).toHaveTextContent('NEIPA · Zymos Brewing');
    expect(hazy).toHaveTextContent('Taster $3');
    expect(hazy).toHaveTextContent('Full Pour $8.50');
    const pils = screen.getByRole('link', { name: /Pils/ });
    expect(pils).toHaveTextContent('No prices set');
    expect(pils).not.toHaveTextContent('ABV');
    expect(screen.getByText('2 items · tap one to edit')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('MenusCurrently On TapDrafts');
  });

  it('marks inactive items, keeping them in their spot', async () => {
    const withInactive = { ...section, items: [{ ...section.items[0], active: false }, section.items[1]] };
    mockApi({ 'GET /api/sections/s1': json(withInactive) });
    renderApp(base);
    const hazy = await screen.findByRole('link', { name: /Hazy Sequence/ });
    expect(hazy).toHaveTextContent('Inactive');
    expect(hazy).toHaveClass('card-inactive');
    // Prices are still there for when it comes back
    expect(hazy).toHaveTextContent('Full Pour $8.50');
    expect(screen.getByRole('link', { name: /Pils/ })).not.toHaveTextContent('Inactive');
    expect(sectionOrder()).toEqual(['Hazy Sequence', 'Pils']);
    expect(screen.getByText('2 items · 1 inactive · tap one to edit')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockApi({ 'GET /api/sections/s1': json({ ...section, items: [] }) });
    renderApp(base);
    expect(await screen.findByText('Nothing pouring here yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
  });

  it('reorders items and saves the new order', async () => {
    const server = mockApi({ 'GET /api/sections/s1': json(section), 'PUT /api/sections/s1/items/order': status(204), 'GET /api/menus/m1': status(404) });
    const { user } = renderApp(base);
    await user.click(await screen.findByRole('button', { name: 'Reorder' }));
    // No add button while reordering
    expect(screen.queryByRole('button', { name: 'Add item' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Pils up' }));
    await waitFor(() => expect(server.calls('PUT', '/api/sections/s1/items/order')).toHaveLength(1));
    expect(server.calls('PUT', '/api/sections/s1/items/order')[0].body).toEqual({ menuItemIds: ['mi2', 'mi1'] });
  });

  describe('adding an item', () => {
    it('opens the library in a sheet tied to the URL, marking what is already here', async () => {
      mockApi({ 'GET /api/sections/s1': json(section), 'GET /api/items': json(library) });
      const { user, location } = renderApp(base);
      await user.click(await screen.findByRole('button', { name: 'Add item' }));
      expect(location().search).toBe('?add=1');
      const sheet = screen.getByRole('dialog', { name: 'Drafts' });
      expect(await within(sheet).findByText('Guest Sour')).toBeInTheDocument();
      // Hazy Sequence is already in this section
      expect(within(sheet).queryByRole('button', { name: 'Add Hazy Sequence' })).not.toBeInTheDocument();
      expect(within(sheet).getByText('On menu')).toBeInTheDocument();
      expect(within(sheet).getByRole('link', { name: /Create a new item/ })).toHaveAttribute('href', `${base}/items/new`);
    });

    it('filters the library as you type', async () => {
      mockApi({ 'GET /api/sections/s1': json(section), 'GET /api/items': json(library) });
      const { user } = renderApp(`${base}?add=1`);
      const sheet = await screen.findByRole('dialog', { name: 'Drafts' });
      await within(sheet).findByText('Guest Sour');
      await user.type(within(sheet).getByLabelText('Search item library'), 'guest co');
      expect(within(sheet).getByText('Guest Sour')).toBeInTheDocument();
      expect(within(sheet).queryByText('Pretzel')).not.toBeInTheDocument();
      await user.clear(within(sheet).getByLabelText('Search item library'));
      await user.type(within(sheet).getByLabelText('Search item library'), 'stout');
      expect(within(sheet).getByText(/No beers match "stout"/)).toBeInTheDocument();
    });

    it('adds a library item to the section and closes the sheet', async () => {
      const server = mockApi({
        'GET /api/sections/s1': json(section),
        'GET /api/items': json(library),
        'POST /api/sections/s1/items': json({ menuItemId: 'mi9', itemId: 'i3' }, 201),
        'GET /api/menus/m1': status(404),
        'GET /api/menus': json([]),
      });
      const { user, location } = renderApp(`${base}?add=1`);
      await user.click(await screen.findByRole('button', { name: 'Add Guest Sour' }));
      expect(await screen.findByText('Guest Sour added to Drafts')).toBeInTheDocument();
      expect(server.calls('POST', '/api/sections/s1/items')[0].body).toEqual({ itemId: 'i3' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(location().search).toBe('');
    });

    it('shows why an add failed and keeps the sheet open', async () => {
      mockApi({
        'GET /api/sections/s1': json(section),
        'GET /api/items': json(library),
        'POST /api/sections/s1/items': status(404, 'Item not found'),
      });
      const { user } = renderApp(`${base}?add=1`);
      await user.click(await screen.findByRole('button', { name: 'Add Pretzel' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Item not found');
      expect(screen.getByRole('button', { name: 'Add Pretzel' })).toBeEnabled();
    });
  });

  it('renames the section', async () => {
    const server = mockApi({ 'GET /api/sections/s1': json(section), 'PATCH /api/sections/s1': json({}), 'GET /api/menus/m1': status(404), 'GET /api/menus': json([]) });
    const { user } = renderApp(base);
    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const field = screen.getByLabelText('Section name');
    await user.clear(field);
    await user.type(field, 'On Draft');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Section renamed')).toBeInTheDocument();
    expect(server.calls('PATCH', '/api/sections/s1')[0].body).toEqual({ displayName: 'On Draft' });
  });

  it('deletes the section after confirming, then goes back to the menu', async () => {
    const server = mockApi({
      'GET /api/sections/s1': json(section),
      'DELETE /api/sections/s1': status(204),
      'GET /api/menus/m1': json({ id: 'm1', displayName: 'Currently On Tap', internalName: 'on-tap', hasLogo: false, logo: null, sections: [] }),
      'GET /api/menus': json([]),
    });
    const { user, location } = renderApp(base);
    await user.click(await screen.findByRole('button', { name: 'Delete section' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Drafts?' });
    expect(dialog).toHaveTextContent('This removes the section and its 2 items from Currently On Tap.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete section' }));
    await waitFor(() => expect(location().pathname).toBe('/menus/m1'));
    expect(server.calls('DELETE', '/api/sections/s1')).toHaveLength(1);
    expect(await screen.findByText('Deleted Drafts')).toBeInTheDocument();
  });
});
