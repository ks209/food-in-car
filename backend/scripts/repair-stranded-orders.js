// One-off repair for orders stranded at PENDING by the old dev-mode checkout.
//
// Before the fix in routes/payment/payment.js, a restaurant with no PhonePe
// credentials had its orders created as PENDING with no MerchantTransaction.
// Nothing could ever advance them: the reconciliation cron starts from
// MerchantTransaction and skips credential-less restaurants anyway, and
// GET /api/order hides PENDING from every dashboard screen. Those orders were
// invisible and unfulfillable.
//
// Deliberately a script, NOT a Prisma migration: on a production tenant with
// real PhonePe credentials, a PENDING order is a genuinely abandoned checkout
// and must stay PENDING. This only ever touches restaurants that have no
// gateway configured — the exact condition that produced the stranding.
//
// Idempotent, and dry-run by default:
//   node scripts/repair-stranded-orders.js            # report only
//   node scripts/repair-stranded-orders.js --apply    # write the changes

import prisma from '../config/prisma.js';
import { isDevMode } from '../utils/phonepe.js';

const apply = process.argv.includes('--apply');

const pending = await prisma.order.findMany({
  where: { status: 'PENDING' },
  include: {
    restaurant: { select: { id: true, name: true, phonepeMerchantId: true, phonepeSaltKey: true } },
  },
  orderBy: { id: 'asc' },
});

const stranded = pending.filter((o) => isDevMode(o.restaurant));
const skipped = pending.length - stranded.length;

if (stranded.length === 0) {
  console.log(`Nothing to repair — ${pending.length} PENDING order(s), none of them dev-mode.`);
} else {
  console.log(`${stranded.length} stranded dev-mode order(s)${apply ? '' : ' (dry run — pass --apply to write)'}:`);
  for (const o of stranded) {
    console.log(`  #${o.id.toString().padEnd(4)} ${o.paymentMethod.padEnd(8)} ${o.restaurant.name} · ₹${o.totalAmount} · ${o.createdAt.toISOString().slice(0, 10)}`);
  }

  if (apply) {
    // One transaction per order, each writing its own history entry so the
    // change is auditable rather than an unexplained status jump.
    for (const o of stranded) {
      await prisma.order.update({
        where: { id: o.id },
        data: {
          status: 'PAID',
          orderStatusHistory: { create: { status: 'PAID', updatedBy: 'script:repair-stranded-dev-mode' } },
        },
      });
    }
    console.log(`\nUpdated ${stranded.length} order(s) to PAID.`);
  }
}

if (skipped > 0) {
  console.log(`\nLeft alone: ${skipped} PENDING order(s) on restaurants WITH PhonePe credentials — those are real abandoned checkouts.`);
}

await prisma.$disconnect();
