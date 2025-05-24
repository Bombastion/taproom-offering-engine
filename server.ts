import express, { Request, Response } from 'express';
import { ContainersRoutes, SaleContainersRoutes } from './routes/containers';
import { ItemsRoutes } from './routes/items';
import { LocalDataProvider } from './storage/providers';
import { BreweriesRoutes } from './routes/breweries';
import { MenuItemsRoutes, MenusRoutes, SubMenusRoutes } from './routes/menus';

const app = express();
const port = process.env.TOE_SERVER_PORT || 3000;

app.use(express.json()); // for parsing application/json

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Register routers
const dataProvider = new LocalDataProvider("./data/");
app.use('/breweries', new BreweriesRoutes(dataProvider).router)
app.use('/containers', new ContainersRoutes(dataProvider).router)
app.use('/sale-containers', new SaleContainersRoutes(dataProvider).router)
app.use('/items', new ItemsRoutes(dataProvider).router);
app.use('/menu-items', new MenuItemsRoutes(dataProvider).router);
app.use('/menus', new MenusRoutes(dataProvider).router);
app.use('/sub-menus', new SubMenusRoutes(dataProvider).router);