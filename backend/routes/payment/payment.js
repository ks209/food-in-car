import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { genDeliveryCode } from '../../utils/deliveryCode.js';
import { resolveCustomerByPhone } from '../../utils/customer.js';
import { nextDailyOrderNumber } from '../../utils/dailyOrderNumber.js';
import { validateAndPriceCart } from '../../utils/validateCart.js';
import { isDevMode, baseUrl, xVerifyForPay, reconcileTransaction } from '../../utils/phonepe.js';
import { resolveOrderParkingSpot } from '../parking/parking.js';
import { customerOpenState } from '../../utils/businessHours.js';
import { orderGst } from '../../utils/gst.js';

const paymentRouter = express.Router();

// These are handed to PhonePe (redirectUrl/callbackUrl) and to res.redirect,
// so they must be absolute. A value like "api.carkhanaa.in" (no scheme) is
// treated by the browser as a path on PhonePe's own site and lands on
// "PhonePe Page not found" after payment. Same for a malformed scheme like
// "https:api.carkhanaa.in" (missing //). Repair both to a proper https:// URL.
function absoluteUrl(name, fallback) {
  const raw = (process.env[name] || fallback).trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/]/i.test(raw)) return raw;
  const match = raw.match(/^(https?):\/*(.*)$/i);
  const fixed = match ? `${match[1].toLowerCase()}://${match[2]}` : `https://${raw}`;
  console.warn(`[config] ${name}="${raw}" is not a valid absolute URL — using ${fixed}`);
  return fixed;
}
const FRONTEND_URL = absoluteUrl('FRONTEND_URL', 'http://localhost:5174');
const BACKEND_URL  = absoluteUrl('BACKEND_URL',  'http://localhost:5000');

// `pricedItems`/`totalAmount` are the server-validated result of validateAndPriceCart
// — never the client's raw cart — so the order and the PhonePe charge always agree.
//
// `status` is PENDING for the real gateway flow (nothing is owed to the kitchen
// until PhonePe confirms) but PAID in dev mode, where there is no gateway to
// wait on and the order is final the moment it's created.
async function createOrder(restaurantId, { pricedItems, tax, deliveryInstructions, guestName, vehicle, parkingSpot, mobileNumber, deviceKey, status = 'PENDING' }) {
  const customer = await resolveCustomerByPhone(mobileNumber, guestName, vehicle);
  const dailyOrderNumber = await nextDailyOrderNumber(parseInt(restaurantId));
  return prisma.order.create({
    data: {
      restaurantId: parseInt(restaurantId),
      userId: customer.id,
      dailyOrderNumber,
      guestName,
      guestVehicle: vehicle,
      parkingSpot,
      // GST snapshot + the amount actually charged (see utils/gst.js)
      subtotalAmount: tax.subtotalAmount,
      gstRate: tax.gstRate,
      gstAmount: tax.gstAmount,
      gstin: tax.gstin,
      pricesIncludeGst: tax.pricesIncludeGst,
      totalAmount: tax.totalAmount,
      deliveryCode: genDeliveryCode(),
      deviceKey: deviceKey || null,
      deliveryInstructions: deliveryInstructions || '',
      status,
      paymentMethod: 'PHONEPE',
      orderStatusHistory: { create: { status, updatedBy: 'customer' } },
      orderItems: {
        create: pricedItems.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          unitPrice: i.unitPrice,
          finalPrice: i.finalPrice,
          quantity: i.quantity,
          options: { create: i.options.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
        })),
      },
    },
  });
}

// ── POST /api/payment/initiate ────────────────────────────────────────────────
paymentRouter.post('/initiate', async (req, res) => {
  const { restaurantId, items, deliveryInstructions, guestName, guestVehicle, parkingSpotId, mobileNumber, deviceKey } = req.body;
  if (!restaurantId || !items || !guestName || !mobileNumber) {
    return res.status(400).json({ error: 'Missing required fields (name, phone, items)' });
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: parseInt(restaurantId) } });
    if (!restaurant || !restaurant.isActive) return res.status(404).json({ error: 'Restaurant not found' });
    const openState = customerOpenState(restaurant);
    if (!openState.isOpen) {
      return res.status(400).json({
        error: openState.closedReason === 'hours' ? `Restaurant is closed now — opens at ${openState.opensAt}` : 'Restaurant is currently closed',
      });
    }

    const priced = await validateAndPriceCart(restaurantId, items);
    if (!priced.ok) return res.status(400).json({ error: priced.error });

    // Vehicle is optional: absent means pickup, which never has a parking spot.
    const vehicle = guestVehicle && guestVehicle.trim() ? guestVehicle.trim().toUpperCase() : null;
    const parking = await resolveOrderParkingSpot(restaurant.id, { isDelivery: !!vehicle, parkingSpotId });
    if (!parking.ok) return res.status(400).json({ error: parking.error });

    // GST on the server-priced subtotal: added on top when menu prices exclude
    // it, split out of the price when they include it. tax.totalAmount is
    // what PhonePe charges.
    const tax = orderGst(restaurant, priced.totalAmount);

    // No PhonePe credentials configured for THIS restaurant — skip the gateway
    // (matches the old global dev-mode fallback, just scoped per-tenant now).
    //
    // Such an order is created PAID, not PENDING. A dev-mode order has no
    // gateway result to wait for, and nothing existed that could ever move it
    // off PENDING: the reconciliation cron starts from MerchantTransaction,
    // which this path never creates, and skips credential-less restaurants
    // regardless. Since GET /api/order hides PENDING from every dashboard
    // screen, those orders were stranded — invisible in Overview, Orders,
    // Kitchen Display and Analytics alike, with no way to ever be fulfilled.
    const devMode = isDevMode(restaurant);

    const order = await createOrder(restaurantId, {
      pricedItems: priced.items, tax,
      deliveryInstructions, guestName, vehicle, parkingSpot: parking.name, mobileNumber, deviceKey,
      status: devMode ? 'PAID' : 'PENDING',
    });

    if (devMode) {
      console.log(`[payment] restaurant ${restaurant.id} has no PhonePe credentials — order ${order.id} placed as PAID, no charge`);
      return res.json({ orderId: order.id, deliveryCode: order.deliveryCode, redirectUrl: null, devMode: true });
    }

    const merchantTransactionId = `MT${Date.now()}O${order.id}`;
    const amountPaise = Math.round(tax.totalAmount * 100);

    const payload = {
      merchantId: restaurant.phonepeMerchantId,
      merchantTransactionId,
      merchantUserId: `MUID${order.id}`,
      amount: amountPaise,
      redirectUrl: `${BACKEND_URL}/api/payment/redirect?orderId=${order.id}&restaurantId=${restaurantId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${BACKEND_URL}/api/payment/callback`,
      ...(mobileNumber ? { mobileNumber: String(mobileNumber) } : {}),
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

    // Recorded BEFORE the gateway call, not after it. verifyPendingOrders finds
    // stuck orders by walking MerchantTransaction rows, so an order without one
    // is invisible to it — and if the call below throws (PhonePe unreachable,
    // or a salt key mistyped in Settings), the order would sit PENDING forever,
    // hidden from every dashboard screen with nothing able to resolve it.
    // Writing the row first means anything that reached the gateway is always
    // reconcilable, including the attempts that failed.
    await prisma.merchantTransaction.create({
      data: { orderId: order.id, txnId: merchantTransactionId, status: 'PENDING' },
    });

    const phonePeRes = await axios.post(
      `${baseUrl(restaurant)}/pg/v1/pay`,
      { request: base64Payload },
      { headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerifyForPay(restaurant, base64Payload), accept: 'application/json' } }
    );

    const redirectUrl = phonePeRes.data?.data?.instrumentResponse?.redirectInfo?.url;
    // PhonePe can answer "success" with a pay-page URL whose token is literally
    // "undefined" (e.g. …/transact/undefined) — typically live credentials sent
    // to the sandbox host or vice versa. Sending the customer there just shows
    // PhonePe's "Something went wrong", so fail loudly here instead.
    if (!redirectUrl || /\/undefined\/?$/.test(redirectUrl)) {
      console.error(`[payment] restaurant ${restaurant.id} (sandbox=${restaurant.phonepeSandbox}) got unusable pay URL:`, JSON.stringify(phonePeRes.data));
      throw new Error('PhonePe did not return a valid payment URL — check the restaurant\'s PhonePe credentials and Sandbox/Production setting');
    }

    res.json({ orderId: order.id, redirectUrl });
  } catch (err) {
    console.error('PhonePe initiate error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Payment initiation failed', details: err?.response?.data?.message || err.message });
  }
});

// ── POST /api/payment/callback ────────────────────────────────────────────────
// PhonePe server-to-server webhook after payment completes. Salt keys are now
// per-restaurant, so unlike before we can't verify the signature until we know
// WHICH restaurant this transaction belongs to — decode first (safe, just
// reading bytes) to find the transaction, THEN verify against that
// restaurant's salt key before trusting anything in the payload.
paymentRouter.post('/callback', async (req, res) => {
  try {
    const xVerify = req.headers['x-verify'];
    const responseBody = req.body?.response;
    if (!xVerify || !responseBody) return res.status(400).send('Bad request');

    const decoded = JSON.parse(Buffer.from(responseBody, 'base64').toString('utf8'));
    const txnId = decoded?.data?.merchantTransactionId;
    if (!txnId) return res.status(400).send('Bad request');

    const txn = await prisma.merchantTransaction.findFirst({
      where: { txnId },
      include: { order: { include: { restaurant: true } } },
    });
    if (!txn) return res.status(404).send('Unknown transaction');
    const restaurant = txn.order.restaurant;

    const [receivedHash] = xVerify.split('###');
    const computedHash = crypto.createHash('sha256').update(responseBody + restaurant.phonepeSaltKey).digest('hex');
    if (computedHash !== receivedHash) return res.status(401).send('Unauthorized');

    const paid = decoded?.success && decoded?.data?.state === 'COMPLETED';
    const newStatus = paid ? 'COMPLETED' : 'FAILED';
    await prisma.merchantTransaction.updateMany({ where: { txnId }, data: { status: newStatus } });
    if (paid) {
      await prisma.order.update({
        where: { id: txn.orderId },
        data: { status: 'PAID', orderStatusHistory: { create: { status: 'PAID', updatedBy: 'phonepe' } } },
      });
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('PhonePe callback error:', err.message);
    res.status(500).send('Error');
  }
});

// ── GET /api/payment/redirect ─────────────────────────────────────────────────
// Browser is redirected here after the customer completes (or cancels) payment.
// We verify status with PhonePe then redirect to the order status page.
paymentRouter.get('/redirect', async (req, res) => {
  const { orderId, restaurantId } = req.query;
  try {
    const order = await prisma.order.findUnique({ where: { id: parseInt(orderId) }, include: { restaurant: true } });
    const txn = await prisma.merchantTransaction.findFirst({
      where: { orderId: parseInt(orderId) },
      orderBy: { id: 'desc' },
    });
    if (order && txn && txn.status !== 'COMPLETED') {
      await reconcileTransaction(order.restaurant, txn).catch(() => {}); // status check failed — order stays PENDING, user can see that
    }
  } catch { /* ignore, still redirect */ }

  // Carry the delivery code so the status page (which requires it for guest,
  // unauthenticated access) can load without an extra auth step.
  let code = '';
  try {
    const o = await prisma.order.findUnique({ where: { id: parseInt(orderId) }, select: { deliveryCode: true } });
    code = o?.deliveryCode || '';
  } catch { /* fall through without a code — status page will 403 and show "not found" */ }

  res.redirect(`${FRONTEND_URL}/restaurant/${restaurantId}/order/${orderId}?code=${code}`);
});

// ── GET /api/payment/status/:orderId ─────────────────────────────────────────
// Frontend can poll this to get real-time payment status.
paymentRouter.get('/status/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { restaurant: true } });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const txn = await prisma.merchantTransaction.findFirst({
      where: { orderId },
      orderBy: { id: 'desc' },
    });
    if (!txn) return res.json({ status: 'NO_TRANSACTION' });

    const { state, paid } = await reconcileTransaction(order.restaurant, txn);
    res.json({ txnId: txn.txnId, state, localStatus: paid ? 'COMPLETED' : txn.status, paid });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed', details: err?.response?.data?.message || err.message });
  }
});

export default paymentRouter;
