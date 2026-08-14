-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Promotion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL DEFAULT 'Ofertas da semana',
    "subtitle" TEXT NOT NULL DEFAULT 'Preço de atacado para você economizar de verdade',
    "note" TEXT NOT NULL DEFAULT 'Ofertas válidas enquanto durarem os estoques',
    "badgeText" TEXT NOT NULL DEFAULT 'ATACADO',
    "hashtag" TEXT NOT NULL DEFAULT '#VEMPROCRÔNICAS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Promotion" ("createdAt", "id", "note", "subtitle", "title", "updatedAt") SELECT "createdAt", "id", "note", "subtitle", "title", "updatedAt" FROM "Promotion";
DROP TABLE "Promotion";
ALTER TABLE "new_Promotion" RENAME TO "Promotion";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
