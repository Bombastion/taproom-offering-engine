-- CreateTable
-- How a menu looks on one of its public views ("print" or "board"), as a JSON design (models/menuDesign.ts).
CREATE TABLE "MenuDesign" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "MenuDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuDesign_menuId_view_key" ON "MenuDesign"("menuId", "view");

-- CreateIndex
CREATE INDEX "MenuDesign_ownerId_idx" ON "MenuDesign"("ownerId");

-- AddForeignKey
ALTER TABLE "MenuDesign" ADD CONSTRAINT "MenuDesign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Menus that already exist keep the footer their print view has always had (the WiFi details), now as
-- part of their design. A design only holds what differs from the defaults, and a new menu's default
-- print design has no footer.
INSERT INTO "MenuDesign" ("id", "menuId", "view", "version", "spec", "updatedAt", "ownerId")
SELECT gen_random_uuid()::text, "id", 'print', 1,
       '{"version": 1, "footer": {"show": true, "text": "WiFi Name: Zymos Brewing / Password: @zymos_brew"}}'::jsonb,
       CURRENT_TIMESTAMP, "ownerId"
FROM "Menu";
