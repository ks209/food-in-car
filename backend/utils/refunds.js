import prisma from '../config/prisma.js';
import { isDevMode, initiateRefund, fetchRefundState } from './phonepe.js';

// Refunds a paid PhonePe order the restaurant cancelled or couldn't fulfil.
// Always the full amount — partial refunds aren't a dashboard action (yet).
//
// Triggered by PUT /api/order/:id/status (→ CANCELLED / NOT_FULFILLED) and
// retried from the dashboard via POST /api/order/:id/refund. Settled by the
// v1 refund callback / v2 webhook and the 5-min cron (verifyPendingRefunds).

// PhonePe's v1 refund callback. Not trusted either — it only triggers a
// status check (see POST /api/payment/refund-callback).
const REFUND_CALLBACK_URL = `${(process.env.BACKEND_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')}/api/payment/refund-callback`;

// Returns { refund } when one exists or was started, or { skipped: reason }.
// Safe to call repeatedly: an order with a PENDING or COMPLETED refund is left
// alone, so a double-click or a retried request can never refund twice.
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
  // double-clicked Cancel) would otherwise both see "no refund yet" and both
  // refund the customer. The second waits here, then finds the first's row.
  // Row first, like payments: a crash mid-call still leaves something the
  // cron can reconcile instead of a refund nobody knows was requested.
  const { active, refund } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const existing = await tx.refund.findFirst({ where: { orderId, status: { in: ['PENDING', 'COMPLETED'] } } });
    if (existing) return { active: existing };
    return {
      refund: await tx.refund.create({
        data: { orderId, refundTxnId: `RF${Date.now()}O${orderId}`, amount: order.totalAmount, status: 'PENDING' },
      }),
    };
  });
  if (active) return { refund: active };

  try {
    const state = await initiateRefund(order.restaurant, {
      originalTxnId: payment.txnId,
      refundTxnId: refund.refundTxnId,
      amountPaise: Math.round(order.totalAmount * 100),
      merchantUserId: `MUID${order.id}`,
      callbackUrl: REFUND_CALLBACK_URL,
    });
    return { refund: await prisma.refund.update({ where: { id: refund.id }, data: { status: state } }) };
  } catch (err) {
    const pp = err?.response;
    const error = pp?.data?.message || pp?.data?.code || err.message;
    console.error(`[refund] order ${orderId} refund ${refund.refundTxnId} failed:`, pp ? `HTTP ${pp.status} ${JSON.stringify(pp.data)}` : err.message);
    return { refund: await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED', error: String(error).slice(0, 300) } }) };
  }
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
