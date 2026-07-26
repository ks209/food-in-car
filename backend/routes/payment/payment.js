import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { genDeliveryCode } from '../../utils/deliveryCode.js';
import { resolveCustomerByPhone } from '../../utils/customer.js';
import { MERCHANT_ID, SALT_KEY, DEV_MODE, BASE, xVerifyForPay, reconcileTransaction } from '../../utils/phonepe.js';

const paymentRouter = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const BACKEND_URL  = process.env.BACKEND_URL  || 'http://localhost:5000';

async function createOrder(req, { restaurantId, items, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey }) {
  // Vehicle is optional: absent means pickup.
  const vehicle = guestVehicle && guestVehicle.trim() ? guestVehicle.trim().toUpperCase() : null;
  const customer = await resolveCustomerByPhone(mobileNumber, guestName, vehicle);
  return prisma.order.create({
    data: {
      restaurantId: parseInt(restaurantId),
      userId: customer.id,
      guestName,
      guestVehicle: vehicle,
      totalAmount: parseFloat(totalAmount),
      deliveryCode: genDeliveryCode(),
      deviceKey: deviceKey || null,
      deliveryInstructions: deliveryInstructions || '',
      status: 'PENDING',
      paymentMethod: 'PHONEPE',
      orderStatusHistory: { create: { status: 'PENDING', updatedBy: 'customer' } },
      orderItems: {
        create: items.map(i => ({
          menuItemId: i.id || null,
          name: i.name,
          unitPrice: i.price,
          finalPrice: i.price,
          quantity: i.quantity || 1,
          options: {
            create: (i.selectedOptions || []).map(o => ({
              name: o.name,
              priceDelta: o.priceDelta || 0,
            })),
          },
        })),
      },
    },
  });
}

// ── POST /api/payment/initiate ────────────────────────────────────────────────
paymentRouter.post('/initiate', async (req, res) => {
  const { restaurantId, items, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey } = req.body;
  if (!restaurantId || !items || !totalAmount || !guestName || !mobileNumber) {
    return res.status(400).json({ error: 'Missing required fields (name, phone, items)' });
  }

  try {
    const order = await createOrder(req, { restaurantId, items, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey });

    // Dev mode: no PhonePe credentials — skip gateway, go straight to order page
    if (DEV_MODE) {
      console.log('[payment] DEV_MODE — skipping PhonePe, order', order.id, 'placed as PENDING');
      return res.json({ orderId: order.id, deliveryCode: order.deliveryCode, redirectUrl: null, devMode: true });
    }

    const merchantTransactionId = `MT${Date.now()}O${order.id}`;
    const amountPaise = Math.round(parseFloat(totalAmount) * 100);

    const payload = {
      merchantId: MERCHANT_ID,
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
      `${BASE}/pg/v1/pay`,
      { request: base64Payload },
      { headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerifyForPay(base64Payload), accept: 'application/json' } }
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
// PhonePe server-to-server webhook after payment completes.
paymentRouter.post('/callback', async (req, res) => {
  try {
    const xVerify = req.headers['x-verify'];
    const responseBody = req.body?.response;
    if (!xVerify || !responseBody) return res.status(400).send('Bad request');

    const [receivedHash] = xVerify.split('###');
    const computedHash = crypto.createHash('sha256').update(responseBody + SALT_KEY).digest('hex');
    if (computedHash !== receivedHash) return res.status(401).send('Unauthorized');

    const decoded = JSON.parse(Buffer.from(responseBody, 'base64').toString('utf8'));
    const txnId   = decoded?.data?.merchantTransactionId;
    const paid    = decoded?.success && decoded?.data?.state === 'COMPLETED';

    if (txnId) {
      const newStatus = paid ? 'COMPLETED' : 'FAILED';
      await prisma.merchantTransaction.updateMany({ where: { txnId }, data: { status: newStatus } });
      if (paid) {
        const txn = await prisma.merchantTransaction.findFirst({ where: { txnId } });
        if (txn) {
          await prisma.order.update({
            where: { id: txn.orderId },
            data: { status: 'PAID', orderStatusHistory: { create: { status: 'PAID', updatedBy: 'phonepe' } } },
          });
        }
      }
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
    const txn = await prisma.merchantTransaction.findFirst({
      where: { orderId: parseInt(orderId) },
      orderBy: { id: 'desc' },
    });
    if (txn && txn.status !== 'COMPLETED') {
      await reconcileTransaction(txn).catch(() => {}); // status check failed — order stays PENDING, user can see that
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
    const txn = await prisma.merchantTransaction.findFirst({
      where: { orderId },
      orderBy: { id: 'desc' },
    });
    if (!txn) return res.json({ status: 'NO_TRANSACTION' });

    const { state, paid } = await reconcileTransaction(txn);
    res.json({ txnId: txn.txnId, state, localStatus: paid ? 'COMPLETED' : txn.status, paid });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed', details: err?.response?.data?.message || err.message });
  }
});

export default paymentRouter;
