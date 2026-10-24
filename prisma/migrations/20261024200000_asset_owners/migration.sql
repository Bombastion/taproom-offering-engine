-- Every brewery, pour size, price, item, menu, section and menu item now belongs to one user.

-- AlterTable
-- The column starts out nullable so the rows that already exist can be given an owner first.
ALTER TABLE "Brewery" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ItemContainer" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "SaleContainer" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Item" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Menu" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "SubMenu" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "MenuItem" ADD COLUMN "ownerId" TEXT;

-- Existing data goes to the first admin.
--
-- A database that has data but no admin to give it to (one from before accounts existed, where the
-- only login was the shared password in .env) gets a placeholder admin. It has no password, so
-- nobody can sign in as it; on startup the server sets its email and password from
-- TOE_ADMIN_EMAIL / TOE_ADMIN_PASSWORD (see auth/bootstrap.ts). An empty database gets nothing
-- here, and that same startup step creates the first admin from scratch.
INSERT INTO "User" ("id", "email", "displayName", "role", "status", "approvedAt")
SELECT gen_random_uuid()::text, 'admin', 'Admin', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "role" = 'ADMIN')
  AND (EXISTS (SELECT 1 FROM "Brewery") OR EXISTS (SELECT 1 FROM "ItemContainer") OR EXISTS (SELECT 1 FROM "SaleContainer") OR EXISTS (SELECT 1 FROM "Item") OR EXISTS (SELECT 1 FROM "Menu") OR EXISTS (SELECT 1 FROM "SubMenu") OR EXISTS (SELECT 1 FROM "MenuItem"));

UPDATE "Brewery" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
UPDATE "ItemContainer" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
UPDATE "SaleContainer" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
UPDATE "Item" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
UPDATE "Menu" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
UPDATE "SubMenu" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
UPDATE "MenuItem" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);

-- AlterTable
ALTER TABLE "Brewery" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "ItemContainer" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "SaleContainer" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Menu" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "SubMenu" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "MenuItem" ALTER COLUMN "ownerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Brewery_ownerId_idx" ON "Brewery"("ownerId");

-- CreateIndex
CREATE INDEX "ItemContainer_ownerId_idx" ON "ItemContainer"("ownerId");

-- CreateIndex
CREATE INDEX "SaleContainer_ownerId_idx" ON "SaleContainer"("ownerId");

-- CreateIndex
CREATE INDEX "Item_ownerId_idx" ON "Item"("ownerId");

-- CreateIndex
CREATE INDEX "Menu_ownerId_idx" ON "Menu"("ownerId");

-- CreateIndex
CREATE INDEX "SubMenu_ownerId_idx" ON "SubMenu"("ownerId");

-- CreateIndex
CREATE INDEX "MenuItem_ownerId_idx" ON "MenuItem"("ownerId");

-- AddForeignKey
ALTER TABLE "Brewery" ADD CONSTRAINT "Brewery_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemContainer" ADD CONSTRAINT "ItemContainer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleContainer" ADD CONSTRAINT "SaleContainer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubMenu" ADD CONSTRAINT "SubMenu_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
