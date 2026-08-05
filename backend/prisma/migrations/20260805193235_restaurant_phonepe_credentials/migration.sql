-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "phonepeMerchantId" TEXT,
ADD COLUMN     "phonepeSaltIndex" TEXT DEFAULT '1',
ADD COLUMN     "phonepeSaltKey" TEXT,
ADD COLUMN     "phonepeSandbox" BOOLEAN NOT NULL DEFAULT true;
