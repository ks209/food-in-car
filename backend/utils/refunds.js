import prisma from '../config/prisma.js';
import { isDevMode, fetchRefundState } from './phonepe.js';

// Tracks money owed back on a paid PhonePe order the restaurant cancelled or
// couldn't fulfil. Always the full amount.
//
// AUTOMATIC REFUNDS ARE OFF. Calling PhonePe's refund API didn't work against
// the live account, so cancelling now only RECORDS a refund as DUE: the
// restaurant refunds from their PhonePe dashboard and marks it done here
// (POST /api/order/:id/refund-done). The gateway calls themselves are still in
// utils/phonepe.js (initiateRefund / fetchRefundState) — re-enable by calling
// initiateRefund below and creating the row as PENDING instead of DUE.
//
// Statuses: DUE (owed, restaurant to refund) · COMPLETED (done) ·
// PENDING/FAILED (only from the automatic attempts made before this was off).

// Returns { refund } when one exists or was recorded, or { skipped: reason }.
// Safe to call repeatedly: an order that already has a refund is left alone.
export async function refundOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: true,
      merchantTransaction: { where: { status: 'COMPLETED' }, orderBy: { id: 'desc' }, take: 1 },
    },
  });
  if (!order) return { skipped: 'Order not found' };
  if (!['CANCELLED', 'NOT_FULFILLED'].includes(order.status)) return { skipped: 'Only cancelled or unfulfilled orders are refunded' };
  if (order.paymentMethod !== 'PHONEPE') return { skipped: 'Not paid online' };

  const payment = order.merchantTransaction[0];
  // Dev-mode orders (no gateway configured) were never charged.
  if (!payment || isDevMode(order.restaurant)) return { skipped: 'No online payment to refund' };

  // Check-and-create under a row lock on the order: two concurrent calls (a
  // double-clicked Cancel) would otherwise both record a refund. The second
  // waits here, then finds the first's row.
  const { active, refund } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const existing = await tx.refund.findFirst({ where: { orderId, status: { in: ['DUE', 'PENDING', 'COMPLETED'] } } });
    if (existing) return { active: existing };
    return {
      refund: await tx.refund.create({
        data: { orderId, refundTxnId: `RF${Date.now()}O${orderId}`, amount: order.totalAmount, status: 'DUE' },
      }),
    };
  });
  return { refund: active || refund };
}

// The restaurant refunded this order themselves in PhonePe and is recording it.
export async function markRefundDone(orderId) {
  const refund = await prisma.refund.findFirst({
    where: { orderId, status: { in: ['DUE', 'PENDING', 'FAILED'] } },
    orderBy: { id: 'desc' },
  });
  if (!refund) return { skipped: 'No refund is outstanding on this order' };
  return { refund: await prisma.refund.update({ where: { id: refund.id }, data: { status: 'COMPLETED', error: null } }) };
}

// Re-checks one PENDING refund with PhonePe and records the outcome.
export async function reconcileRefund(refund) {
  const order = await prisma.order.findUnique({ where: { id: refund.orderId }, include: { restaurant: true } });
  if (!order || isDevMode(order.restaurant)) return refund;
  const state = await fetchRefundState(order.restaurant, refund.refundTxnId);
  if (state === refund.status) return refund;
  return prisma.refund.update({
    where: { id: refund.id },
    data: { status: state, ...(state === 'FAILED' ? { error: 'PhonePe reported the refund as failed' } : {}) },
  });
}

// Cron: settle refunds PhonePe is still processing.
export async function verifyPendingRefunds() {
  const pending = await prisma.refund.findMany({ where: { status: 'PENDING' } });
  for (const refund of pending) {
    try { await reconcileRefund(refund); }
    catch (err) { console.error(`[refund] status check failed for ${refund.refundTxnId}:`, err.message); }
  }
}
