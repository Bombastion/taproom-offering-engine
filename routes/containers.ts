import { Request, Response } from 'express';
import Routes from './common';
import { ItemContainer, SaleContainer } from '../models/containers';

export class ContainersRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"containerName": "string", "displayName": "string"};

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

      let container = new ItemContainer(0, req.body.containerName, req.body.displayName);
      container = this.dataProvider.addContainer(container);

      res.send(container);
    });
  }
}

export class SaleContainersRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"containerId": "number", "itemId": "number", "price": "number"};

  registerRoutes(): void {
    // Gets a specific sale container by ID
    this.router.get("/:containerId", (req: Request, res: Response) => {
      const result = this.dataProvider.getSaleContainer(parseInt(req.params.containerId));
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
    
    // Deletes a specific sale container by ID
    this.router.delete("/:containerId", (req: Request, res: Response) => {
      this.dataProvider.removeSaleContainer(parseInt(req.params.containerId));
      res.sendStatus(204);
      return;
    });


    // Creates a container association with the given info
    this.router.post("/", (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      let container = new SaleContainer(0, req.body.containerId, req.body.itemId, req.body.price);
      container = this.dataProvider.addSaleContainer(container);

      res.send(container);
      return;
    });
  }
}
