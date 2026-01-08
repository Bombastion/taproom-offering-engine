import { Request, Response } from 'express';
import Routes from './common';
import { ItemContainer, SaleContainer } from '../models/containers';

export class ContainersRoutes extends Routes {
  requiredFieldsAndTypes: Record<string, string> = {"containerName": "string", "displayName": "string"};

  registerRoutes(): void {
    this.router.get("/manage", (_req: Request, res: Response) => {
      const containerList = this.dataProvider.getContainers();
      res.render("containerList", {displayList: containerList})
      return;
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

      let container = new ItemContainer(0, req.body.containerName, req.body.displayName, req.body.order);
      container = this.dataProvider.addContainer(container);

      res.send(container);
    });

    // Update an existing container
    this.router.patch("/:containerId", (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return;
        }
        const result = this.dataProvider.updateContainer(parseInt(req.params.containerId), new ItemContainer(null, req.body.containerName, req.body.displayName, req.body.order));
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
