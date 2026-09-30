import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { menus } from '../fixtures';

describe('HomePage', () => {
  it('lists menus with their counts', async () => {
    mockApi({ 'GET /api/menus': json(menus) });
    renderApp('/');
    const link = await screen.findByRole('link', { name: /Currently On Tap/ });
    expect(link).toHaveAttribute('href', '/menus/m1');
    expect(link).toHaveTextContent('2 sections · 3 items');
    expect(screen.getByRole('link', { name: /Patio/ })).toHaveTextContent('1 section · 1 item');
  });

  it('says so when there are no menus', async () => {
    mockApi({ 'GET /api/menus': json([]) });
    renderApp('/');
    expect(await screen.findByText(/No menus yet/)).toBeInTheDocument();
  });

  it('shows a load error and retries', async () => {
    let attempts = 0;
    mockApi({ 'GET /api/menus': () => (++attempts === 1 ? status(500) : json(menus)) });
    const { user } = renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on the server');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Currently On Tap/ })).toBeInTheDocument();
  });

  it('creates a menu and opens it', async () => {
    const created = { id: 'm9', displayName: 'Winter', internalName: 'winter', sectionCount: 0, itemCount: 0 };
    const server = mockApi({
      'GET /api/menus': json(menus),
      'POST /api/menus': json(created, 201),
      'GET /api/menus/m9': json({ ...created, hasLogo: false, logo: null, sections: [] }),
    });
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'New menu' }));
    const dialog = screen.getByRole('dialog', { name: 'New menu' });
    await user.type(within(dialog).getByLabelText('Menu name'), 'Winter');
    await user.click(within(dialog).getByRole('button', { name: 'Create menu' }));

    await waitFor(() => expect(location().pathname).toBe('/menus/m9'));
    expect(server.calls('POST', '/api/menus')[0].body).toEqual({ displayName: 'Winter' });
    expect(await screen.findByText('Created Winter')).toBeInTheDocument();
  });
});
