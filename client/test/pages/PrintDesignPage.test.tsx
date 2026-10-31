import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, mockApi, renderApp, status } from '../utils';
import { defaultDesignState, designFonts, menu, previewPage, printDesign, savedDesignState } from '../fixtures';
import { setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

// The server as the designer sees it: a menu, the fonts, the stored design and a preview page
function designer(overrides: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return mockApi({
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/menus/m1/design/print': json(defaultDesignState),
    'POST /api/menus/m1/design/print/preview': { text: previewPage },
    ...overrides,
  });
}

const previews = (server: Mock) => server.calls('POST', '/api/menus/m1/design/print/preview');
const lastPreviewDesign = (server: Mock) => (previews(server).at(-1)!.body as { design: typeof printDesign }).design;

async function open() {
  const view = renderApp('/menus/m1/design/print');
  // The heading is there at once; the controls and preview come with the design
  await screen.findByTitle('Print menu preview');
  return view;
}

// Types a new value into a labelled number box
async function typeInto(user: ReturnType<typeof renderApp>['user'], label: string, value: string) {
  const box = screen.getByLabelText(label);
  await user.clear(box);
  await user.type(box, value);
}

describe('PrintDesignPage', () => {
  it('shows the controls for the design the menu has', async () => {
    designer();
    await open();
    expect(screen.getByRole('combobox', { name: 'Font' })).toHaveValue('roboto');
    expect(screen.getByLabelText('Size')).toHaveValue(18);
    expect(screen.getByRole('combobox', { name: 'Weight' })).toHaveValue('700');
    expect(screen.getByLabelText('Color')).toHaveValue('#3f3f3f');
    expect(screen.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Border width')).toHaveValue(3);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Currently On Tap');
  });

  it('is reached from the menu', async () => {
    designer();
    renderApp('/menus/m1');
    expect(await screen.findByRole('link', { name: 'Design print menu' })).toHaveAttribute('href', '/menus/m1/design/print');
  });

  it('draws the preview in the sandboxed preview page, handing it the menu once it has loaded', async () => {
    const server = designer();
    await open();
    const frame = screen.getByTitle('Print menu preview') as HTMLIFrameElement;
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    expect(frame.getAttribute('src')).toMatch(/preview-frame\.html$/);

    await waitFor(() => expect(previews(server)).toHaveLength(1));
    expect(previews(server)[0].body).toEqual({ design: printDesign });

    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    await waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'toe-preview', html: previewPage }, '*'));
    expect(await screen.findByText('Preview is up to date')).toBeInTheDocument();
  });

  it('hands the menu over when it arrives after the preview page has loaded, too', async () => {
    designer();
    await open();
    const frame = screen.getByTitle('Print menu preview') as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    fireEvent.load(frame);
    expect(post).not.toHaveBeenCalled();
    await waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'toe-preview', html: previewPage }, '*'));
  });

  it('asks for a new preview, after a pause, when the design changes, and saves nothing', async () => {
    const server = designer();
    const { user } = await open();
    await waitFor(() => expect(previews(server)).toHaveLength(1));

    await typeInto(user, 'Size', '30');
    await waitFor(() => expect(previews(server).length).toBeGreaterThan(1));
    // Typing "30" is one change as far as the preview goes, not one for each key
    expect(previews(server)).toHaveLength(2);
    expect(lastPreviewDesign(server).sections.heading.style.sizePt).toBe(30);
    // Everything else is as it was
    expect(lastPreviewDesign(server)).toEqual(setIn(printDesign, ['sections', 'heading', 'style', 'sizePt'], 30));
    expect(server.calls('PUT', '/api/menus/m1/design/print')).toHaveLength(0);
  });

  it('only passes on values the server would accept, and puts the real one back when you leave the box', async () => {
    const server = designer();
    const { user } = await open();
    await waitFor(() => expect(previews(server)).toHaveLength(1));

    const size = screen.getByLabelText('Size');
    await user.clear(size);
    // Every length of what was typed is too small, so none of it is a design the server would take
    await user.type(size, '1');
    expect(size).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use 4 to 96')).toBeInTheDocument();
    await user.tab();
    expect(size).toHaveValue(18);
    expect(screen.queryByText('Use 4 to 96')).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(previews(server)).toHaveLength(1);
  });

  it('saves the whole design and says so', async () => {
    const changed = setIn(printDesign, ['sections', 'heading', 'style', 'sizePt'], 30);
    const server = designer({
      'PUT /api/menus/m1/design/print': () => ({ body: { design: changed, isDefault: false, updatedAt: '2026-10-31T12:00:00.000Z' } }),
    });
    const { user } = await open();
    expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled();

    await typeInto(user, 'Size', '30');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save design' }));

    expect(await screen.findByText('Design saved')).toBeInTheDocument();
    expect(server.calls('PUT', '/api/menus/m1/design/print')[0].body).toEqual({ design: changed });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled());
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    // What was saved is what is shown, and there is now a design to reset
    expect(screen.getByLabelText('Size')).toHaveValue(30);
    expect(screen.getByRole('button', { name: 'Reset to standard design' })).toBeInTheDocument();
  });

  it('keeps the changes, and says why, when the design cannot be saved', async () => {
    designer({ 'PUT /api/menus/m1/design/print': json({ error: 'The design has problems. footer.text: At most 4 lines', issues: [{ path: 'footer.text', message: 'At most 4 lines' }] }, 400) });
    const { user } = await open();
    await typeInto(user, 'Size', '30');
    await user.click(screen.getByRole('button', { name: 'Save design' }));
    expect(await screen.findByText("Couldn't save the design: The design has problems. footer.text: At most 4 lines")).toBeInTheDocument();
    expect(screen.getByLabelText('Size')).toHaveValue(30);
    expect(screen.getByRole('button', { name: 'Save design' })).toBeEnabled();
  });

  it('goes back to what is saved when changes are reverted', async () => {
    designer();
    const { user } = await open();
    await typeInto(user, 'Size', '30');
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(screen.getByRole('button', { name: 'Revert' }));
    expect(screen.getByLabelText('Size')).toHaveValue(18);
    expect(screen.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled();
  });

  it('is not dirty once a change has been changed back', async () => {
    designer();
    const { user } = await open();
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    expect(screen.getByRole('button', { name: 'Save design' })).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'Center' }));
    expect(screen.getByRole('button', { name: 'Save design' })).toBeDisabled();
  });

  it('only offers the weights a font has, and fits the style to a new font', async () => {
    const server = designer();
    const { user } = await open();
    const weights = within(screen.getByRole('combobox', { name: 'Weight' })).getAllByRole('option').map((o) => o.textContent);
    expect(weights).toEqual(['Thin (100)', 'Extra light (200)', 'Light (300)', 'Regular (400)', 'Medium (500)', 'Semibold (600)', 'Bold (700)', 'Extra bold (800)', 'Black (900)']);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Font' }), 'bebas-neue');
    expect(screen.getByRole('combobox', { name: 'Weight' })).toHaveValue('400');
    expect(within(screen.getByRole('combobox', { name: 'Weight' })).getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByRole('checkbox', { name: 'Italic' })).not.toBeInTheDocument();
    await waitFor(() => expect(previews(server).length).toBeGreaterThan(1));
    expect(lastPreviewDesign(server).sections.heading.style).toMatchObject({ font: 'bebas-neue', weight: 400, italic: false });
  });

  it('groups the fonts by kind', async () => {
    designer();
    await open();
    const groups = [...document.querySelectorAll('select optgroup')].map((g) => g.getAttribute('label'));
    expect(groups.slice(0, 3)).toEqual(['Browser', 'Sans-serif', 'Display']);
  });

  it('takes colors as hex, ignoring what is not one, and as the picker gives them', async () => {
    const server = designer();
    const { user } = await open();
    const color = screen.getByLabelText('Color');
    await user.clear(color);
    await user.type(color, '#12');
    expect(color).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use a color like #3f3f3f')).toBeInTheDocument();
    await user.type(color, '34AB');
    await waitFor(() => expect(previews(server).length).toBeGreaterThan(1));
    expect(lastPreviewDesign(server).sections.heading.style.color).toBe('#1234ab');
    expect(color).toHaveAttribute('aria-invalid', 'false');

    fireEvent.change(screen.getByLabelText('Pick color'), { target: { value: '#ff0000' } });
    await waitFor(() => expect(lastPreviewDesign(server).sections.heading.style.color).toBe('#ff0000'));
  });

  it('turns the heading fill on and off', async () => {
    const server = designer();
    const { user } = await open();
    expect(screen.queryByLabelText('Fill color')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Fill the heading with a color' }));
    expect(screen.getByLabelText('Fill color')).toHaveValue('#eeeeee');
    await waitFor(() => expect(lastPreviewDesign(server).sections.heading.box.background).toBe('#eeeeee'));
    await user.click(screen.getByRole('switch', { name: 'Fill the heading with a color' }));
    await waitFor(() => expect(lastPreviewDesign(server).sections.heading.box.background).toBeNull());
  });

  it('changes the border', async () => {
    const server = designer();
    const { user } = await open();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Border style' }), 'dashed');
    await typeInto(user, 'Border width', '5');
    await waitFor(() => expect(lastPreviewDesign(server).sections.heading.box.border).toMatchObject({ style: 'dashed', widthPx: 5 }));
  });

  describe('the footer', () => {
    it('has its controls once it is switched on', async () => {
      const server = designer();
      const { user } = await open();
      await user.click(screen.getByRole('button', { name: 'Footer' }));
      // Opening one group closes the other
      expect(screen.queryByRole('combobox', { name: 'Border style' })).not.toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Show a footer on every page' })).not.toBeChecked();
      expect(screen.queryByLabelText('Footer text')).not.toBeInTheDocument();

      await user.click(screen.getByRole('switch', { name: 'Show a footer on every page' }));
      await user.type(screen.getByLabelText('Footer text'), 'WiFi: Zymos');
      await waitFor(() => expect(lastPreviewDesign(server).footer).toMatchObject({ show: true, text: 'WiFi: Zymos' }));
      expect(screen.getByRole('combobox', { name: 'Font' })).toHaveValue('roboto');
    });

    it('shows what is saved, and can be turned off again', async () => {
      const server = designer({ 'GET /api/menus/m1/design/print': json(savedDesignState) });
      const { user } = await open();
      await user.click(screen.getByRole('button', { name: 'Footer' }));
      expect(screen.getByRole('switch', { name: 'Show a footer on every page' })).toBeChecked();
      expect(screen.getByLabelText('Footer text')).toHaveValue('WiFi: Zymos');
      await user.click(screen.getByRole('switch', { name: 'Show a footer on every page' }));
      expect(screen.queryByLabelText('Footer text')).not.toBeInTheDocument();
      await waitFor(() => expect(lastPreviewDesign(server).footer.show).toBe(false));
      // Turning it off keeps its text for turning it on again
      expect(lastPreviewDesign(server).footer.text).toBe('WiFi: Zymos');
    });

    it('warns about more lines than the footer can have', async () => {
      designer({ 'GET /api/menus/m1/design/print': json(savedDesignState) });
      const { user } = await open();
      await user.click(screen.getByRole('button', { name: 'Footer' }));
      const text = screen.getByLabelText('Footer text');
      await user.clear(text);
      await user.type(text, 'a{Enter}b{Enter}c{Enter}d{Enter}e');
      expect(screen.getByText('Use at most 4 lines.')).toBeInTheDocument();
      expect(text).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('when the preview cannot be made', () => {
    it('says what is wrong with the design', async () => {
      designer({
        'POST /api/menus/m1/design/print/preview': json({ error: 'The design has problems.', issues: [{ path: 'footer.text', message: 'At most 4 lines' }] }, 400),
      });
      await open();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent("The preview couldn't update.");
      expect(alert).toHaveTextContent('footer.text: At most 4 lines');
      // There is nothing earlier to fall back on
      expect(alert).not.toHaveTextContent('last version that worked');
    });

    it('keeps showing the last preview that worked', async () => {
      let calls = 0;
      const server = designer({
        'POST /api/menus/m1/design/print/preview': () => (++calls === 1 ? { text: previewPage } : { status: 500, text: 'boom' }),
      });
      const { user } = await open();
      await screen.findByText('Preview is up to date');
      await typeInto(user, 'Size', '30');
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Something went wrong on the server');
      expect(alert).toHaveTextContent('Showing the last version that worked.');
      expect(previews(server)).toHaveLength(2);
      expect(screen.getByTitle('Print menu preview')).toBeInTheDocument();
    });

    it('recovers when the next design is fine', async () => {
      let calls = 0;
      designer({
        'POST /api/menus/m1/design/print/preview': () => (++calls === 2 ? { status: 400, text: 'No' } : { text: previewPage }),
      });
      const { user } = await open();
      await screen.findByText('Preview is up to date');
      await typeInto(user, 'Size', '30');
      await screen.findByRole('alert');
      await typeInto(user, 'Size', '31');
      expect(await screen.findByText('Preview is up to date')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('resetting', () => {
    it('is only offered for a menu with a design of its own', async () => {
      designer();
      await open();
      expect(screen.queryByRole('button', { name: 'Reset to standard design' })).not.toBeInTheDocument();
    });

    it('removes the saved design after asking, warning that the standard one has no footer', async () => {
      let reset = false;
      const server = designer({
        'GET /api/menus/m1/design/print': () => json(reset ? defaultDesignState : savedDesignState),
        'DELETE /api/menus/m1/design/print': () => {
          reset = true;
          return status(204);
        },
      });
      const { user } = await open();
      await user.click(screen.getByRole('button', { name: 'Reset to standard design' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('has no footer');
      expect(server.calls('DELETE', '/api/menus/m1/design/print')).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Reset design' }));
      expect(await screen.findByText('Back to the standard design')).toBeInTheDocument();
      expect(server.calls('DELETE', '/api/menus/m1/design/print')).toHaveLength(1);
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Reset to standard design' })).not.toBeInTheDocument());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('can be backed out of', async () => {
      const server = designer({ 'GET /api/menus/m1/design/print': json(savedDesignState) });
      const { user } = await open();
      await user.click(screen.getByRole('button', { name: 'Reset to standard design' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(server.calls('DELETE', '/api/menus/m1/design/print')).toHaveLength(0);
    });
  });

  it('says when the saved design could not be read', async () => {
    designer({ 'GET /api/menus/m1/design/print': json({ ...defaultDesignState, storedDesignInvalid: true }) });
    await open();
    expect(screen.getByText(/couldn't be read, so the standard design is shown/)).toBeInTheDocument();
  });

  it('links to the saved print view', async () => {
    designer();
    await open();
    expect(screen.getByRole('link', { name: 'Saved print view' })).toHaveAttribute('href', '/menus/m1?format=print');
  });

  it('shows an error for a menu that does not exist', async () => {
    mockApi({
      'GET /api/menus/nope': status(404, 'Menu not found'),
      'GET /api/design/fonts': json(designFonts),
      'GET /api/menus/nope/design/print': status(404, 'Menu not found'),
    });
    renderApp('/menus/nope/design/print');
    expect(await screen.findByRole('alert')).toHaveTextContent('Menu not found');
  });
});
