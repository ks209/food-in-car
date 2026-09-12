-- AlterTable
ALTER TABLE "public"."Category" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Seed each restaurant's existing categories with a stable order (current
-- id order) so the first drag in the dashboard has a sane starting point
-- instead of every category sharing position 0.
UPDATE "public"."Category" c
SET "position" = ordered.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "restaurantId" ORDER BY id) AS rn
  FROM "public"."Category"
) ordered
WHERE c.id = ordered.id;
