import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { isDevMode, reconcileTransaction } from '../utils/phonepe.js';

const CHECK_AFTER_MIN = 5;    // give the customer time to finish paying before the first check
const ABANDON_AFTER_MIN = 45; // still pending after this long — treat as abandoned, auto-cancel

// Reconciles orders that started a PhonePe payment but never got a webhook/redirect
// confirmation — e.g. the customer closed the tab mid-payment, or PhonePe's callback
// never reached us. COD orders have no external payment to verify and are never touched.
async function verifyPendingOrders() {
  const checkCutoff = new Date(Date.now() - CHECK_AFTER_MIN * 60 * 1000);
  const abandonCutoff = new Date(Date.now() - ABANDON_AFTER_MIN * 60 * 1000);

  const stuckTxns = await prisma.merchantTransaction.findMany({
    where: {
      status: 'PENDING',
      order: { status: 'PENDING', paymentMethod: 'PHONEPE', createdAt: { lte: checkCutoff } },
    },
    include: { order: { include: { restaurant: true } } },
    orderBy: { id: 'desc' },
  });

  if (stuckTxns.length === 0) return;

  let paid = 0, cancelled = 0, stillPending = 0, skipped = 0, errored = 0;

  for (const txn of stuckTxns) {
    // Credentials are per-restaurant — a restaurant with none configured has
    // no real PhonePe transaction to check against (this txn was placed in
    // dev mode), so there's nothing to reconcile.
    if (isDevMode(txn.order.restaurant)) { skipped++; continue; }

    // Why the payment is not confirmed — recorded on the cancellation so a
    // timed-out payment can be told apart from an unreachable gateway later.
    let state;
    try {
      const result = await reconcileTransaction(txn.order.restaurant, txn);
      if (result.paid) { paid++; continue; }
      state = result.state;
    } catch (err) {
      // A status lookup throws either because PhonePe has no record of this
      // transaction (POST /initiate died before the gateway accepted it) or
      // because PhonePe is temporarily unreachable. The error shape doesn't
      // reliably separate the two, and both mean "not paid" — so the order
      // follows the same abandon window as any other unpaid order instead of
      // being retried forever, which is what used to strand these as PENDING
      // and invisible on every dashboard screen.
      console.error(`[verify-pending-orders] status check failed for order #${txn.orderId}:`, err.message);
      state = `status-check-failed: ${String(err.message).slice(0, 80)}`;
      errored++;
    }

    // Still unpaid after the abandon window — the customer never completed
    // payment, so stop showing it as a live order in the restaurant's queue.
    // (Edge case: if PhonePe's webhook arrives after this point claiming the
    // payment DID go through, /callback will still flip it back to PAID —
    // not fully closed off, just rare enough not to block on here.)
    if (txn.order.createdAt <= abandonCutoff) {
      try {
        await prisma.order.update({
          where: { id: txn.orderId },
          data: {
            status: 'CANCELLED',
            orderStatusHistory: { create: { status: 'CANCELLED', updatedBy: `cron:payment-timeout (${state})` } },
          },
        });
        cancelled++;
      } catch (err) {
        // One un-updatable order must not abort the rest of the sweep.
        console.error(`[verify-pending-orders] failed to cancel order #${txn.orderId}:`, err.message);
      }
    } else {
      stillPending++;
    }
  }

  console.log(`[verify-pending-orders] checked ${stuckTxns.length} — paid ${paid}, cancelled ${cancelled}, still pending ${stillPending}, status-check errors ${errored}, skipped (no gateway) ${skipped}`);
}

export function startPendingOrderVerification() {
  cron.schedule('*/5 * * * *', verifyPendingOrders);
  console.log('[verify-pending-orders] scheduled every 5 minutes');
}

// Exported for manual/one-off runs (e.g. a maintenance script).
export { verifyPendingOrders };
