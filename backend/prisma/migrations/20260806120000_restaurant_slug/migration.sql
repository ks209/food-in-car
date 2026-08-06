-- Public, URL-safe identifier for a restaurant: /<slug> in the ordering app
-- resolves to exactly what /restaurant/<id> already did.

ALTER TABLE "Restaurant" ADD COLUMN "slug" TEXT;

-- Backfill from the display name ('Spice Garden' -> 'spice-garden'), falling
-- back to the already-unique login username when a restaurant has no name or
-- the name contains nothing sluggable (e.g. an entirely non-Latin name), and
-- finally to 'restaurant-<id>'.
--
-- Written as a loop rather than a window function on purpose: a suffixed slug
-- can itself collide with another row's natural slug (two 'Spice Garden' rows
-- produce 'spice-garden-2', which a restaurant genuinely named 'Spice Garden 2'
-- also wants). Checking each candidate against what has already been assigned
-- is the only form that can't fail the unique index below.
DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id, "name", "username" FROM "Restaurant" ORDER BY id LOOP
    base_slug := NULLIF(trim(BOTH '-' FROM regexp_replace(lower(COALESCE(r."name", '')), '[^a-z0-9]+', '-', 'g')), '');

    IF base_slug IS NULL THEN
      base_slug := NULLIF(trim(BOTH '-' FROM regexp_replace(lower(r."username"), '[^a-z0-9]+', '-', 'g')), '');
    END IF;

    IF base_slug IS NULL THEN
      base_slug := 'restaurant-' || r.id;
    END IF;

    candidate := base_slug;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "Restaurant" WHERE "slug" = candidate) LOOP
      n := n + 1;
      candidate := base_slug || '-' || n;
    END LOOP;

    UPDATE "Restaurant" SET "slug" = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");
