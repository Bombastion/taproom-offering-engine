import type { FontInfo, PrintDesign, PrintDesignState, TextStyle } from '../src/design';
import type { Brewery, BreweryDetail, Container, ContainerUse, LibraryItem, LibraryItemDetail, MenuDetail, MenuItemDetail, MenuSummary, SectionDetail } from '../src/api';

// Canned API responses shaped like routes/api.ts on the server

export const menus: MenuSummary[] = [
  { id: 'm1', displayName: 'Currently On Tap', internalName: 'on-tap', sectionCount: 2, itemCount: 3 },
  { id: 'm2', displayName: 'Patio', internalName: 'patio', sectionCount: 1, itemCount: 1 },
];

export const menu: MenuDetail = {
  id: 'm1',
  displayName: 'Currently On Tap',
  internalName: 'on-tap',
  hasLogo: true,
  logo: 'data:image/png;base64,abc',
  defaultBreweryId: null,
  sections: [
    { id: 's1', displayName: 'Drafts', internalName: 'on-tap-drafts', order: 1, hiddenOn: [], itemCount: 2, inactiveCount: 0, itemNames: ['Hazy Sequence', 'Pils'] },
    { id: 's2', displayName: 'Guest Taps', internalName: 'on-tap-guest', order: 2, hiddenOn: [], itemCount: 1, inactiveCount: 0, itemNames: ['Guest Sour'] },
    { id: 's3', displayName: 'Empty', internalName: 'on-tap-empty', order: 3, hiddenOn: [], itemCount: 0, inactiveCount: 0, itemNames: [] },
  ],
};

export const containers: Container[] = [
  { id: 'c1', displayName: 'Taster', containerName: 'Taster', order: 1, priceCount: 0 },
  { id: 'c2', displayName: 'Full Pour', containerName: 'Pint glass', order: 2, priceCount: 2 },
];

export const breweries: Brewery[] = [
  { id: 'b1', name: 'Zymos Brewing', location: 'Littleton, CO', hasLogo: false },
  { id: 'b2', name: 'Guest Co', location: null, hasLogo: true },
];

const hazy = {
  id: 'i1',
  displayName: 'Hazy Sequence',
  internalName: 'hazy-sequence',
  breweryId: 'b1',
  breweryName: 'Zymos Brewing',
  style: 'NEIPA',
  abv: 6.5,
  description: 'Juicy',
  category: 'beer',
};

export const section: SectionDetail = {
  id: 's1',
  displayName: 'Drafts',
  internalName: 'on-tap-drafts',
  hiddenOn: [],
  menu: { id: 'm1', displayName: 'Currently On Tap' },
  items: [
    {
      menuItemId: 'mi1',
      order: 1,
      active: true,
      item: hazy,
      pours: [
        { containerId: 'c1', displayName: 'Taster', order: 1, price: 3 },
        { containerId: 'c2', displayName: 'Full Pour', order: 2, price: 8.5 },
      ],
    },
    {
      menuItemId: 'mi2',
      order: 2,
      active: true,
      item: { ...hazy, id: 'i2', displayName: 'Pils', internalName: 'pils', style: 'Pilsner', abv: null, description: null },
      pours: [],
    },
  ],
};

export const menuItem: MenuItemDetail = {
  menuItemId: 'mi1',
  active: true,
  logo: null,
  logoFallback: 'brewery',
  section: { id: 's1', displayName: 'Drafts' },
  menu: { id: 'm1', displayName: 'Currently On Tap' },
  item: hazy,
  pours: [{ containerId: 'c2', displayName: 'Full Pour', order: 2, price: 8.5 }],
  otherPlacementCount: 2,
};

export const library: LibraryItem[] = [
  { id: 'i3', displayName: 'Guest Sour', internalName: 'guest-sour', breweryId: 'b2', breweryName: 'Guest Co', style: 'Sour', abv: 5.2 },
  { id: 'i1', displayName: 'Hazy Sequence', internalName: 'hazy-sequence', breweryId: 'b1', breweryName: 'Zymos Brewing', style: 'NEIPA', abv: 6.5 },
  { id: 'i4', displayName: 'Pretzel', internalName: 'pretzel', breweryId: null, breweryName: null, style: null, abv: null },
];

export const libraryItem: LibraryItemDetail = {
  ...hazy,
  placementCount: 2,
  placements: [
    { menuItemId: 'mi1', active: true, menuId: 'm1', menuName: 'Currently On Tap', sectionId: 's1', sectionName: 'Drafts' },
    { menuItemId: 'mi7', active: true, menuId: 'm2', menuName: 'Patio', sectionId: 's9', sectionName: 'Cans' },
  ],
};

export const unplacedItem: LibraryItemDetail = { ...libraryItem, id: 'i4', displayName: 'Pretzel', placementCount: 0, placements: [] };

export const fullPourUses: ContainerUse[] = [
  { menuItemId: 'mi1', active: true, menuId: 'm1', menuName: 'Currently On Tap', sectionId: 's1', sectionName: 'Drafts', itemName: 'Hazy Sequence', price: 8.5 },
  { menuItemId: 'mi7', active: true, menuId: 'm2', menuName: 'Patio', sectionId: 's9', sectionName: 'Cans', itemName: 'Hazy Sequence', price: 9 },
];

export const brewery: BreweryDetail = {
  id: 'b1',
  name: 'Zymos Brewing',
  location: 'Littleton, CO',
  logo: null,
  items: [{ id: 'i1', displayName: 'Hazy Sequence', style: 'NEIPA', abv: 6.5 }],
};

// Print menu designs, shaped like what routes/api.ts answers with (the standard design, in short)

const bodyText: TextStyle = { font: 'system-serif', sizePt: 12, weight: 400, italic: false, color: '#000000', align: 'left', transform: 'none', letterSpacingEm: 0, lineHeight: null };

export const printDesign: PrintDesign = {
  version: 1,
  page: { size: 'letter', marginsIn: { top: 0.5, right: 0.3, bottom: 0.75, left: 0.3 }, maxPages: 2, fit: 'shrink-to-pages', background: '#ffffff' },
  header: {
    logo: { show: true, maxWidthPct: 8, align: 'center', spaceBelowRem: 0 },
    title: { show: false, text: '{menu.name}', style: { ...bodyText, font: 'roboto', sizePt: 24, weight: 700, color: '#3f3f3f', align: 'center' } },
  },
  sections: {
    widthPct: 96,
    gapAboveRem: 0,
    heading: {
      style: { ...bodyText, font: 'roboto', sizePt: 18, weight: 700, color: '#3f3f3f', align: 'center' },
      box: {
        paddingRem: { top: 0.625, right: 0.625, bottom: 0.625, left: 0.625 },
        border: { widthPx: 3, style: 'solid', color: '#949494' },
        background: null,
        radiusPx: 0,
      },
    },
  },
  columns: [
    {
      id: 'item',
      type: 'fields',
      widthPct: 70,
      lines: [
        {
          style: bodyText,
          parts: [
            { field: 'breweryName', before: '', format: '{value}' },
            { field: 'displayName', before: ' • ', format: '{value}', style: { weight: 700 } },
            { field: 'style', before: ' • ', format: '{value}' },
            { field: 'abv', before: ' • ', format: '{value}% ABV' },
          ],
        },
      ],
      belowLines: [{ style: bodyText, parts: [{ field: 'description', before: '', format: '{value}' }] }],
    },
    {
      id: 'prices',
      type: 'prices',
      widthPct: null,
      sizeWidthPct: 25,
      sizes: 'all',
      heading: { show: true, style: { ...bodyText, weight: 700, align: 'center' } },
      cell: { style: { ...bodyText, align: 'center' }, format: '${value}' },
    },
  ],
  rows: { gapRem: 0, divider: { show: false, color: '#cccccc', widthPx: 1, style: 'solid' } },
  footer: {
    show: false,
    text: '',
    style: { ...bodyText, font: 'roboto', sizePt: 10, color: '#3f3f3f', align: 'center' },
    rule: { show: true, color: '#949494', widthPx: 1 },
    bottomIn: 0.3,
  },
};

export const defaultDesignState: PrintDesignState = { design: printDesign, isDefault: true, updatedAt: null };

export const savedDesignState: PrintDesignState = {
  design: { ...printDesign, footer: { ...printDesign.footer, show: true, text: 'WiFi: Zymos' } },
  isDefault: false,
  updatedAt: '2026-10-30T12:00:00.000Z',
};

export const designFonts: FontInfo[] = [
  { id: 'system-serif', label: 'Browser serif', category: 'system', weights: [400, 700], italic: true },
  { id: 'roboto', label: 'Roboto', category: 'sans', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], italic: true },
  { id: 'fira-sans', label: 'Fira Sans', category: 'sans', weights: [400, 500, 700], italic: true },
  { id: 'bebas-neue', label: 'Bebas Neue', category: 'display', weights: [400], italic: false },
];

export const previewPage = '<html><body><div id="menuRoot">Hazy Sequence</div></body></html>';
