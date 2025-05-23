import express, { Request, Response } from 'express';
import Routes from './common';
import { ItemContainer } from '../models/containers';

export class ContainersRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"containerName": "string", "displayName": "string", "price": "number"};

  registerRoutes(): void {
    // Default get
    // TODO: Should probably list all IDs or something eventually
    this.router.get("/", (_req: Request, res: Response) => {
      res.send("Look at all the glasses!");
    });

    // Gets a specific container by ID
    this.router.get("/:containerId", (req: Request, res: Response) => {
      const result = this.dataProvider.getContainer(parseInt(req.params.containerId));
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });

    // Creates a new container with the given info
    this.router.post("/", (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      let container = new ItemContainer(0, req.body.containerName, req.body.displayName, req.body.price);
      container = this.dataProvider.addContainer(container);

      res.send(container);
    });
  }
}
