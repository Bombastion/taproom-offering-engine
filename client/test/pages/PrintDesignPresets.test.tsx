import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { json, mockApi, renderApp } from '../utils';
import { containers, defaultDesignState, designFonts, menu, menus, previewPage, printDesign } from '../fixtures';
import { PrintDesign, setIn } from '../../src/design';

type Mock = ReturnType<typeof mockApi>;

// A preset that differs from the saved design in its look, and in the things a menu keeps for itself
let modern: PrintDesign = setIn(printDesign, ['sections', 'heading', 'style', 'sizePt'], 15);
modern = setIn(modern, ['sections', 'heading', 'style', 'transform'], 'uppercase');
modern = setIn(modern, ['footer', 'show'], true);
modern = setIn(modern, ['footer', 'text'], 'The preset’s footer');
modern = setIn(modern, ['header', 'title', 'show'], true);
modern = setIn(modern, ['header', 'title', 'text'], 'The preset’s title');
modern = setIn(modern, ['header', 'logo', 'show'], false);

const presets = [
  { id: 'classic', name: 'Classic', description: 'The print menu as it has always looked.', design: printDesign },
  { id: 'modern', name: 'Modern', description: 'Clean sans-serif type.', design: modern },
];

function designer(extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) {
  return mockApi({
    'GET /api/menus': json(menus),
    'GET /api/menus/m1': json(menu),
    'GET /api/design/fonts': json(designFonts),
    'GET /api/containers': json(containers),
    'GET /api/design/presets': json(presets),
    'GET /api/menus/m1/design/print': json({
      ...defaultDesignState,
      design: setIn(setIn(printDesign, ['footer', 'show'], true), ['footer', 'text'], 'Our own footer'),
      isDefault: false,
    }),
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

describe('presets', () => {
  it('are listed in a sheet, with what each looks like in words', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    const sheet = await screen.findByRole('dialog', { name: 'Start from a design' });
    expect(await screen.findByText('Clean sans-serif type.')).toBeInTheDocument();
    expect(sheet).toHaveTextContent('Classic');
    expect(sheet).toHaveTextContent('Modern');
  });

  it('change the look of the draft, and keep what belongs to this menu', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    await user.click(await screen.findByRole('button', { name: 'Use Modern' }));

    await waitFor(() => expect(lastDesign(server).sections.heading.style.sizePt).toBe(15));
    const design = lastDesign(server);
    expect(design.sections.heading.style.transform).toBe('uppercase');
    // The menu's own footer and the logo/title choices stay
    expect(design.footer.show).toBe(true);
    expect(design.footer.text).toBe('Our own footer');
    expect(design.header.logo.show).toBe(true);
    expect(design.header.title.show).toBe(false);
    expect(design.header.title.text).toBe('{menu.name}');
    expect(screen.queryByRole('dialog', { name: 'Start from a design' })).not.toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('can be undone', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    await user.click(await screen.findByRole('button', { name: 'Use Modern' }));
    await waitFor(() => expect(lastDesign(server).sections.heading.style.sizePt).toBe(15));

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(lastDesign(server).sections.heading.style.sizePt).toBe(18));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('are not saved until the design is', async () => {
    const { server, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    await user.click(await screen.findByRole('button', { name: 'Use Modern' }));
    expect(server.calls('PUT', '/api/menus/m1/design/print')).toHaveLength(0);
  });

  it('say so when they cannot be listed, and can be tried again', async () => {
    designer({ 'GET /api/design/presets': { status: 500, body: 'Nope' } });
    const { user } = renderApp('/menus/m1/design/print');
    await screen.findByTitle('Print menu preview');
    await user.click(screen.getByRole('button', { name: 'Presets' }));
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
