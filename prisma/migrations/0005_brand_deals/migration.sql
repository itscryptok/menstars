-- Opt-in: contributor is open to brand deals (brand-facing matching only, default OFF)
ALTER TABLE "User" ADD COLUMN "openToBrandDeals" BOOLEAN NOT NULL DEFAULT false;
