import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { menu } from '../fixtures';

function sectionTitles() {
  return [...document.querySelectorAll('.card-title')].map((el) => el.textContent);
}

describe('MenuPage', () => {
  it('shows the menu, its sections and what is in them', async () => {
    mockApi({ 'GET /api/menus/m1': json(menu) });
    renderApp('/menus/m1');
    expect(await screen.findByRole('heading', { name: 'Currently On Tap' })).toBeInTheDocument();
    expect(screen.getByText('on-tap')).toBeInTheDocument();
    const drafts = screen.getByRole('link', { name: /Drafts/ });
    expect(drafts).toHaveAttribute('href', '/menus/m1/sections/s1');
    expect(drafts).toHaveTextContent('Hazy Sequence, Pils');
    expect(screen.getByRole('link', { name: /Empty/ })).toHaveTextContent('Empty — tap to add items');
    expect(screen.getByText('3 sections')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print view' })).toHaveAttribute('href', '/menus/m1?format=print');
    expect(screen.getByRole('link', { name: 'Menu board PDF' })).toHaveAttribute('href', '/menus/m1?format=digital');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Menus');
  });

  it('only offers the menu board PDF when there is a logo to put on it', async () => {
    mockApi({ 'GET /api/menus/m1': json({ ...menu, hasLogo: false, logo: null }) });
    renderApp('/menus/m1');
    await screen.findByRole('heading', { name: 'Currently On Tap' });
    expect(screen.queryByRole('link', { name: 'Menu board PDF' })).not.toBeInTheDocument();
    expect(screen.getByText('No logo yet')).toBeInTheDocument();
  });

  it('shows an error for a menu that does not exist', async () => {
    mockApi({ 'GET /api/menus/nope': status(404, 'Menu not found') });
    renderApp('/menus/nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('Menu not found');
  });

  it('reorders sections with the arrow buttons and saves the new order', async () => {
    const server = mockApi({ 'GET /api/menus/m1': json(menu), 'PUT /api/menus/m1/sections/order': status(204) });
    const { user } = renderApp('/menus/m1');
    await user.click(await screen.findByRole('button', { name: 'Reorder' }));
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Add section' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Move Guest Taps up' }));
    expect(sectionTitles()).toEqual(['Guest Taps', 'Drafts', 'Empty']);
    await waitFor(() => expect(server.calls('PUT', '/api/menus/m1/sections/order')).toHaveLength(1));
    expect(server.calls('PUT', '/api/menus/m1/sections/order')[0].body).toEqual({ sectionIds: ['s2', 's1', 's3'] });
  });

  it('puts the order back and says so when saving it fails', async () => {
    mockApi({ 'GET /api/menus/m1': json(menu), 'PUT /api/menus/m1/sections/order': status(400, 'sectionIds must list every section') });
    const { user } = renderApp('/menus/m1');
    await user.click(await screen.findByRole('button', { name: 'Reorder' }));
    await user.click(screen.getByRole('button', { name: 'Move Drafts down' }));
    expect(await screen.findByText("Couldn't reorder: sectionIds must list every section")).toBeInTheDocument();
    expect(sectionTitles()).toEqual(['Drafts', 'Guest Taps', 'Empty']);
  });

  it("doesn't offer reordering with a single section", async () => {
    mockApi({ 'GET /api/menus/m1': json({ ...menu, sections: menu.sections.slice(0, 1) }) });
    renderApp('/menus/m1');
    await screen.findByRole('heading', { name: 'Currently On Tap' });
    expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument();
  });

  it('renames the menu', async () => {
    let current = menu;
    const server = mockApi({
      'GET /api/menus/m1': () => json(current),
      'PATCH /api/menus/m1': ({ body }) => {
        current = { ...menu, displayName: (body as { displayName: string }).displayName };
        return json({ id: 'm1', displayName: current.displayName, internalName: 'on-tap' });
      },
      'GET /api/menus': json([]),
    });
    const { user } = renderApp('/menus/m1');
    await user.click(await screen.findByRole('button', { name: 'Rename' }));
    const field = within(screen.getByRole('dialog', { name: 'Rename menu' })).getByLabelText('Menu name');
    expect(field).toHaveValue('Currently On Tap');
    await user.clear(field);
    await user.type(field, 'Now Pouring');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByRole('heading', { name: 'Now Pouring' })).toBeInTheDocument();
    expect(server.calls('PATCH', '/api/menus/m1')[0].body).toEqual({ displayName: 'Now Pouring' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Menu renamed')).toBeInTheDocument();
  });

  it('adds a section', async () => {
    const server = mockApi({
      'GET /api/menus/m1': json(menu),
      'POST /api/menus/m1/sections': json({ id: 's4' }, 201),
      'GET /api/menus': json([]),
    });
    const { user } = renderApp('/menus/m1');
    await user.click(await screen.findByRole('button', { name: 'Add section' }));
    await user.type(screen.getByLabelText('Section name'), 'Bottles');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add section' }));
    expect(await screen.findByText('Added Bottles')).toBeInTheDocument();
    expect(server.calls('POST', '/api/menus/m1/sections')[0].body).toEqual({ displayName: 'Bottles' });
    // The menu is reloaded to show the new section
    expect(server.calls('GET', '/api/menus/m1').length).toBeGreaterThan(1);
  });

  it('removes the logo after confirming', async () => {
    const server = mockApi({ 'GET /api/menus/m1': json(menu), 'DELETE /api/menus/m1/logo': status(204) });
    const { user } = renderApp('/menus/m1');
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Remove logo' }));
    expect(await screen.findByText('Menu logo removed')).toBeInTheDocument();
    expect(server.calls('DELETE', '/api/menus/m1/logo')).toHaveLength(1);
  });
});
