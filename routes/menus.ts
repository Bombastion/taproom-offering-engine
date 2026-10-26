import { Request, Response } from 'express';
import Routes from './common';
import {v4 as uuidv4} from 'uuid';
import { Item } from '../models/items';
import { DisplayItem, DisplaySubMenu, Menu, MenuItem, SubMenu } from '../models/menus';
import { Brewery } from '../models/breweries';
import pdfkit from 'pdfkit';
import fs from 'fs';
import { DataProvider } from '../storage/providers';
import { pageFileName, pdfToPngs, zipPages } from './menuBoardImages';

// Sorts sections and items by their configured order, with unordered ones last. The data
// providers don't guarantee any order (Prisma returns rows however Postgres likes), so every
// view sorts for itself.
function byOrder(a: { order: number | null }, b: { order: number | null }): number {
  if (a.order === null && b.order === null) return 0;
  if (a.order === null) return 1;
  if (b.order === null) return -1;
  return a.order - b.order;
}

// The menu board is a portrait 1080x1920 picture, one image per page.
const BOARD_WIDTH = 1080;
const BOARD_HEIGHT = 1920;
// TVs crop and distort the edges of the picture, so nothing but background is drawn within this
// many pixels of any edge of each image. Raise it if the TV still clips the board.
export const BOARD_SAFE_MARGIN = 40;
// Scales the section header bars, item thumbnails and all the text on the board (1.05 = 5% bigger).
// The menu logo at the top isn't affected.
export const BOARD_SIZE_SCALE = 1.05;
// Extra space, in pixels, between the last item of one section and the next section's header bar.
export const BOARD_SECTION_GAP = 30;

// The public, read-only menu formats (no login): the raw menu as JSON, the nested JSON the Wix
// widget polls (?format=widget), the printable HTML menu (?format=print) and the menu board images
// (?format=digital: a ZIP of one PNG per page, or a single PNG with &page=N). All editing goes
// through the admin JSON API in api.ts.
//
// Inactive menu items (see MenuItem.active) are left out of all of these, and a section with no
// active items is skipped entirely.
export class MenusRoutes extends Routes {
  registerRoutes(): void {
    const initMenuBoardPage = (doc: pdfkit, logoBase64: string, backgroundColor: string, imageWidth: number, imageHeight: number) => {
        // First, paint the background across the whole page, margins included, so the picture
        // has no unpainted edge for the TV to show
        doc.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT).fill(backgroundColor);
        const menuLogo = Buffer.from(logoBase64, 'base64');
        doc.image(menuLogo, BOARD_WIDTH/2 - imageWidth/2, BOARD_SAFE_MARGIN, {width: imageWidth, height: imageHeight});
    }

    const getItemFullLineText = (item: Item | undefined | null, breweryName: String | undefined | null) => {
      const itemName = `${breweryName} ${item?.displayName}`;
      const itemStyle = item?.style;
      const itemAbv = item?.abv;
      const itemDisplay = `${itemName}  ${itemStyle}  ${itemAbv}%`;

      return itemDisplay;
    }

    // Lays the menu board out as a PDF (one page per screenful) and renders each page to a PNG,
    // since the TVs can't show a PDF. Nothing is drawn inside BOARD_SAFE_MARGIN of any edge except
    // the background colour.
    const generateMenuBoardImages = async (dataProvider: DataProvider, mainMenu: Menu): Promise<Uint8Array[]> => {
      // Get all the sub-menus for this menu
      const allSubMenus = (await dataProvider.getSubMenusForMenu(mainMenu.id!!)).sort(byOrder);

      // Create a document, collecting what it writes so it can be rendered once it's complete
      const docWidth = BOARD_WIDTH
      const docHeight = BOARD_HEIGHT
      const doc = new pdfkit({ size: [docWidth, docHeight], margin: 0 });
      const pdfChunks: Buffer[] = [];
      const pdfFinished = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (chunk: Buffer) => pdfChunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
        doc.on('error', reject);
      });

      // The area everything is drawn in
      const contentLeft = BOARD_SAFE_MARGIN;
      const contentRight = docWidth - BOARD_SAFE_MARGIN;
      const contentBottom = docHeight - BOARD_SAFE_MARGIN;
      const contentWidth = contentRight - contentLeft;

      // Declaring some colors for the menu
      const zymosBlue = '#175a6c' // Be it forever known
      const submenuBackground = '#2b2b2b'
      const submenuHeaderFontColor = '#ffffff'
      const submenuItemFontColor = '#f3f3f3'
      const submenuItemStyleFontColor = '#9D9D9D'


      // Add header logo and fill the background
      const headerLogoHeight = 150;
      const headerLogoWidth = 150;
      initMenuBoardPage(doc, mainMenu.logo!!, zymosBlue, headerLogoWidth, headerLogoHeight);
      const menuLogo = Buffer.from(mainMenu.logo!!, 'base64');
      // Where the next thing can be drawn on this page, measured from the top of the image
      const firstRowTop = BOARD_SAFE_MARGIN + headerLogoHeight;
      var totalHeightSoFar = firstRowTop

      const fontFolderRoot = 'dist/public/fonts'

      const standardBuffer = 10;
      const headerBuffer = 5;
      const backgroundHeight = 50 * BOARD_SIZE_SCALE
      const itemLogoDimensions = 50 * BOARD_SIZE_SCALE
      const endOfPageSafetyBuffer = itemLogoDimensions + (2 * standardBuffer);
      // An item's text starts after its logo and wraps before the margin, rather than running
      // into it
      const itemTextLeft = contentLeft + itemLogoDimensions + standardBuffer;
      const itemTextWidth = contentRight - itemTextLeft;
      const heightOfItemText = (text: string) =>
        doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).fontSize(itemLogoDimensions).heightOfString(text, { width: itemTextWidth });

      // Render the submenus
      for (const submenu of allSubMenus) {
        const menuItemsForSubmenu = (await dataProvider.getMenuItemsForSubMenu(submenu.id!!)).filter(MenuItem.isActive).sort(byOrder)
        // No (active) items, just skip this one
        if (menuItemsForSubmenu.length <= 0) {
          continue
        }
        
        // First, make sure we can fit this submenu and at least the first item on the current page
        // TODO: Consider extracting this to its own function; lots of params, though
        const firstItem = menuItemsForSubmenu[0]
        const firstItemDetails = await dataProvider.getItem(firstItem.itemId!!)
        const breweryForItem = await dataProvider.getBrewery(firstItemDetails?.breweryId!!);
        const firstItemDisplayText = getItemFullLineText(firstItemDetails, breweryForItem?.name);
        const firstItemDisplayHeight = heightOfItemText(firstItemDisplayText);
        // A section that follows another one on the same page starts a little lower, to set it
        // apart from the items above it. A section at the top of a page needs no gap.
        let sectionGap = totalHeightSoFar > firstRowTop ? BOARD_SECTION_GAP : 0;
        const firstBlockHeight = totalHeightSoFar + sectionGap + standardBuffer + backgroundHeight + firstItemDisplayHeight + endOfPageSafetyBuffer;
        if (firstBlockHeight >= contentBottom) {
          doc.addPage({ size: [docWidth, docHeight], margin: 0 });
          initMenuBoardPage(doc, mainMenu.logo!!, zymosBlue, headerLogoWidth, headerLogoHeight);
          totalHeightSoFar = firstRowTop;
          sectionGap = 0;
        }
        totalHeightSoFar += sectionGap;

        // Draw the background for the header
        doc.rect(contentLeft, totalHeightSoFar + standardBuffer, contentWidth, backgroundHeight).fill(submenuBackground);
        doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).
          fontSize(backgroundHeight - (2 * headerBuffer)).
          fillColor(submenuHeaderFontColor).
          text(submenu.displayName, contentLeft + headerBuffer, totalHeightSoFar + standardBuffer + (headerBuffer/2), { width: contentWidth - 2 * headerBuffer });
        // Update the height for the text displayed
        totalHeightSoFar = totalHeightSoFar + standardBuffer + backgroundHeight

        // For each item in the submenu, render the details
        for (const menuItem of menuItemsForSubmenu){
          const itemDetails = await dataProvider.getItem(menuItem.itemId!!)
          // Get the logo for the font
          // TODO: This should be from the brewery if it's not provided
          var itemLogo;
          if (menuItem.itemLogo == null){
            itemLogo = menuLogo;
          } else {
            itemLogo = Buffer.from(menuItem.itemLogo, 'base64');
          }
          
          // Get some details about the item
          const breweryForItem = await dataProvider.getBrewery(itemDetails?.breweryId!!);

          // Precalculate the height of the text and determine if we need to start a new page
          const itemFullText = getItemFullLineText(itemDetails, breweryForItem?.name);
          const nextHeight = heightOfItemText(itemFullText);
          if (totalHeightSoFar + nextHeight + endOfPageSafetyBuffer > contentBottom) {
            doc.addPage({ size: [docWidth, docHeight], margin: 0 })
            initMenuBoardPage(doc, mainMenu.logo!!, zymosBlue, headerLogoWidth, headerLogoHeight);
            totalHeightSoFar = firstRowTop;
            // Draw 
            doc.rect(contentLeft, totalHeightSoFar + standardBuffer, contentWidth, backgroundHeight).fill(submenuBackground);
            doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).
              fontSize(backgroundHeight - (2 * headerBuffer)).
              fillColor(submenuHeaderFontColor).
              text(submenu.displayName + ", Continued", contentLeft + headerBuffer, totalHeightSoFar + standardBuffer + (headerBuffer/2), { width: contentWidth - 2 * headerBuffer });
            // Update the height for the text displayed
            totalHeightSoFar = totalHeightSoFar + standardBuffer + backgroundHeight
          }

          // Draw a circle, and crop the logo to it
          doc.save()
          doc.circle(contentLeft + itemLogoDimensions / 2, totalHeightSoFar + standardBuffer + itemLogoDimensions/2, itemLogoDimensions/2).clip();
          doc.image(itemLogo, contentLeft, totalHeightSoFar + standardBuffer, {height: itemLogoDimensions, width: itemLogoDimensions});
          doc.restore();

          // Describe the actual beer
          const nextHeightStart = totalHeightSoFar + standardBuffer / 2;
          doc.save()
          doc.font(`${fontFolderRoot}/FiraSans-Regular.ttf`).
            fontSize(itemLogoDimensions).
            fillColor(submenuItemFontColor).
            text(`${breweryForItem?.name} ${itemDetails?.displayName}`, itemTextLeft, nextHeightStart, { continued: true, width: itemTextWidth });
          doc.
            fillColor(submenuItemStyleFontColor).
            text("  " + itemDetails?.style + "  " + itemDetails?.abv + "%", { width: itemTextWidth });
          doc.restore();

          totalHeightSoFar = totalHeightSoFar + nextHeight + standardBuffer
        }
      };

      doc.end();
      return pdfToPngs(await pdfFinished);
    };

    this.router.get("/:menuId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getMenu(req.params.menuId)

      if (result === null) {
        res.sendStatus(404);
        return
      }


      if (req.query.format === "json" || req.query.format === undefined) {
        if (result !== null) {
          // Spelled out rather than sending the stored row, so a field added to the table later
          // (like the owner) isn't published by accident
          res.send({ id: result.id, internalName: result.internalName, displayName: result.displayName, logo: result.logo });
          return
        }
      }
      if (req.query.format === "digital") {
        // &page=N (1-based) returns just that page's image
        const pageParam = req.query.page;
        let pageNumber: number | null = null;
        if (pageParam !== undefined) {
          if (typeof pageParam !== 'string' || !/^[1-9]\d{0,5}$/.test(pageParam)) {
            res.sendStatus(400);
            return
          }
          pageNumber = Number(pageParam);
        }

        const pages = await generateMenuBoardImages(this.dataProvider, result);

        if (pageNumber === null) {
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', 'attachment; filename=menu-board.zip');
          res.send(zipPages(pages));
          return
        }
        if (pageNumber > pages.length) {
          res.sendStatus(404);
          return
        }
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `inline; filename=${pageFileName(pageNumber)}`);
        res.send(Buffer.from(pages[pageNumber - 1]));
        return
      }
      if (req.query.format === "widget") {
        // Returns a nested JSON representation of this menu (sections -> items, with no pour
        // sizes or prices), suitable for a lightweight external display like the Wix "currently on tap"
        // embed. This mirrors the same data the print/digital views build, just as JSON instead
        // of a rendered document.
        const allSubMenus = (await this.dataProvider.getSubMenusForMenu(result.id!)).sort(byOrder);

        const sections = [];
        for (const subMenu of allSubMenus) {
          const menuItemsForSubmenu = (await this.dataProvider.getMenuItemsForSubMenu(subMenu.id!)).filter(MenuItem.isActive).sort(byOrder);
          if (menuItemsForSubmenu.length <= 0) {
            continue;
          }

          const items = [];
          for (const menuItem of menuItemsForSubmenu) {
            const itemDetails = await this.dataProvider.getItem(menuItem.itemId!);

            let brewery: Brewery | null = null;
            if (itemDetails?.breweryId) {
              brewery = await this.dataProvider.getBrewery(itemDetails.breweryId);
            }

            const logoSource = menuItem.itemLogo ?? brewery?.defaultLogo ?? result.logo ?? null;

            items.push({
              breweryName: brewery?.name ?? null,
              breweryLocation: brewery?.location ?? null,
              displayName: itemDetails?.displayName ?? "",
              style: itemDetails?.style ?? null,
              abv: itemDetails?.abv ?? null,
              description: itemDetails?.description ?? null,
              logo: logoSource ? `data:image/png;base64,${logoSource}` : null,
            });
          }

          sections.push({
            displayName: subMenu.displayName,
            items,
          });
        }

        res.json({
          id: result.id,
          displayName: result.displayName,
          logo: result.logo ? `data:image/png;base64,${result.logo}` : null,
          generatedAt: new Date().toISOString(),
          sections,
        });
        return;
      }
      if (req.query.format === "print") {
        // Get all the sub-menus for this menu
        const allSubMenus = (await this.dataProvider.getSubMenusForMenu(result.id!)).sort(byOrder);

        // Initialize a map we can add things to
        const subMenuToItemMap: Map<string, Array<DisplayItem>> = new Map();
        const subMenuToContainerDisplayNameToOrder: Map<string, Map<string, number>> = new Map();
        allSubMenus.forEach((subMenu: SubMenu) => {
          subMenuToItemMap.set(subMenu.id!, []);
          subMenuToContainerDisplayNameToOrder.set(subMenu.id!, new Map());
        })

        // Create DisplayItems for each MenuItem and add it to the appropriate map
        // Also gathers all container display info for submenus during the loop
        // Sorted up front so each section's list below ends up in its configured order
        const allItemsForMenu = (await this.dataProvider.getMenuItemsForMenu(result.id!)).filter(MenuItem.isActive).sort(byOrder);
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
          // Like the widget and menu board, leave out sections with nothing (active) on them
          if (subMenuToItemMap.get(menu.id!)!.length === 0) {
            return;
          }
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
  }
}
