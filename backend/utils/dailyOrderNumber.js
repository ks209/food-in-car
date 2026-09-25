import prisma from '../config/prisma.js';
import { businessDateKey } from './businessHours.js';

// Atomically bumps (or creates) the current business day's counter for a
// restaurant and returns the new value. The business day follows the
// restaurant's opening hours (IST) — a 1 AM order at a restaurant that closes
// at 2 AM continues the evening's numbering instead of restarting at #1.
// Raw SQL upsert instead of a read-then-write so concurrent order creations
// can't race each other onto the same number.
// `when` is the moment the order was actually placed. It matters for offline
// POS bills, which sync later — sometimes the next morning: without it a bill
// rung up last night would take a number from today's series while being dated
// yesterday, so yesterday's list would show #1, #2, then a stray #37.
export async function nextDailyOrderNumber(restaurantId, when = new Date()) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { openingTime: true, closingTime: true },
  });
  const date = businessDateKey(restaurant, when);
  const rows = await prisma.$queryRaw`
    INSERT INTO "DailyCounter" ("restaurantId", "date", "lastNumber")
    VALUES (${restaurantId}, ${date}, 1)
    ON CONFLICT ("restaurantId", "date")
    DO UPDATE SET "lastNumber" = "DailyCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return rows[0].lastNumber;
}
