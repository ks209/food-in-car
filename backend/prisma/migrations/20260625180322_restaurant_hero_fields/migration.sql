-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "costForTwo" INTEGER,
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "cuisines" TEXT,
ADD COLUMN     "deliveryTime" TEXT,
ADD COLUMN     "distanceKm" DOUBLE PRECISION,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER;
