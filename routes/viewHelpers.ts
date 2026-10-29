import { Brewery } from '../models/breweries';
import { Menu, MenuView, SubMenu } from '../models/menus';

// Small rules shared by the public menu views (print, menu board, widget).

// Sorts sections and items by their configured order, with unordered ones last. The data
// providers don't guarantee any order (Prisma returns rows however Postgres likes), so every
// view sorts for itself.
export function byOrder(a: { order: number | null }, b: { order: number | null }): number {
  if (a.order === null && b.order === null) return 0;
  if (a.order === null) return 1;
  if (b.order === null) return -1;
  return a.order - b.order;
}

// For filtering a menu's sections down to the ones that show on a view (see SubMenu.hiddenOn)
export const subMenuShownOn = (view: MenuView) => (subMenu: SubMenu) => SubMenu.isShownOn(subMenu, view);

// The brewery's name as it should be shown on this menu: not at all for the menu's default
// brewery (see Menu.defaultBreweryId) or for an item with no brewery
export function breweryNameToShow(menu: Menu, brewery: Brewery | null | undefined): string | null {
  if (!brewery || (menu.defaultBreweryId && brewery.id === menu.defaultBreweryId)) {
    return null;
  }
  return brewery.name;
}
