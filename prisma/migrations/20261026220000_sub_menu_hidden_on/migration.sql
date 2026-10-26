-- AlterTable
-- The public views a section is left off of ("print", "board", "widget"); empty shows it everywhere
ALTER TABLE "SubMenu" ADD COLUMN "hiddenOn" TEXT[] DEFAULT ARRAY[]::TEXT[];
