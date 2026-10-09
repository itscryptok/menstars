-- Add niche to User (contributor's content niche, optional, one per contributor for v1)
ALTER TABLE "User" ADD COLUMN "niche" TEXT;
