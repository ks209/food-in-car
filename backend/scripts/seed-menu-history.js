// Records an opening MenuItemHistory snapshot for menu items that have none.
//
// The price-change analysis in Analytics reads a change as the difference
// between two consecutive snapshots. Items that already existed when history
// tracking was added have no rows at all, so their FIRST price edit would write
// a single row with nothing to compare it against — the change would be
// invisible. This gives each of them a baseline of their current state so the
// next edit forms a readable pair.
//
// Items created from here on get their opening snapshot automatically (see
// POST /api/menu/create), so this only ever needs to run once.
//
// Idempotent — items that already have history are left alone:
//   node scripts/seed-menu-history.js            # report only
//   node scripts/seed-menu-history.js --apply    # write the snapshots

import prisma from '../config/prisma.js';
import { recordMenuSnapshot } from '../utils/menuHistory.js';

const apply = process.argv.includes('--apply');

const items = await prisma.menuItem.findMany({
  where: { isActive: true },
  select: {
    id: true, name: true, description: true, price: true, available: true, isActive: true,
    restaurant: { select: { name: true } },
    _count: { select: { menuItemHistory: true } },
  },
  orderBy: { id: 'asc' },
});

const needing = items.filter((i) => i._count.menuItemHistory === 0);

if (needing.length === 0) {
  console.log(`Nothing to do — all ${items.length} active menu item(s) already have history.`);
} else {
  console.log(`${needing.length} of ${items.length} item(s) have no history${apply ? '' : ' (dry run — pass --apply to write)'}:`);
  for (const i of needing) {
    console.log(`  #${String(i.id).padEnd(4)} ${i.restaurant.name} · ${i.name} · ₹${i.price}`);
  }

  if (apply) {
    for (const i of needing) {
      await recordMenuSnapshot(i, 'script:initial-snapshot');
    }
    console.log(`\nRecorded ${needing.length} opening snapshot(s).`);
  }
}

await prisma.$disconnect();
