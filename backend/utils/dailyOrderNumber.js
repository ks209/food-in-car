import prisma from '../config/prisma.js';

// India-only platform — the "calendar day" a restaurant resets on is IST,
// regardless of the server's own timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istDateKey(d = new Date()) {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Atomically bumps (or creates) today's counter for a restaurant and returns the
// new value. Raw SQL upsert instead of a read-then-write so concurrent order
// creations can't race each other onto the same number.
export async function nextDailyOrderNumber(restaurantId) {
  const date = istDateKey();
  const rows = await prisma.$queryRaw`
    INSERT INTO "DailyCounter" ("restaurantId", "date", "lastNumber")
    VALUES (${restaurantId}, ${date}, 1)
    ON CONFLICT ("restaurantId", "date")
    DO UPDATE SET "lastNumber" = "DailyCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return rows[0].lastNumber;
}
