import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { genDeliveryCode } from '../../utils/deliveryCode.js';
import { resolveCustomerByPhone } from '../../utils/customer.js';

const paymentRouter = express.Router();

const MERCHANT_ID   = process.env.PHONEPE_MERCHANT_ID;
const SALT_KEY      = process.env.PHONEPE_SALT_KEY;
const SALT_INDEX    = process.env.PHONEPE_SALT_INDEX    || '1';
const IS_SANDBOX    = process.env.PHONEPE_IS_SANDBOX !== 'false';
const DEV_MODE      = process.env.PHONEPE_DEV_MODE === 'true' || !MERCHANT_ID || !SALT_KEY;
const FRONTEND_URL  = process.env.FRONTEND_URL  || 'http://localhost:5174';
const BACKEND_URL   = process.env.BACKEND_URL   || 'http://localhost:5000';

const BASE = IS_SANDBOX
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
  : 'https://api.phonepe.com/apis/hermes';

function xVerifyForPay(base64Payload) {
  return crypto.createHash('sha256').update(base64Payload + '/pg/v1/pay' + SALT_KEY).digest('hex')
    + '###' + SALT_INDEX;
}
function xVerifyForStatus(endpoint) {
  return crypto.createHash('sha256').update(endpoint + SALT_KEY).digest('hex')
    + '###' + SALT_INDEX;
}

async function createOrder(req, { restaurantId, items, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey }) {
  const vehicle = guestVehicle.toUpperCase();
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
  if (!restaurantId || !items || !totalAmount || !guestName || !guestVehicle || !mobileNumber) {
    return res.status(400).json({ error: 'Missing required fields (name, phone, vehicle, items)' });
  }

  try {
    const order = await createOrder(req, { restaurantId, items, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey });

    // Dev mode: no PhonePe credentials — skip gateway, go straight to order page
    if (DEV_MODE) {
      console.log('[payment] DEV_MODE — skipping PhonePe, order', order.id, 'placed as PENDING');
      return res.json({ orderId: order.id, redirectUrl: null, devMode: true });
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
      const endpoint = `/pg/v1/status/${MERCHANT_ID}/${txn.txnId}`;
      try {
        const statusRes = await axios.get(`${BASE}${endpoint}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': xVerifyForStatus(endpoint),
            'X-MERCHANT-ID': MERCHANT_ID,
            accept: 'application/json',
          },
        });
        const paid = statusRes.data?.success && statusRes.data?.data?.state === 'COMPLETED';
        if (paid) {
          await prisma.merchantTransaction.updateMany({ where: { txnId: txn.txnId }, data: { status: 'COMPLETED' } });
          await prisma.order.update({
            where: { id: parseInt(orderId) },
            data: { status: 'PAID', orderStatusHistory: { create: { status: 'PAID', updatedBy: 'phonepe' } } },
          });
        }
      } catch { /* status check failed — order stays PENDING, user can see that */ }
    }
  } catch { /* ignore, still redirect */ }

  res.redirect(`${FRONTEND_URL}/restaurant/${restaurantId}/order/${orderId}`);
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

    const endpoint = `/pg/v1/status/${MERCHANT_ID}/${txn.txnId}`;
    const statusRes = await axios.get(`${BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': xVerifyForStatus(endpoint),
        'X-MERCHANT-ID': MERCHANT_ID,
        accept: 'application/json',
      },
    });

    const data = statusRes.data;
    const paid = data?.success && data?.data?.state === 'COMPLETED';
    if (paid && txn.status !== 'COMPLETED') {
      await prisma.merchantTransaction.updateMany({ where: { txnId: txn.txnId }, data: { status: 'COMPLETED' } });
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'PAID', orderStatusHistory: { create: { status: 'PAID', updatedBy: 'phonepe' } } },
      });
    }

    res.json({ txnId: txn.txnId, state: data?.data?.state, localStatus: txn.status, paid });
  } catch (err) {
    res.status(500).json({ error: 'Status check failed', details: err?.response?.data?.message || err.message });
  }
});

export default paymentRouter;
