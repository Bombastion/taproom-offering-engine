import { Request, Response } from 'express';
import Routes from './common';
import { DataProvider } from "../storage/providers";
import { MenuItem } from '../models/items';


export class ItemsRoutes extends Routes {
  registerRoutes(): void {
    this.router.get("/", (_req: Request, res: Response) => {
      res.send("Look at all the beer!");
    });

    this.router.get("/:itemId", (req: Request, res: Response) => {
      const result = this.dataProvider.getItem(parseInt(req.params.itemId))
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });

    // Creates a new item with the given info
    this.router.post("/", (req: Request, res: Response) => {
      const requiredFieldsAndTypes: Record<string, string> = {
        "internalName": "string",
        "displayName": "string",
        "brewery": "string",
        "style": "string",
        "abv": "number",
        "description": "string",
        "category": "string",
      }
      if(!this.validateInput(req, res, requiredFieldsAndTypes)) {
        return;
      }

      let item = new MenuItem(
        0,
        req.body.internalName,
        req.body.displayName,
        req.body.brewery,
        req.body.style,
        req.body.abv,
        req.body.description,
        req.body.category,
        []
      );
      item = this.dataProvider.addItem(item);

      res.send(item);
    });
  }
}
