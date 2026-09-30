import { createApp } from './app';
import { PrismaDataProvider } from './storage/providers';
import { prisma } from './prisma/client';

const port = process.env.TOE_SERVER_PORT || 3000;

const app = createApp(new PrismaDataProvider(prisma));

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
