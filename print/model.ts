import { v4 as uuidv4 } from 'uuid';
import { Brewery } from '../models/breweries';
import { ItemContainer } from '../models/containers';
import { Item } from '../models/items';
import { Menu, MenuItem } from '../models/menus';
import { DataProvider } from '../storage/providers';
import { breweryNameToShow, byOrder, subMenuShownOn } from '../routes/viewHelpers';

/*
Everything the print menu shows, gathered from the database into plain values. A design decides what
to do with it (which fields to print, in which columns); nothing here knows about looks.
*/

export interface PrintItem {
  // Null when the item has no brewery, or when it is the menu's default brewery (not named on this menu)
  breweryName: string | null;
  breweryLocation: string | null;
  displayName: string;
  style: string | null;
  abv: number | null;
  description: string | null;
  category: string | null;
  // The pictures an item might be shown with (bare base64), most specific first
  itemLogo: string | null;
  breweryLogo: string | null;
  // Pour size name -> price, already formatted ("8.00"); a size the item doesn't come in is absent
  prices: Map<string, string>;
}

// One pour size column on a section
export interface PrintSize {
  displayName: string;
  // Where it sits among the sizes (the pour size's configured order; unordered ones last)
  order: number;
  // The pour sizes behind this name (two with the same name share a column)
  containerIds: string[];
}

export interface PrintSection {
  id: string;
  name: string;
  sizes: PrintSize[];
  items: PrintItem[];
}

export interface PrintModel {
  menuName: string;
  menuLogo: string | null;
  sections: PrintSection[];
}

// Collects what the print view of a menu shows: the sections not hidden from it that have something
// active on them, each with its items in order and the pour sizes they are priced in.
export async function buildPrintModel(dataProvider: DataProvider, menu: Menu): Promise<PrintModel> {
  // The same item, brewery or pour size comes up many times in one menu
  const items = new Map<string, Item | null>();
  const breweries = new Map<string, Brewery | null>();
  const containers = new Map<string, ItemContainer | null>();
  const getItem = async (id: string) => {
    if (!items.has(id)) items.set(id, await dataProvider.getItem(id));
    return items.get(id)!;
  };
  const getBrewery = async (id: string) => {
    if (!breweries.has(id)) breweries.set(id, await dataProvider.getBrewery(id));
    return breweries.get(id)!;
  };
  const getContainer = async (id: string) => {
    if (!containers.has(id)) containers.set(id, await dataProvider.getContainer(id));
    return containers.get(id)!;
  };

  const subMenus = (await dataProvider.getSubMenusForMenu(menu.id!)).filter(subMenuShownOn('print')).sort(byOrder);
  const sections = new Map<string, PrintSection>();
  const sizeOrders = new Map<string, Map<string, PrintSize>>();
  for (const subMenu of subMenus) {
    sections.set(subMenu.id!, { id: subMenu.id!, name: subMenu.displayName ?? '', sizes: [], items: [] });
    sizeOrders.set(subMenu.id!, new Map());
  }

  // Sorted up front so each section's list ends up in its configured order
  const menuItems = (await dataProvider.getMenuItemsForMenu(menu.id!)).filter(MenuItem.isActive).sort(byOrder);
  for (const menuItem of menuItems) {
    // Items on a section that is left off the print view aren't needed
    const section = menuItem.subMenuId ? sections.get(menuItem.subMenuId) : undefined;
    if (!section) continue;
    const item = await getItem(menuItem.itemId!);
    if (!item) continue;

    // Not all items are associated with a brewery
    const brewery = item.breweryId ? await getBrewery(item.breweryId) : null;
    const showBrewery = breweryNameToShow(menu, brewery) !== null;

    const prices = new Map<string, string>();
    const sizes = sizeOrders.get(menuItem.subMenuId!)!;
    for (const saleContainer of await dataProvider.getSaleContainersForMenuItem(menuItem.id!)) {
      const container = await getContainer(saleContainer.containerId);
      if (!container) continue;
      // A pour size with no display name still needs a column of its own
      const name = container.displayName ? container.displayName : uuidv4();
      prices.set(name, saleContainer.price.toLocaleString('en-US', { minimumFractionDigits: 2 }));

      const order = container.order ? container.order : 999;
      const size = sizes.get(name);
      if (!size) {
        sizes.set(name, { displayName: name, order, containerIds: [saleContainer.containerId] });
      } else {
        size.order = Math.min(size.order, order);
        if (!size.containerIds.includes(saleContainer.containerId)) size.containerIds.push(saleContainer.containerId);
      }
    }

    section.items.push({
      breweryName: showBrewery ? brewery!.name : null,
      breweryLocation: showBrewery ? brewery!.location ?? null : null,
      displayName: item.displayName!,
      style: item.style ?? null,
      abv: item.abv ?? null,
      description: item.description ?? null,
      category: item.category ?? null,
      itemLogo: menuItem.itemLogo ?? null,
      breweryLogo: brewery?.defaultLogo ?? null,
      prices,
    });
  }

  const result: PrintSection[] = [];
  for (const subMenu of subMenus) {
    const section = sections.get(subMenu.id!)!;
    // Like the widget and menu board, leave out sections with nothing (active) on them
    if (section.items.length === 0) continue;
    section.sizes = [...sizeOrders.get(subMenu.id!)!.values()].sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName));
    result.push(section);
  }
  return { menuName: menu.displayName ?? '', menuLogo: menu.logo ?? null, sections: result };
}
