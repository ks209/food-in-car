import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { genDeliveryCode } from '../../utils/deliveryCode.js';
import { resolveCustomerByPhone } from '../../utils/customer.js';
import { nextDailyOrderNumber } from '../../utils/dailyOrderNumber.js';
import { validateAndPriceCart } from '../../utils/validateCart.js';
import { isDevMode, baseUrl, xVerifyForPay, reconcileTransaction } from '../../utils/phonepe.js';

const paymentRouter = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:5000';

// `pricedItems`/`totalAmount` are the server-validated result of validateAndPriceCart
// — never the client's raw cart — so the order and the PhonePe charge always agree.
async function createOrder(restaurantId, { pricedItems, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey }) {
  // Vehicle is optional: absent means pickup.
  const vehicle = guestVehicle && guestVehicle.trim() ? guestVehicle.trim().toUpperCase() : null;
  const customer = await resolveCustomerByPhone(mobileNumber, guestName, vehicle);
  const dailyOrderNumber = await nextDailyOrderNumber(parseInt(restaurantId));
  return prisma.order.create({
    data: {
      restaurantId: parseInt(restaurantId),
      userId: customer.id,
      dailyOrderNumber,
      guestName,
      guestVehicle: vehicle,
      totalAmount,
      deliveryCode: genDeliveryCode(),
      deviceKey: deviceKey || null,
      deliveryInstructions: deliveryInstructions || '',
      status: 'PENDING',
      paymentMethod: 'PHONEPE',
      orderStatusHistory: { create: { status: 'PENDING', updatedBy: 'customer' } },
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
  const { restaurantId, items, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey } = req.body;
  if (!restaurantId || !items || !guestName || !mobileNumber) {
    return res.status(400).json({ error: 'Missing required fields (name, phone, items)' });
  }

  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: parseInt(restaurantId) } });
    if (!restaurant || !restaurant.isActive) return res.status(404).json({ error: 'Restaurant not found' });
    if (!restaurant.isOpen) return res.status(400).json({ error: 'Restaurant is currently closed' });

    const priced = await validateAndPriceCart(restaurantId, items);
    if (!priced.ok) return res.status(400).json({ error: priced.error });

    const order = await createOrder(restaurantId, {
      pricedItems: priced.items, totalAmount: priced.totalAmount,
      deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey,
    });

    // No PhonePe credentials configured for THIS restaurant — skip the
    // gateway, go straight to order page (matches the old global dev-mode
    // fallback, just scoped per-tenant now instead of platform-wide).
    if (isDevMode(restaurant)) {
      console.log(`[payment] restaurant ${restaurant.id} has no PhonePe credentials — order ${order.id} placed as PENDING, no charge`);
      return res.json({ orderId: order.id, deliveryCode: order.deliveryCode, redirectUrl: null, devMode: true });
    }

    const merchantTransactionId = `MT${Date.now()}O${order.id}`;
    const amountPaise = Math.round(priced.totalAmount * 100);

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

    const phonePeRes = await axios.post(
      `${baseUrl(restaurant)}/pg/v1/pay`,
      { request: base64Payload },
      { headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerifyForPay(restaurant, base64Payload), accept: 'application/json' } }
    );

    await prisma.merchantTransaction.create({
      data: { orderId: order.id, txnId: merchantTransactionId, status: 'PENDING' },
    });

    const redirectUrl = phonePeRes.data?.data?.instrumentResponse?.redirectInfo?.url;
    if (!redirectUrl) throw new Error('PhonePe did not return a payment URL');

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
