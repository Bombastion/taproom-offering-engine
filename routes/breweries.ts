import { Request, Response } from 'express';
import Routes from './common';
import { Item } from '../models/items';


export class BreweriesRoutes extends Routes {
  // Order matters here. If we don't specify non-IDs first, they get interpreted as IDs
  registerRoutes(): void {
    this.router.get("/manage", (req: Request, res: Response) => {
      const breweryList = this.dataProvider.getBreweries();
      res.render("breweryList", {breweries: breweryList});
      return 
    });

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
