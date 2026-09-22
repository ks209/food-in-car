// Export ONE restaurant's setup (profile, menu with options, parking spots) to
// a JSON file — the command-line twin of the admin portal's Transfer tab, for
// moving a restaurant between deployments without its test data.
//
//   DATABASE_URL="<source url>" node scripts/export-restaurant.js <id|slug> [out.json]
//
// Read-only. Orders, customers, payments, waiters and PhonePe credentials are
// not exported — see utils/restaurantTransfer.js.
import fs from 'fs';
import prisma from '../config/prisma.js';
import { buildRestaurantExport, summarize } from '../utils/restaurantTransfer.js';

const arg = process.argv[2];
const outFile = process.argv[3] || `restaurant-export-${Date.now()}.json`;
if (!arg) {
  console.error('usage: DATABASE_URL="<source url>" node scripts/export-restaurant.js <id|slug> [out.json]');
  process.exit(1);
}

const payload = await buildRestaurantExport(arg);
if (!payload) {
  console.error(`No restaurant found for "${arg}"`);
  process.exit(1);
}

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
const s = summarize(payload);
console.log(`Exported "${s.name}" (slug ${s.slug}) -> ${outFile}`);
console.log(`  ${s.categories} categories · ${s.menuItems} menu items · ${s.optionGroups} option groups · ${s.parkingSpots} parking spots`);
console.log('  Not included: orders, customers, payments, waiters, PhonePe credentials.');

await prisma.$disconnect();
