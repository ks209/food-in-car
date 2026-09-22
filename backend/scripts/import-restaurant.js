// Import a restaurant exported by scripts/export-restaurant.js (or by the
// admin portal's Transfer tab) into THIS database.
//
//   DATABASE_URL="<target url>" node scripts/import-restaurant.js export.json [--dry-run]
//
// Creates it with fresh ids in one transaction; refuses if the web address or
// username is already taken. See utils/restaurantTransfer.js.
import fs from 'fs';
import prisma from '../config/prisma.js';
import { importRestaurant, summarize, validateExport } from '../utils/restaurantTransfer.js';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) {
  console.error('usage: DATABASE_URL="<target url>" node scripts/import-restaurant.js <export.json> [--dry-run]');
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const invalid = validateExport(payload);
if (invalid) {
  console.error(invalid);
  process.exit(1);
}

const s = summarize(payload);
console.log(`Importing "${s.name}" (slug ${s.slug})`);
console.log(`  ${s.categories} categories · ${s.menuItems} menu items · ${s.optionGroups} option groups · ${s.parkingSpots} parking spots`);

if (dryRun) {
  const clash = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: payload.restaurant.slug || undefined }, { username: payload.restaurant.username }] },
    select: { id: true, slug: true, username: true },
  });
  console.log(clash
    ? `\nWould FAIL: id ${clash.id} already uses that slug/username here.`
    : '\nDry run OK — nothing written. Re-run without --dry-run to import.');
  await prisma.$disconnect();
  process.exit(clash ? 1 : 0);
}

const result = await importRestaurant(payload);
if (result.error) {
  console.error(`\n${result.error}`);
  process.exit(1);
}

console.log(`\nDone. New restaurant id ${result.restaurant.id}, slug ${result.restaurant.slug}.`);
console.log(`  categories ${result.counts.categories} · menu items ${result.counts.menuItems} · parking ${result.counts.parkingSpots}`);
console.log('\nNext: set PhonePe credentials in the restaurant dashboard (Settings → Payments).');

await prisma.$disconnect();
