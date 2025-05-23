import express, { Request, Response } from 'express';
import { DataProvider } from "../storage/providers";
import { ItemContainer } from '../models/containers';

export class ContainersRoutes {
  router = express.Router();
  dataProvider: DataProvider;

  constructor(dataProvider: DataProvider){
    this.dataProvider = dataProvider;
    this.registerRoutes();
  }

  validateInput(req: Request, res: Response, requiredFieldsAndTypes: Record<string, string>): boolean {
    /*
      Generically validates inputs.
      Specifically, makes sure that all the keys of requiredFieldsAndTypes are provided, and that the values on req.body
      are the correct types based on the corresponding values in the Record object

      Returns: false if an error was found, true otherwise
    */
    let missingFields: Array<string> = [];
    let badTypes: Array<string> = [];
    Object.keys(requiredFieldsAndTypes).forEach(function(fieldName) {
      if (!req.body[fieldName]) {
        missingFields.push(fieldName);
      } else {
        if (requiredFieldsAndTypes[fieldName] === "string" && typeof(req.body[fieldName]) !== "string") {
          badTypes.push(`${fieldName} must be of type string`);
        }
        if (requiredFieldsAndTypes[fieldName] === "number" && typeof(req.body[fieldName]) !== "number") {
          badTypes.push(`${fieldName} must be of type number`);
        }
      }
    });
    if (missingFields.length > 0) {
      res.status(422).send(`All of [${missingFields.join(", ")}] must be provided`);
      return false;
    }
    if (badTypes.length > 0) {
      res.status(400).send(`The following type errors were found: [${badTypes.join(", ")}]`);
      return false;
    }

    return true;
  }

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
      const requiredFieldsAndTypes: Record<string, string> = {"containerName": "string", "displayName": "string", "price": "number"};
      if(!this.validateInput(req, res, requiredFieldsAndTypes)) {
        return;
      }

      let container = new ItemContainer(0, req.body.containerName, req.body.displayName, req.body.price);
      container = this.dataProvider.addContainer(container);

      res.send(container);
    });
  }
}
