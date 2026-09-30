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
  sections: [
    { id: 's1', displayName: 'Drafts', internalName: 'on-tap-drafts', order: 1, itemCount: 2, itemNames: ['Hazy Sequence', 'Pils'] },
    { id: 's2', displayName: 'Guest Taps', internalName: 'on-tap-guest', order: 2, itemCount: 1, itemNames: ['Guest Sour'] },
    { id: 's3', displayName: 'Empty', internalName: 'on-tap-empty', order: 3, itemCount: 0, itemNames: [] },
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
  menu: { id: 'm1', displayName: 'Currently On Tap' },
  items: [
    {
      menuItemId: 'mi1',
      order: 1,
      item: hazy,
      pours: [
        { containerId: 'c1', displayName: 'Taster', order: 1, price: 3 },
        { containerId: 'c2', displayName: 'Full Pour', order: 2, price: 8.5 },
      ],
    },
    {
      menuItemId: 'mi2',
      order: 2,
      item: { ...hazy, id: 'i2', displayName: 'Pils', internalName: 'pils', style: 'Pilsner', abv: null, description: null },
      pours: [],
    },
  ],
};

export const menuItem: MenuItemDetail = {
  menuItemId: 'mi1',
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
    { menuItemId: 'mi1', menuId: 'm1', menuName: 'Currently On Tap', sectionId: 's1', sectionName: 'Drafts' },
    { menuItemId: 'mi7', menuId: 'm2', menuName: 'Patio', sectionId: 's9', sectionName: 'Cans' },
  ],
};

export const unplacedItem: LibraryItemDetail = { ...libraryItem, id: 'i4', displayName: 'Pretzel', placementCount: 0, placements: [] };

export const fullPourUses: ContainerUse[] = [
  { menuItemId: 'mi1', menuId: 'm1', menuName: 'Currently On Tap', sectionId: 's1', sectionName: 'Drafts', itemName: 'Hazy Sequence', price: 8.5 },
  { menuItemId: 'mi7', menuId: 'm2', menuName: 'Patio', sectionId: 's9', sectionName: 'Cans', itemName: 'Hazy Sequence', price: 9 },
];

export const brewery: BreweryDetail = {
  id: 'b1',
  name: 'Zymos Brewing',
  location: 'Littleton, CO',
  logo: null,
  items: [{ id: 'i1', displayName: 'Hazy Sequence', style: 'NEIPA', abv: 6.5 }],
};
