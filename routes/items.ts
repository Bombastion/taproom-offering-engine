import { Request, Response } from 'express';
import Routes from './common';
import { Item } from '../models/items';


export class ItemsRoutes extends Routes {
  registerRoutes(): void {
    // TODO: This should probably be a paginated list of all items.
    // Copy/paste that thought to all routes
    this.router.get("/manage", async (_req: Request, res: Response) => {
      const displayList = await this.dataProvider.getItems();
      res.render("itemList", {displayList: displayList});
      return;
    });

    this.router.get("/:itemId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getItem(req.params.itemId);
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });

    // Creates a new item with the given info
    this.router.post("/", async (req: Request, res: Response) => {
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
        req.body.breweryId,
        req.body.style,
        req.body.abv,
        req.body.description,
        req.body.category,
      );
      const result = await this.dataProvider.addItem(item);

      res.send(result);
    });

    // Updates an existing item
    this.router.patch("/:itemId", async (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }

        const item = new Item(
          null,
          req.body.internalName,
          req.body.displayName,
          req.body.breweryId,
          req.body.style,
          req.body.abv,
          req.body.description,
          req.body.category,
        );
        
        const result = await this.dataProvider.updateItem(req.params.itemId, item);
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
