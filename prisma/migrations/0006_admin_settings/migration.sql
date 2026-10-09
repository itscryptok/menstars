-- Admin key/value settings (e.g. admin_password_hash). Never exposed publicly.
CREATE TABLE "AdminSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);
