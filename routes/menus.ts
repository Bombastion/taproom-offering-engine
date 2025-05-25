import { Request, Response } from 'express';
import Routes from './common';
import { Item } from '../models/items';
import { MenuItem } from '../models/menus';


export class MenusRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/:menuId", (req: Request, res: Response) => {
      const result = this.dataProvider.getMenu(parseInt(req.params.menuId))

      if (result === null) {
        res.sendStatus(404);
        return
      }


      if (req.query.format === "json" || req.query.format === undefined) {
        if (result !== null) {
          res.send(result);
          return
        }
      }
      if (req.query.format === "print") {
        const allItemsForMenu = this.dataProvider.getMenuItemsForMenu(result.id);
        const itemsForDisplay: Array<any> = []
        allItemsForMenu.forEach((menuItem: MenuItem) => {
          const item = this.dataProvider.getItem(menuItem.itemId)!;
          let brewery = null;
          if (item.breweryId !== null) {
            brewery = this.dataProvider.getBrewery(item.breweryId);
          }
          itemsForDisplay.push({ "breweryName": brewery?.name, "displayName": item.displayName, "style": item.style, "abv": item.abv, "description": item.description })
        });
        res.render('printMenu', { menuTitle: result.displayName, menuItems: itemsForDisplay });
        return
      }
      
      res.sendStatus(400);
      return
    });
  }
}

export class SubMenusRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/:menuId", (req: Request, res: Response) => {
      const result = this.dataProvider.getSubMenu(parseInt(req.params.menuId))
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
  }
}

export class MenuItemsRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/:itemId", (req: Request, res: Response) => {
      const result = this.dataProvider.getMenuItem(parseInt(req.params.itemId))
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
  }
}
