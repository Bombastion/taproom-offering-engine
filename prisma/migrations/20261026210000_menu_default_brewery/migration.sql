-- AlterTable
-- The brewery a menu's print view and menu board don't name (null names every brewery)
ALTER TABLE "Menu" ADD COLUMN "defaultBreweryId" TEXT;
