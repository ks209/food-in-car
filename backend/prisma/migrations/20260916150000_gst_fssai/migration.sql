-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "gstAmount" DOUBLE PRECISION,
ADD COLUMN     "gstRate" DOUBLE PRECISION,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "pricesIncludeGst" BOOLEAN,
ADD COLUMN     "subtotalAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "fssaiLicense" TEXT,
ADD COLUMN     "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "pricesIncludeGst" BOOLEAN NOT NULL DEFAULT true;
