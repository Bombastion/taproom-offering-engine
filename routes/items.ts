import express, { Request, Response } from 'express';
import { DataProvider } from "../storage/providers";


export class ItemsRoutes {
  router = express.Router();
  dataProvider: DataProvider;

  constructor(dataProvider: DataProvider){
    this.dataProvider = dataProvider;
    this.registerRoutes();
  }

  registerRoutes(): void {
    this.router.get("/", (_req: Request, res: Response) => {
      res.send("Look at all the beer!");
    });

    this.router.get("/:itemId", (req: Request, res: Response) => {
      const result = this.dataProvider.getItem(parseInt(req.params.itemId))
      console.log(result);
      if (result !== null) {
        res.send(this.dataProvider.getItem(parseInt(req.params.itemId)));
        return
      }
      res.sendStatus(404);
      return
    });
  }
}
