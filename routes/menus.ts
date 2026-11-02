import { Request, Response } from 'express';
import Routes from './common';
import { Menu, MenuItem } from '../models/menus';
import { Brewery } from '../models/breweries';
import { pageFileName, zipPages } from './menuBoardImages';
import { renderBoardPages } from '../board/render';
import { defaultBoardDesign, parseBoardDesign } from '../models/boardDesign';
import { byOrder, subMenuShownOn } from './viewHelpers';
import { defaultPrintDesign, parsePrintDesign } from '../models/menuDesign';
import { buildPrintModel } from '../print/model';
import { renderPrintMenu } from '../print/render';

// The public, read-only menu formats (no login): the raw menu as JSON, the nested JSON the Wix
// widget polls (?format=widget), the printable HTML menu (?format=print) and the menu board images
// (?format=digital: a ZIP of one PNG per page, or a single PNG with &page=N). All editing goes
// through the admin JSON API in api.ts.
//
// Inactive menu items (see MenuItem.active) are left out of all of these, and a section with no
// active items is skipped entirely.
export class MenusRoutes extends Routes {
  registerRoutes(): void {
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

        // How the board is drawn is its stored design, or the default one. A stored design that
        // can't be read must not take the public board down, so it falls back to the default.
        let design = defaultBoardDesign();
        const stored = await this.dataProvider.getMenuDesign(result.id!, 'board');
        if (stored) {
          const parsed = parseBoardDesign(stored.spec);
          if (parsed.ok) {
            design = parsed.design;
          } else {
            console.error(`The stored board design for menu ${result.id} is invalid; using the default`, parsed.issues);
          }
        }
        const pages = await renderBoardPages(await buildPrintModel(this.dataProvider, result, { view: 'board', prices: false }), design);

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
        const allSubMenus = (await this.dataProvider.getSubMenusForMenu(result.id!)).filter(subMenuShownOn('widget')).sort(byOrder);

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
        // How this menu is laid out is its stored design, or the default one. A stored design that
        // can't be read must not take the public menu down, so it falls back to the default.
        const stored = await this.dataProvider.getMenuDesign(result.id!, 'print');
        let design = defaultPrintDesign();
        if (stored) {
          const parsed = parsePrintDesign(stored.spec);
          if (parsed.ok) {
            design = parsed.design;
          } else {
            console.error(`The stored print design for menu ${result.id} is invalid; using the default`, parsed.issues);
          }
        }
        const model = await buildPrintModel(this.dataProvider, result);
        res.type('html').send(renderPrintMenu(model, design));
        return
      }
      
      res.sendStatus(400);
      return
    });
  }
}
