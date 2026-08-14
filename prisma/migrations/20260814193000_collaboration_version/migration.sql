ALTER TABLE "Promotion" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PromotionHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "promotionVersion" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PromotionHistory_promotionVersion_idx" ON "PromotionHistory"("promotionVersion");
