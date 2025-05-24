import { Request, Response } from 'express';
import Routes from './common';
import { Item } from '../models/items';


export class MenusRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/:menuId", (req: Request, res: Response) => {
      const result = this.dataProvider.getMenu(parseInt(req.params.menuId))
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
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
