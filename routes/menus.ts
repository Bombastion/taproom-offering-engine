import { Request, Response } from 'express';
import Routes from './common';
import {v4 as uuidv4} from 'uuid';
import { Item } from '../models/items';
import { DisplayItem, DisplaySubMenu, Menu, MenuItem, SubMenu } from '../models/menus';
import { Brewery } from '../models/breweries';


export class MenusRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"internalName": "string", "displayName": "string"};

  registerRoutes(): void {
    this.router.get("/manage", (_req: Request, res: Response) => {
      const displayList = this.dataProvider.getMenus();
      res.render("menuList", {displayList: displayList})
      return;
    });

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
        // Get all the sub-menus for this menu
        const allSubMenus = this.dataProvider.getSubMenusForMenu(result.id!);
        // Add a fake sub-menu for anything that was uncategorized
        allSubMenus.push(new SubMenu(-1, "uncategorized", "uncategorized", result.id!, -1));

        // Initialize a map we can add things to
        const subMenuToItemMap: Map<number, Array<DisplayItem>> = new Map();
        const subMenuToContainerDisplayNameToOrder: Map<number, Map<string, number>> = new Map();
        allSubMenus.forEach((subMenu: SubMenu) => {
          subMenuToItemMap.set(subMenu.id, []);
          subMenuToContainerDisplayNameToOrder.set(subMenu.id, new Map());
        })

        // Create DisplayItems for each MenuItem and add it to the appropriate map
        // Also gathers all container display info for submenus during the loop
        const allItemsForMenu = this.dataProvider.getMenuItemsForMenu(result.id!);
        allItemsForMenu.forEach((menuItem: MenuItem) => {
          const item = this.dataProvider.getItem(menuItem.itemId)!;

          // Not all items are associated with a brewery
          let brewery: Brewery | null = null;
          if (item.breweryId !== null) {
            brewery = this.dataProvider.getBrewery(item.breweryId);
          }
          
          // Gather all the container names for this item
          const allSaleContainersForItem = this.dataProvider.getSaleContainersForItem(item.id!);
          const containerDisplayNameToPrice: Map<string, string> = new Map();
          allSaleContainersForItem.forEach(saleContainer => {
            const containerInfo = this.dataProvider.getContainer(saleContainer.containerId)!;
            const workingDisplayName = containerInfo.displayName ? containerInfo.displayName : uuidv4();
            containerDisplayNameToPrice.set(workingDisplayName, saleContainer.price.toLocaleString('en-US', { minimumFractionDigits: 2}));

            // Get the top level display names and orders for the sub menu we're on
            let displayNameToOrder;
            if (Boolean(menuItem.subMenuId)) {
              displayNameToOrder = subMenuToContainerDisplayNameToOrder.get(menuItem.subMenuId!)!;
            } else {
              displayNameToOrder = subMenuToContainerDisplayNameToOrder.get(-1)!;
            }

            const workingOrder = containerInfo.order ? containerInfo.order : 999;
            const existingOrderForDisplayName = displayNameToOrder.get(workingDisplayName);
            if (!existingOrderForDisplayName || existingOrderForDisplayName > workingOrder) {
              displayNameToOrder.set(workingDisplayName, workingOrder);
            }
          });

          const displayItem = new DisplayItem(brewery ? brewery!.name : null, item.displayName!, item.style, item.abv, item.description, menuItem.order, containerDisplayNameToPrice);
          if (menuItem.subMenuId) {
            subMenuToItemMap.get(menuItem.subMenuId)?.push(displayItem);
          } else {
            subMenuToItemMap.get(-1)!.push(displayItem);
          }
        });

        // For each submenu, gather all the price options
        const displaySubMenus: Array<DisplaySubMenu> = [];
        allSubMenus.forEach((menu: SubMenu) => {
          const displayNameToOrder = subMenuToContainerDisplayNameToOrder.get(menu.id)!;
          const displayNameAndOrderObjects: Array<{ displayName: string, order: number }> = []
          displayNameToOrder.forEach((order, displayName) => {
            displayNameAndOrderObjects.push({ "displayName": displayName, "order": order });
          });
          displayNameAndOrderObjects.sort((a, b) => {
            const orderResult = a.order - b.order;
            if(orderResult !==0) {
              return orderResult;
            }
            return a.displayName.localeCompare(b.displayName);
          });

          const displayNames: Array<string> = []
          displayNameAndOrderObjects.forEach(displayNameAndOrder => {
            displayNames.push(displayNameAndOrder.displayName);
          });

          displaySubMenus.push(new DisplaySubMenu(menu, displayNames));
        });

        res.render('printMenu', { menuLogo: result.logo, menuTitle: result.displayName, allDisplaySubMenus: displaySubMenus, subMenuToItemMap: subMenuToItemMap });
        return
      }
      
      res.sendStatus(400);
      return
    });

    // Creates a new menu
    this.router.post("/", (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      const menu = new Menu(null, req.body.internalName, req.body.displayName, req.body.logo);
      const result = this.dataProvider.addMenu(menu);

      res.send(result);
    });

    // Update an existing container
    this.router.patch("/:menuId", (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }
        const result = this.dataProvider.updateMenu(parseInt(req.params.menuId), new Menu(null, req.body.internalName, req.body.displayName, req.body.logo));
        if (result !== null) {
          res.send(result);
          return;
        }
        res.status(400);
        res.send("Invalid Argument");
        return
      } catch(e: any) {
        const statusCode = "statusCode" in e ? e["statusCode"] : 500;
        const message = "message" in e ? e["message"] : "Unexpected error occurred";
        res.status(statusCode);
        res.send(message);
      }
      
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
