-- CreateEnum
CREATE TYPE "public"."VenueType" AS ENUM ('UNIVERSITY', 'MALL', 'TECH_PARK', 'OFFICE_PARK', 'HOSPITAL', 'AIRPORT', 'STADIUM', 'RESIDENTIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."VenueMembership" AS ENUM ('STRICT', 'INCLUSIVE');

-- CreateTable
CREATE TABLE "public"."Venue" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "public"."VenueType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "detectRadiusM" INTEGER NOT NULL DEFAULT 500,
    "membershipMode" "public"."VenueMembership" NOT NULL DEFAULT 'STRICT',
    "includeRadiusM" INTEGER,
    "cityId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VenueRestaurant" (
    "id" SERIAL NOT NULL,
    "venueId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VenueRestaurant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Venue_slug_key" ON "public"."Venue"("slug");

-- CreateIndex
CREATE INDEX "Venue_isActive_idx" ON "public"."Venue"("isActive");

-- CreateIndex
CREATE INDEX "VenueRestaurant_restaurantId_idx" ON "public"."VenueRestaurant"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "VenueRestaurant_venueId_restaurantId_key" ON "public"."VenueRestaurant"("venueId", "restaurantId");

-- AddForeignKey
ALTER TABLE "public"."Venue" ADD CONSTRAINT "Venue_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "public"."City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VenueRestaurant" ADD CONSTRAINT "VenueRestaurant_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "public"."Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VenueRestaurant" ADD CONSTRAINT "VenueRestaurant_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "public"."Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
