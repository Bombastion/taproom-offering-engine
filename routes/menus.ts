import { Request, Response } from 'express';
import Routes from './common';
import {v4 as uuidv4} from 'uuid';
import { Item } from '../models/items';
import { DisplayItem, DisplaySubMenu, Menu, MenuItem, SubMenu } from '../models/menus';
import { Brewery } from '../models/breweries';
import { ItemContainer } from '../models/containers';
import pdfkit from 'pdfkit';
import fs from 'fs';
import { DataProvider } from '../storage/providers';


export class MenusRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"internalName": "string", "displayName": "string"};

  registerRoutes(): void {
    this.router.get("/manage", async (_: Request, res: Response) => {
      const displayList = await this.dataProvider.getMenus();
      res.render("menuList", {displayList: displayList})
      return;
    });

    this.router.get("/:menuId/submenus/manage", async (req: Request, res: Response) => {
      const menu = await this.dataProvider.getMenu(req.params.menuId);
      const displayList = await this.dataProvider.getSubMenusForMenu(menu?.id!);
      res.render("subMenuList", {displayList: displayList, menuId: menu?.id!})
      return;
    });

    const initMenuBoardPage = (doc: pdfkit, logoBase64: string, docWidth: number, docHeight: number, backgroundColor: string, imageWidth: number, imageHeight: number) => {
        // First, paint the background
        doc.rect(0, 0, docWidth, docHeight).fill(backgroundColor);
        const menuLogo = Buffer.from(logoBase64, 'base64');
        doc.image(menuLogo, docWidth/2 - imageWidth/2, 0, {width: imageWidth, height: imageHeight});
    }

    const generateMenuBoardPdf = (res: Response, dataProvider: DataProvider, mainMenu: Menu) => {
      return new Promise(async (resolve, reject) => {
        // Get all the sub-menus for this menu
        const allSubMenus = (await this.dataProvider.getSubMenusForMenu(mainMenu.id!!)).sort((a, b) => {
          if(a.order === null && b.order === null) {
            return 0
          } else {
            if (a.order === null) {
              return 1
            }
            if (b.order === null) {
              return -1
            }
            if (a.order < b.order) {
              return -1
            }
            if (b.order < a.order) {
              return 1
            }
            return 0
          }
        }); 

        // Set response headers
        res.setHeader('Content-type', 'application/pdf');
        // Use 'attachment' to force download, 'inline' to display in browser
        res.setHeader('Content-disposition', 'attachment; filename=test.pdf')

        // Create a document
        const docWidth = 1080
        const docHeight = 1920
        const doc = new pdfkit({size: [docWidth, docHeight]});
        doc.pipe(res);

        // Declaring some colors for the menu
        const zymosBlue = '#175a6c' // Be it forever known
        const submenuBackground = '#2b2b2b'
        const submenuHeaderFontColor = '#ffffff'
        const submenuItemFontColor = '#f3f3f3'
        const submenuItemStyleFontColor = '#9D9D9D'


        // Add header logo
        const imageHeight = 150;
        const imageWidth = 150;
        initMenuBoardPage(doc, mainMenu.logo!!, docWidth, docHeight, zymosBlue, imageHeight, imageHeight);
        const menuLogo = Buffer.from(mainMenu.logo!!, 'base64');
        doc.image(menuLogo, docWidth/2 - imageWidth/2, 0, {width: imageWidth, height: imageHeight});

        const fontFolderRoot = 'dist/public/fonts'

        const standardBuffer = 10;
        const headerBuffer = 5;
        const backgroundHeight = 50
        const itemLogoDimensions = 50
        var totalHeightSoFar = imageHeight
        // Render the submenus
        for (const submenu of allSubMenus) {
          // Draw the background for the header
          doc.rect(standardBuffer, totalHeightSoFar + standardBuffer, docWidth - 2 * standardBuffer, backgroundHeight).fill(submenuBackground);
          doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).
            fontSize(backgroundHeight - (2 * headerBuffer)).
            fillColor(submenuHeaderFontColor).
            text(submenu.displayName, standardBuffer + headerBuffer, totalHeightSoFar + standardBuffer + (headerBuffer/2));
          // Update the height for the text displayed
          totalHeightSoFar = totalHeightSoFar + standardBuffer  + backgroundHeight

          // For each item in the submenu, render the details
          const menuItemsForSubmenu = await dataProvider.getMenuItemsForSubMenu(submenu.id!!)
          for (const menuItem of menuItemsForSubmenu){
            const itemDetails = await dataProvider.getItem(menuItem.itemId!!)
            // Get the logo for the font
            // TODO: This should be from the brewery if it's not provided
            var itemLogo;
            if (menuItem.itemLogo == null){
              itemLogo = menuLogo;
            } else {
              itemLogo = Buffer.from(menuItem.itemLogo, 'base64')
            }
            // Remember the current state, draw a circle, and crop the logo to it
            doc.save()
            doc.circle(standardBuffer + itemLogoDimensions/2, totalHeightSoFar + standardBuffer + itemLogoDimensions/2, itemLogoDimensions/2).clip();
            doc.image(itemLogo, standardBuffer, totalHeightSoFar + standardBuffer, {height: itemLogoDimensions, width: itemLogoDimensions});
            doc.restore();

            // Precalculate the height of the text and determine if we need to start a new page
            const nextWidthStart = standardBuffer + itemLogoDimensions + standardBuffer;
            const nextHeightStart = totalHeightSoFar + standardBuffer/2;
            
            const breweryForItem = await dataProvider.getBrewery(itemDetails?.breweryId!!);
            const itemName = `${breweryForItem?.name} ${itemDetails?.displayName}`
            const itemStyle = itemDetails?.style
            const itemDisplay = `${itemName}  ${itemStyle}`


            const nextHeight = doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).
              fontSize(itemLogoDimensions).heightOfString(itemDisplay, nextWidthStart, nextHeightStart)
            console.log(totalHeightSoFar);
            console.log(totalHeightSoFar + nextHeight);
            if (totalHeightSoFar + nextHeight > docHeight) {
              doc.addPage({size: [docWidth, docHeight]})
              initMenuBoardPage(doc, mainMenu.logo!!, docWidth, docHeight, zymosBlue, imageHeight, imageHeight);
            }

            // Describe the actual beer
            doc.save()
            doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).
              fontSize(itemLogoDimensions).
              fillColor(submenuItemFontColor).
              text(itemName, nextWidthStart, nextHeightStart, { continued: true });
            doc.
              fillColor(submenuItemStyleFontColor).
              text("  " + itemDetails?.style);
            doc.restore();

            totalHeightSoFar = totalHeightSoFar + nextHeight + standardBuffer
          }
        };

        doc.end();

        // Wait for the stream to finish before resolving
        res.on('finish', resolve);
        res.on('error', reject);
      });
    };

    this.router.get("/:menuId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getMenu(req.params.menuId)

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
      if (req.query.format === "digital") {
        // Basically just need to wrap this since some PdfKit functions are shadow async
        await (generateMenuBoardPdf(res, this.dataProvider, result));
        return
      } 
      if (req.query.format === "print") {
        // Get all the sub-menus for this menu
        const allSubMenus = await this.dataProvider.getSubMenusForMenu(result.id!);

        // Initialize a map we can add things to
        const subMenuToItemMap: Map<string, Array<DisplayItem>> = new Map();
        const subMenuToContainerDisplayNameToOrder: Map<string, Map<string, number>> = new Map();
        allSubMenus.forEach((subMenu: SubMenu) => {
          subMenuToItemMap.set(subMenu.id!, []);
          subMenuToContainerDisplayNameToOrder.set(subMenu.id!, new Map());
        })

        // Create DisplayItems for each MenuItem and add it to the appropriate map
        // Also gathers all container display info for submenus during the loop
        const allItemsForMenu = await this.dataProvider.getMenuItemsForMenu(result.id!);
        for (const menuItem of allItemsForMenu) {
          const item = (await this.dataProvider.getItem(menuItem.itemId!))!;

          // Not all items are associated with a brewery
          let brewery: Brewery | null = null;
          if (item.breweryId !== null) {
            brewery = await this.dataProvider.getBrewery(item.breweryId);
          }
          
          // Gather all the container names for this item
          const allSaleContainersForItem = await this.dataProvider.getSaleContainersForMenuItem(menuItem.id!);
          const containerDisplayNameToPrice: Map<string, string> = new Map();
          for (const saleContainer of allSaleContainersForItem) {
            const containerInfo = (await this.dataProvider.getContainer(saleContainer.containerId))!!;
            const workingDisplayName = containerInfo.displayName ? containerInfo.displayName : uuidv4();
            containerDisplayNameToPrice.set(workingDisplayName, saleContainer.price.toLocaleString('en-US', { minimumFractionDigits: 2}));

            // Get the top level display names and orders for the sub menu we're on
            let displayNameToOrder = null;
            if (Boolean(menuItem.subMenuId)) {
              displayNameToOrder = subMenuToContainerDisplayNameToOrder.get(menuItem.subMenuId!)!;
            } 
            
            if (displayNameToOrder !== null) {
              const workingOrder = containerInfo.order ? containerInfo.order : 999;
              const existingOrderForDisplayName = displayNameToOrder.get(workingDisplayName);
              if (!existingOrderForDisplayName || existingOrderForDisplayName > workingOrder) {
                displayNameToOrder.set(workingDisplayName, workingOrder);
              }
            }
          };

          const displayItem = new DisplayItem(brewery ? brewery!.name : null, item.displayName!, item.style, item.abv, item.description, menuItem.order, containerDisplayNameToPrice);
          if (menuItem.subMenuId) {
            subMenuToItemMap.get(menuItem.subMenuId)?.push(displayItem);
          } 
        };

        // For each submenu, gather all the price options
        const displaySubMenus: Array<DisplaySubMenu> = [];
        allSubMenus.forEach((menu: SubMenu) => {
          const displayNameToOrder = subMenuToContainerDisplayNameToOrder.get(menu.id!)!;
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
    this.router.post("/", async (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      const menu = new Menu(null, req.body.internalName, req.body.displayName, req.body.logo);
      const result = await this.dataProvider.addMenu(menu);

      res.send(result);
    });

    // Update an existing menu
    this.router.patch("/:menuId", async (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }
        const result = await this.dataProvider.updateMenu(req.params.menuId, new Menu(null, req.body.internalName, req.body.displayName, req.body.logo));
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
  requiredFieldsAndTypes: Record<string, string> = {"internalName": "string", "displayName": "string"};

  registerRoutes(): void {
    this.router.get("/:itemId/items/manage", async (req: Request, res: Response) => {
      const subMenuId = req.params.itemId;
      const displayList = await this.dataProvider.getMenuItemsForSubMenu(subMenuId);
      const subMenu = await this.dataProvider.getSubMenu(subMenuId);
      const menu = await this.dataProvider.getMenu(subMenu?.menuId!);
      const allItems = await this.dataProvider.getItems();
      const itemMap = new Map<string, Item>();
      for (const item of allItems) {
        itemMap.set(item.id!, item);
      }
      res.render("menuItemList", {displayList: displayList, subMenu: subMenu, itemMap: Object.fromEntries(itemMap), parentMenu: menu});
      return;
    });

    this.router.get("/:menuId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getSubMenu(req.params.menuId);
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });

    this.router.post("/:menuId/menuItems/:itemId", async (req: Request, res: Response) => {
      const subMenu = await this.dataProvider.getSubMenu(req.params.menuId);
      if (subMenu !== null) {
        const menuItemToAdd = new MenuItem(null, subMenu.menuId!, req.params.itemId, subMenu.id, null, null);
        await this.dataProvider.addMenuItem(menuItemToAdd);
        res.status(201).send(menuItemToAdd);
        return;
      }
      res.sendStatus(400);
      return;
    });

    this.router.delete("/:menuId/menuItems/:itemId", async (req: Request, res: Response) => {
      const subMenu = await this.dataProvider.getSubMenu(req.params.menuId);
      if (subMenu !== null) {
        await this.dataProvider.removeMenuItem(req.params.itemId);
        res.sendStatus(204);
        return;
      }
      res.sendStatus(400);
      return;
    });

    // Creates a new submenu
    this.router.post("/", async (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      const menuId = req.body.menuId;
      const order = req.body.order? parseInt(req.body.order) : null;
      const submenu = new SubMenu(null, req.body.internalName, req.body.displayName, menuId, order);
      const result = await this.dataProvider.addSubMenu(submenu)

      res.send(result);
    });

    // Update an existing submenu
    this.router.patch("/:menuId", async (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }

        const menuId = req.body.menuId;
        const order = req.body.order? parseInt(req.body.order) : null;
        const submenu = new SubMenu(null, req.body.internalName, req.body.displayName, menuId, order);
        const result = await this.dataProvider.updateSubMenu(req.params.menuId, submenu);
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

export class MenuItemsRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/:itemId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getMenuItem(req.params.itemId);
      if (result !== null) {
        res.send(result);
        return;
      }
      res.sendStatus(404);
      return;
    });

    this.router.get("/:itemId/manage", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getMenuItem(req.params.itemId);
      const itemForMenuItem = await this.dataProvider.getItem(result?.itemId!);
      const subMenu = await this.dataProvider.getSubMenu(result?.subMenuId!);
      const parentMenu = await this.dataProvider.getMenu(subMenu?.menuId!);
      const containersList = await this.dataProvider.getSaleContainersForMenuItem(result?.id!);
      const allContainers = await this.dataProvider.getContainers();
      const containerMap = new Map<string, ItemContainer>();
      for (const container of allContainers) {
        containerMap.set(container.id!, container);
      }
      if (result !== null) {
        res.render("menuItemDetails", {menuItem: result, itemDetails: itemForMenuItem, subMenu: subMenu, parentMenu: parentMenu, containersList: containersList, containerDetailMap: Object.fromEntries(containerMap)});
        return;
      }
      res.sendStatus(404);
      return;
    });

    this.router.patch("/:itemId", async (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }
        const order = req.body.order? parseInt(req.body.order) : null;
        const result = await this.dataProvider.updateMenuItem(req.params.itemId, new MenuItem(null, null, null, null, req.body.itemLogoB64, order));
        if (result !== null) {
          res.send(result);
          return;
        }
        res.status(400);
        res.send("Invalid Argument");
        return;
      } catch(e: any) {
        const statusCode = "statusCode" in e ? e["statusCode"] : 500;
        const message = "message" in e ? e["message"] : "Unexpected error occurred";
        res.status(statusCode);
        res.send(message);
        return;
      }
    });
  }
}
