import { Request, Response } from 'express';
import Routes from './common';
import { Item } from '../models/items';


export class ItemsRoutes extends Routes {
  registerRoutes(): void {
    // TODO: This should probably be a paginated list of all items.
    // Copy/paste that thought to all routes
    this.router.get("/manage", (_req: Request, res: Response) => {
      const displayList = this.dataProvider.getItems();
      res.render("itemList", {displayList: displayList});
      return;
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
      }
      if(!this.validateInput(req, res, requiredFieldsAndTypes)) {
        return;
      }

      const item = new Item(
        null,
        req.body.internalName,
        req.body.displayName,
        req.body.breweryId? parseInt(req.body.breweryId) : null,
        req.body.style,
        req.body.abv,
        req.body.description,
        req.body.category,
      );
      const result = this.dataProvider.addItem(item);

      res.send(result);
    });

    // Updates an existing item
    this.router.patch("/:itemId", (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }

        const item = new Item(
          null,
          req.body.internalName,
          req.body.displayName,
          req.body.breweryId? parseInt(req.body.breweryId) : null,
          req.body.style,
          req.body.abv,
          req.body.description,
          req.body.category,
        );
        
        const result = this.dataProvider.updateItem(parseInt(req.params.itemId), item);
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
      }
      
      return;
    });
  }
}
