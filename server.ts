import { createApp } from './app';
import { PrismaDataProvider } from './storage/providers';
import { prisma } from './prisma/client';
import { ensureBootstrapAdmin } from './auth/bootstrap';

const port = process.env.TOE_SERVER_PORT || 3000;

async function main() {
  const dataProvider = new PrismaDataProvider(prisma);
  // Makes sure there's an admin to sign in as on a fresh database
  await ensureBootstrapAdmin(dataProvider);

  const app = createApp(dataProvider);
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
