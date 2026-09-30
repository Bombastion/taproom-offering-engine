import express, { Response } from 'express';
import { DataProvider } from "../storage/providers";

abstract class Routes {
  router = express.Router();
  dataProvider: DataProvider;

  constructor(dataProvider: DataProvider){
    this.dataProvider = dataProvider;
    this.registerRoutes();
  }

  abstract registerRoutes(): void;

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
