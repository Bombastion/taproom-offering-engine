import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { ContainersRoutes, SaleContainersRoutes } from './routes/containers';
import { ItemsRoutes } from './routes/items';
import { LocalDataProvider, PrismaDataProvider } from './storage/providers';
import { BreweriesRoutes } from './routes/breweries';
import { MenuItemsRoutes, MenusRoutes, SubMenusRoutes } from './routes/menus';
import { prisma } from './prisma/client';

const app = express();
const port = process.env.TOE_SERVER_PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Allow cross-origin requests (e.g., the Wix "currently on tap" widget fetching
// menu data from this server's domain). Menu data served here is public/read-only,
// so an open CORS policy is fine.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get('/', (_req: Request, res: Response) => {
  res.render('index')
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Setting up HTML rendering
app.set('view engine', 'pug');
app.set('views', './dist/public/views')
app.use(express.static(path.join(import.meta.dirname, 'public', 'css')));
app.use(express.static(path.join(import.meta.dirname, 'public', 'js')));

// Register routers
const dataProvider = new PrismaDataProvider(prisma);
app.use('/breweries', new BreweriesRoutes(dataProvider).router)
app.use('/containers', new ContainersRoutes(dataProvider).router)
app.use('/sale-containers', new SaleContainersRoutes(dataProvider).router)
app.use('/items', new ItemsRoutes(dataProvider).router);
app.use('/menu-items', new MenuItemsRoutes(dataProvider).router);
app.use('/menus', new MenusRoutes(dataProvider).router);
app.use('/submenus', new SubMenusRoutes(dataProvider).router);
