-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "parkingSpot" TEXT;

-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "parkingSpotRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."ParkingSpot" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParkingSpot_restaurantId_idx" ON "public"."ParkingSpot"("restaurantId");

-- AddForeignKey
ALTER TABLE "public"."ParkingSpot" ADD CONSTRAINT "ParkingSpot_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "public"."Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
