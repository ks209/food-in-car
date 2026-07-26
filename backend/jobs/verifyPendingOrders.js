import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { DEV_MODE, reconcileTransaction } from '../utils/phonepe.js';

const CHECK_AFTER_MIN = 5;    // give the customer time to finish paying before the first check
const ABANDON_AFTER_MIN = 45; // still pending after this long — treat as abandoned, auto-cancel

// Reconciles orders that started a PhonePe payment but never got a webhook/redirect
// confirmation — e.g. the customer closed the tab mid-payment, or PhonePe's callback
// never reached us. COD orders have no external payment to verify and are never touched.
async function verifyPendingOrders() {
  if (DEV_MODE) return; // no real PhonePe credentials to check against

  const checkCutoff = new Date(Date.now() - CHECK_AFTER_MIN * 60 * 1000);
  const abandonCutoff = new Date(Date.now() - ABANDON_AFTER_MIN * 60 * 1000);

  const stuckTxns = await prisma.merchantTransaction.findMany({
    where: {
      status: 'PENDING',
      order: { status: 'PENDING', paymentMethod: 'PHONEPE', createdAt: { lte: checkCutoff } },
    },
    include: { order: true },
    orderBy: { id: 'desc' },
  });

  if (stuckTxns.length === 0) return;

  let paid = 0, cancelled = 0, stillPending = 0;

  for (const txn of stuckTxns) {
    try {
      const result = await reconcileTransaction(txn);
      if (result.paid) { paid++; continue; }

      // Still unpaid after the abandon window — the customer never completed
      // payment, so stop showing it as a live order in the restaurant's queue.
      // (Edge case: if PhonePe's webhook arrives after this point claiming the
      // payment DID go through, /callback will still flip it back to PAID —
      // not fully closed off, just rare enough not to block on here.)
      if (txn.order.createdAt <= abandonCutoff) {
        await prisma.order.update({
          where: { id: txn.orderId },
          data: {
            status: 'CANCELLED',
            orderStatusHistory: { create: { status: 'CANCELLED', updatedBy: `cron:payment-timeout (${result.state})` } },
          },
        });
        cancelled++;
      } else {
        stillPending++;
      }
    } catch (err) {
      console.error(`[verify-pending-orders] failed to reconcile order #${txn.orderId}:`, err.message);
    }
  }

  console.log(`[verify-pending-orders] checked ${stuckTxns.length} — paid ${paid}, cancelled ${cancelled}, still pending ${stillPending}`);
}

export function startPendingOrderVerification() {
  cron.schedule('*/5 * * * *', verifyPendingOrders);
  console.log('[verify-pending-orders] scheduled every 5 minutes');
}

// Exported for manual/one-off runs (e.g. a maintenance script).
export { verifyPendingOrders };
