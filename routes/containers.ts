import { Request, Response } from 'express';
import Routes from './common';
import { ItemContainer, SaleContainer } from '../models/containers';

export class ContainersRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"containerName": "string", "displayName": "string"};

  registerRoutes(): void {
    this.router.get("/manage", async (_req: Request, res: Response) => {
      const containerList = await this.dataProvider.getContainers();
      res.render("containerList", {displayList: containerList})
      return;
    });

    // Gets a specific container by ID
    this.router.get("/:containerId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getContainer(req.params.containerId);
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });

    // Creates a new container with the given info
    this.router.post("/", async (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      let container = new ItemContainer(null, req.body.containerName, req.body.displayName, parseInt(req.body.order));
      container = await this.dataProvider.addContainer(container);

      res.send(container);
    });

    // Update an existing container
    this.router.patch("/:containerId", async (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }
        const order = req.body.order? parseInt(req.body.order) : null;
        const result = await this.dataProvider.updateContainer(req.params.containerId, new ItemContainer(null, req.body.containerName, req.body.displayName, order));
        if (result !== null) {
          res.send(result);
          return;
        }
        res.status(400);
        res.send("Invalid Argument");
        return
      } catch(e: any) {
        const statusCode = "statusCode" in e ? e["statusCode"] : 500;
        const message = "message" in e ? e["message"] : "Unexpected error occurred";
        res.status(statusCode);
        res.send(message);
      }
      
      return
    });
  }
}

export class SaleContainersRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"containerId": "number", "itemId": "string", "price": "number"};

  registerRoutes(): void {
    // Gets a specific sale container by ID
    this.router.get("/:containerId", async (req: Request, res: Response) => {
      const result = await this.dataProvider.getSaleContainer(req.params.containerId);
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
    
    // Deletes a specific sale container by ID
    this.router.delete("/:containerId", async (req: Request, res: Response) => {
      await this.dataProvider.removeSaleContainer(req.params.containerId);
      res.sendStatus(204);
      return;
    });


    // Creates a container association with the given info
    this.router.post("/", async (req: Request, res: Response) => {
      if(!this.validateInput(req, res, this.requiredFieldsAndTypes)) {
        return;
      }

      let container = new SaleContainer(null, req.body.containerId, req.body.itemId, parseFloat(req.body.price));
      container = await this.dataProvider.addSaleContainer(container);

      res.send(container);
      return;
    });
  }
}
