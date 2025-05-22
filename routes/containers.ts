import express, { Request, Response } from 'express';
import { DataProvider } from "../storage/providers";

export class ContainersRoutes {
  router = express.Router();
  dataProvider: DataProvider;

  constructor(dataProvider: DataProvider){
    this.dataProvider = dataProvider;
    this.registerRoutes();
  }

  registerRoutes(): void {
    this.router.get("/", (_req: Request, res: Response) => {
      res.send("Look at all the glasses!");
    });

    this.router.get("/:containerId", (req: Request, res: Response) => {
      const result = this.dataProvider.getContainer(parseInt(req.params.containerId));
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
  }
}
