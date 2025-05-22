import express, { Request, Response } from 'express';
import { ContainersRoutes } from './routes/containers';
import { ItemsRoutes } from './routes/items';
import { LocalDataProvider } from './storage/providers';

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
app.use('/containers', new ContainersRoutes(dataProvider).router)
app.use('/items', new ItemsRoutes(dataProvider).router);