-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "phonepeApiVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "phonepeClientId" TEXT,
ADD COLUMN     "phonepeClientSecret" TEXT,
ADD COLUMN     "phonepeClientVersion" TEXT DEFAULT '1',
ADD COLUMN     "phonepeWebhookUsername" TEXT,
ADD COLUMN     "phonepeWebhookPassword" TEXT;
