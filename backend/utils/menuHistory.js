import prisma from '../config/prisma.js';

// MenuItemHistory is an append-only record of what an item looked like from a
// given moment onward. A row is written when a tracked field actually changes,
// so consecutive rows for one item read as "price was X, then became Y on this
// date" — which is what the price-change analysis in Analytics compares demand
// across.
//
// The table existed in the schema from the start but nothing ever wrote to it;
// these helpers are what make it real. Rows only exist from the point tracking
// began, so the analysis can only speak to changes made after that.

// Fields worth a history row. Name and description are recorded for context but
// don't themselves trigger one — renaming a dish isn't a pricing event.
export function isTrackedChange(before, after) {
  return Number(before.price) !== Number(after.price) || before.available !== after.available;
}

export async function recordMenuSnapshot(item, changedBy = 'restaurant') {
  try {
    await prisma.menuItemHistory.create({
      data: {
        menuItemId: item.id,
        name: item.name,
        description: item.description ?? null,
        price: item.price,
        available: item.available,
        isActive: item.isActive ?? true,
        changedBy,
      },
    });
  } catch (err) {
    // An audit row must never break the edit that triggered it.
    console.error(`[menu-history] failed to record snapshot for item ${item?.id}:`, err.message);
  }
}
