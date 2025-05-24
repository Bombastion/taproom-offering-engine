import { Request, Response } from 'express';
import Routes from './common';
import { Item } from '../models/items';


export class BreweriesRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/:breweryId", (req: Request, res: Response) => {
      const result = this.dataProvider.getBrewery(parseInt(req.params.breweryId))
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
  }
}
