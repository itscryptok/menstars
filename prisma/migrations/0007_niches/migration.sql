-- Niche catalog + multi-niche contributors
CREATE TABLE "Niche" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'base',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Niche_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Niche_name_key" ON "Niche"("name");

ALTER TABLE "User" ADD COLUMN "niches" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill from the old single-niche column
UPDATE "User" SET "niches" = ARRAY["niche"] WHERE "niche" IS NOT NULL AND "niche" <> '';

ALTER TABLE "User" DROP COLUMN "niche";
