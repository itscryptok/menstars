-- Brand shortlist inquiries (inquiry-only v1)
CREATE TABLE "ShortlistInquiry" (
    "id" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortlistInquiry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShortlistInquiry_status_idx" ON "ShortlistInquiry"("status");
CREATE INDEX "ShortlistInquiry_createdAt_idx" ON "ShortlistInquiry"("createdAt");
