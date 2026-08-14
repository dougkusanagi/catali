-- CreateTable
CREATE TABLE "Promotion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL DEFAULT 'Ofertas da semana',
    "subtitle" TEXT NOT NULL DEFAULT 'Preço de atacado para você economizar de verdade',
    "note" TEXT NOT NULL DEFAULT 'Ofertas válidas enquanto durarem os estoques',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imagePath" TEXT NOT NULL,
    "wholesalePriceCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "promotionId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
