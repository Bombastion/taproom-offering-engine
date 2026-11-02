import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { breweries, menu } from '../fixtures';

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
    expect(screen.getByRole('link', { name: 'Menu board images' })).toHaveAttribute('href', '/menus/m1?format=digital');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Menus');
  });

  it('counts inactive items on a section, naming only the active ones', async () => {
    const sections = [
      { ...menu.sections[0], inactiveCount: 1, itemNames: ['Pils'] },
      { ...menu.sections[1], inactiveCount: 1, itemNames: [] },
      menu.sections[2],
    ];
    mockApi({ 'GET /api/menus/m1': json({ ...menu, sections }) });
    renderApp('/menus/m1');
    expect(await screen.findByRole('link', { name: /Drafts/ })).toHaveTextContent('Pils · 1 inactive');
    expect(screen.getByRole('link', { name: /Guest Taps/ })).toHaveTextContent('1 inactive');
    expect(screen.getByRole('link', { name: /Guest Taps/ })).not.toHaveTextContent('Empty');
  });

  it('notes which views a section is left off of', async () => {
    const sections = [{ ...menu.sections[0], hiddenOn: ['print'] }, { ...menu.sections[1], hiddenOn: ['print', 'board', 'widget'] }, menu.sections[2]];
    mockApi({ 'GET /api/menus/m1': json({ ...menu, sections }) });
    renderApp('/menus/m1');
    expect(await screen.findByRole('link', { name: /Drafts/ })).toHaveTextContent('Not on the print menu');
    expect(screen.getByRole('link', { name: /Guest Taps/ })).toHaveTextContent('Not on the print menu, menu board or website');
    expect(screen.getByRole('link', { name: /Empty/ })).not.toHaveTextContent('Not on');
  });

  it('only offers the menu board images when there is a logo to put on it', async () => {
    mockApi({ 'GET /api/menus/m1': json({ ...menu, hasLogo: false, logo: null }) });
    renderApp('/menus/m1');
    await screen.findByRole('heading', { name: 'Currently On Tap' });
    expect(screen.queryByRole('link', { name: 'Menu board images' })).not.toBeInTheDocument();
    expect(screen.getByText('No logo yet')).toBeInTheDocument();
  });

  it('offers the board designer, whether or not there is a logo', async () => {
    mockApi({ 'GET /api/menus/m1': json({ ...menu, hasLogo: false, logo: null }) });
    renderApp('/menus/m1');
    await screen.findByRole('heading', { name: 'Currently On Tap' });
    expect(screen.getByRole('link', { name: 'Design menu board' })).toHaveAttribute('href', '/menus/m1/design/board');
  });

  it('groups the chips into titled rows', async () => {
    mockApi({ 'GET /api/menus/m1': json(menu) });
    renderApp('/menus/m1');
    await screen.findByRole('heading', { name: 'Currently On Tap' });
    const names = (title: string) => [...screen.getByRole('region', { name: title }).querySelectorAll('.chip')].map((el) => el.textContent);
    expect(names('Menu management')).toEqual(['Rename', 'Reorder']);
    expect(names('Print menu')).toEqual(['Design print menu', 'Print view']);
    expect(names('Digital menu')).toEqual(['Design menu board', 'Menu board images']);
  });

  it('leaves out only the chips that do not apply, not their rows', async () => {
    mockApi({ 'GET /api/menus/m1': json({ ...menu, hasLogo: false, logo: null, sections: [menu.sections[0]] }) });
    renderApp('/menus/m1');
    await screen.findByRole('heading', { name: 'Currently On Tap' });
    expect(within(screen.getByRole('region', { name: 'Menu management' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Rename']);
    expect(within(screen.getByRole('region', { name: 'Digital menu' })).getAllByRole('link').map((b) => b.textContent)).toEqual(['Design menu board']);
  });

  describe('a row of chips that is wider than the screen', () => {
    // jsdom has no layout, so say how wide the row and what is in it are
    function size(row: HTMLElement, { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
      Object.defineProperty(row, 'scrollWidth', { configurable: true, value: scrollWidth });
      Object.defineProperty(row, 'clientWidth', { configurable: true, value: clientWidth });
      row.scrollBy = ((options: ScrollToOptions) => {
        row.scrollLeft += options.left ?? 0;
        fireEvent.scroll(row);
      }) as typeof row.scrollBy;
    }
    const rowOf = (title: string) => within(screen.getByRole('region', { name: title })).getByRole('button', { name: 'Rename' }).parentElement!;

    it('has no arrows when everything fits', async () => {
      mockApi({ 'GET /api/menus/m1': json(menu) });
      renderApp('/menus/m1');
      await screen.findByRole('heading', { name: 'Currently On Tap' });
      expect(screen.queryByRole('button', { name: /^Show (more|earlier)/ })).not.toBeInTheDocument();
    });

    it('shows an arrow toward what is out of sight, and scrolls that way when it is pressed', async () => {
      mockApi({ 'GET /api/menus/m1': json(menu) });
      renderApp('/menus/m1');
      await screen.findByRole('heading', { name: 'Currently On Tap' });
      const row = rowOf('Menu management');
      size(row, { scrollWidth: 600, clientWidth: 300 });

      fireEvent.scroll(row);
      const more = await screen.findByRole('button', { name: 'Show more Menu management options' });
      expect(screen.queryByRole('button', { name: 'Show earlier Menu management options' })).not.toBeInTheDocument();
      // Only the row that is too wide has one
      expect(screen.queryByRole('button', { name: /Print menu options/ })).not.toBeInTheDocument();

      fireEvent.click(more);
      // Now in the middle: more both ways
      expect(await screen.findByRole('button', { name: 'Show earlier Menu management options' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show more Menu management options' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Show more Menu management options' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more Menu management options' })).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Show earlier Menu management options' }));
      expect(row.scrollLeft).toBeLessThan(600 - 300);
    });
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

  describe('default brewery', () => {
    it('offers the breweries, with none chosen by default', async () => {
      mockApi({ 'GET /api/menus/m1': json(menu), 'GET /api/breweries': json(breweries) });
      renderApp('/menus/m1');
      const select = await screen.findByRole('combobox', { name: 'Default brewery' });
      await waitFor(() => expect(select).toBeEnabled());
      expect(select).toHaveValue('');
      expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['None — name every brewery', 'Example Brewery', 'Guest Co']);
      expect(screen.getByText(/left off the print view and menu board/)).toBeInTheDocument();
    });

    it("shows the menu's default brewery as chosen", async () => {
      mockApi({ 'GET /api/menus/m1': json({ ...menu, defaultBreweryId: 'b1' }), 'GET /api/breweries': json(breweries) });
      renderApp('/menus/m1');
      const select = await screen.findByRole('combobox', { name: 'Default brewery' });
      await waitFor(() => expect(select).toHaveValue('b1'));
    });

    it('saves a new default brewery, and None to go back to naming every brewery', async () => {
      let current = menu;
      const server = mockApi({
        'GET /api/menus/m1': () => json(current),
        'GET /api/breweries': json(breweries),
        'PATCH /api/menus/m1': ({ body }) => {
          const defaultBreweryId = (body as { defaultBreweryId: string | null }).defaultBreweryId;
          current = { ...menu, defaultBreweryId };
          return json({ id: 'm1', defaultBreweryId });
        },
      });
      const { user } = renderApp('/menus/m1');
      const select = await screen.findByRole('combobox', { name: 'Default brewery' });
      await waitFor(() => expect(select).toBeEnabled());

      await user.selectOptions(select, 'Example Brewery');
      expect(await screen.findByText('Example Brewery is now the default brewery')).toBeInTheDocument();
      expect(server.calls('PATCH', '/api/menus/m1')[0].body).toEqual({ defaultBreweryId: 'b1' });
      await waitFor(() => expect(select).toHaveValue('b1'));

      await user.selectOptions(select, 'None — name every brewery');
      expect(await screen.findByText('No default brewery')).toBeInTheDocument();
      expect(server.calls('PATCH', '/api/menus/m1')[1].body).toEqual({ defaultBreweryId: null });
      await waitFor(() => expect(select).toHaveValue(''));
    });

    it('says so, and keeps the old choice, when saving fails', async () => {
      mockApi({
        'GET /api/menus/m1': json({ ...menu, defaultBreweryId: 'b1' }),
        'GET /api/breweries': json(breweries),
        'PATCH /api/menus/m1': status(404, 'Brewery not found'),
      });
      const { user } = renderApp('/menus/m1');
      const select = await screen.findByRole('combobox', { name: 'Default brewery' });
      await waitFor(() => expect(select).toBeEnabled());
      await user.selectOptions(select, 'Guest Co');
      expect(await screen.findByText(/Couldn't save the default brewery/)).toBeInTheDocument();
      expect(select).toHaveValue('b1');
    });
  });
});
