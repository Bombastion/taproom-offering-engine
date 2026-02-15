-- CreateTable
CREATE TABLE "Brewery" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultLogo" TEXT,
    "location" TEXT,

    CONSTRAINT "Brewery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemContainer" (
    "id" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "order" INTEGER,

    CONSTRAINT "ItemContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleContainer" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SaleContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "breweryId" TEXT,
    "style" TEXT,
    "abv" DOUBLE PRECISION,
    "description" TEXT,
    "category" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logo" TEXT,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubMenu" (
    "id" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "order" INTEGER,

    CONSTRAINT "SubMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "subMenuId" TEXT NOT NULL,
    "itemLogo" TEXT,
    "order" INTEGER,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);
