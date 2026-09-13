import express, { Request, Response } from 'express';
import { DataProvider } from "../storage/providers";

abstract class Routes {
  router = express.Router();
  dataProvider: DataProvider;

  constructor(dataProvider: DataProvider){
    this.dataProvider = dataProvider;
    this.registerRoutes();
  }

  abstract registerRoutes(): void;

  validateInput(req: Request, res: Response, requiredFieldsAndTypes: Record<string, string>): boolean {
    /*
    Generically validates inputs.
    Specifically, makes sure that all the keys of requiredFieldsAndTypes are provided, and that the values on req.body
    are the correct types based on the corresponding values in the Record object
    Updates the response with the appropriate status and errors as a side-effect

    Returns: false if an error was found, true otherwise.
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
        if (requiredFieldsAndTypes[fieldName] === "number" && (typeof(req.body[fieldName]) !== "number" && typeof(parseFloat(req.body[fieldName])) !== "number")) {
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

  protected handleError(res: Response, e: any): void {
    /*
    Shared catch-block handler for route handlers. Logs the full error server-side, but only
    relays the error's own message to the client for intentionally-thrown client errors (4xx,
    identified by the thrown object having its own `statusCode`). Anything else — most often a
    raw database/driver error with no `statusCode` of its own — gets a generic message instead,
    since those messages can include internal details (column names, query fragments, etc.)
    that shouldn't be exposed to callers of an internet-facing service.
    */
    console.error(e);
    const hasStatusCode = e !== null && typeof e === "object" && "statusCode" in e && typeof e["statusCode"] === "number";
    const statusCode = hasStatusCode ? e["statusCode"] : 500;
    const isClientError = statusCode >= 400 && statusCode < 500;
    const message = isClientError && e !== null && typeof e === "object" && "message" in e
      ? e["message"]
      : "Unexpected error occurred";
    res.status(statusCode);
    res.send(message);
  }
}

export default Routes;
