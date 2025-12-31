import { Request, Response } from 'express';
import Routes from './common';
import { Brewery } from '../models/breweries';

const sharp = require('sharp');

export class BreweriesRoutes extends Routes {
  // Order matters here. If we don't specify non-IDs first, they get interpreted as IDs
  registerRoutes(): void {
    this.router.get("/manage", (req: Request, res: Response) => {
      const breweryList = this.dataProvider.getBreweries();
      res.render("breweryList", {breweries: breweryList});
      return 
    });

    this.router.post("", (req: Request, res: Response) => {
      this.dataProvider.addBrewery(new Brewery(2, req.body['newBreweryName'], req.body['newBreweryLogoB64'], req.body['newBreweryLocation']));
      
      res.redirect(req.query.callbackUrl as string);
      return
    });

    this.router.patch("/:breweryId", (req: Request, res: Response) => {
      try{
        if (!req.body) {
          res.status(400).send("Request body expected");
          return
        }
        const result = this.dataProvider.updateBrewery(parseInt(req.params.breweryId), new Brewery(null, req.body['newBreweryName'], req.body['newBreweryLogoB64'], req.body['newBreweryLocation']));
        if (result !== null) {
          res.send(result);
          return
        }
        res.status(400);
        res.send("Invalid Argument");
      } catch(e: any) {
        const statusCode = "statusCode" in e ? e["statusCode"] : 500;
        const message = "message" in e ? e["message"] : "Unexpected error occurred";
        res.status(statusCode);
        res.send(message);
      }
      
      return
    });

    this.router.get("/:breweryId", (req: Request, res: Response) => {
      const result = this.dataProvider.getBrewery(parseInt(req.params.breweryId))
      if (result !== null) {
        res.send(result);
        return
      }
      res.sendStatus(404);
      return
    });
  }
}
