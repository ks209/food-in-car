import prisma from '../config/prisma.js';
import { businessDateKey } from './businessHours.js';

// Atomically bumps (or creates) the current business day's counter for a
// restaurant and returns the new value. The business day follows the
// restaurant's opening hours (IST) — a 1 AM order at a restaurant that closes
// at 2 AM continues the evening's numbering instead of restarting at #1.
// Raw SQL upsert instead of a read-then-write so concurrent order creations
// can't race each other onto the same number.
export async function nextDailyOrderNumber(restaurantId) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { openingTime: true, closingTime: true },
  });
  const date = businessDateKey(restaurant);
  const rows = await prisma.$queryRaw`
    INSERT INTO "DailyCounter" ("restaurantId", "date", "lastNumber")
    VALUES (${restaurantId}, ${date}, 1)
    ON CONFLICT ("restaurantId", "date")
    DO UPDATE SET "lastNumber" = "DailyCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return rows[0].lastNumber;
}
