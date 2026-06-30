-- Drop hero metadata fields not used in this product (delivery time, cost-for-two, distance).
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "deliveryTime";
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "costForTwo";
ALTER TABLE "Restaurant" DROP COLUMN IF EXISTS "distanceKm";
