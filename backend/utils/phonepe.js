import axios from 'axios';
import crypto from 'crypto';
import prisma from '../config/prisma.js';

// PhonePe credentials are per-restaurant (set from the dashboard's Settings →
// Payments) — every tenant needs payments landing in THEIR OWN merchant
// account, not one shared account for the whole platform.
//
// Two PhonePe APIs are supported, chosen per restaurant by phonepeApiVersion:
//   v1 — legacy PG: Merchant ID + Salt Key, requests signed with X-VERIFY.
//   v2 — Standard Checkout: Client ID + Client Secret → OAuth bearer token.
//        PhonePe only issues these to newly onboarded merchants, whose
//        accounts 404 on the v1 endpoints.
// Routes and the reconciliation cron only use initiatePayment /
// reconcileTransaction below and never need to know which one is in play.

// Which API this restaurant can actually use, or null when its credentials
// for the selected version are incomplete (→ dev mode).
export function gatewayVersion(restaurant) {
  if (restaurant.phonepeApiVersion === 'v2') {
    return restaurant.phonepeClientId && restaurant.phonepeClientSecret ? 'v2' : null;
  }
  return restaurant.phonepeMerchantId && restaurant.phonepeSaltKey ? 'v1' : null;
}

export function isDevMode(restaurant) {
  return !gatewayVersion(restaurant);
}

const isLive = (restaurant) => restaurant.phonepeSandbox === false;

// ── v1 (Salt Key) ─────────────────────────────────────────────────────────────

export function baseUrl(restaurant) {
  return isLive(restaurant)
    ? 'https://api.phonepe.com/apis/hermes'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}

export function xVerifyForPay(restaurant, base64Payload) {
  return crypto.createHash('sha256').update(base64Payload + '/pg/v1/pay' + restaurant.phonepeSaltKey).digest('hex')
    + '###' + (restaurant.phonepeSaltIndex || '1');
}
export function xVerifyForStatus(restaurant, endpoint) {
  return crypto.createHash('sha256').update(endpoint + restaurant.phonepeSaltKey).digest('hex')
    + '###' + (restaurant.phonepeSaltIndex || '1');
}

async function initiateV1(restaurant, { merchantOrderId, amountPaise, redirectUrl, callbackUrl, mobileNumber, merchantUserId }) {
  const payload = {
    merchantId: restaurant.phonepeMerchantId,
    merchantTransactionId: merchantOrderId,
    merchantUserId,
    amount: amountPaise,
    redirectUrl,
    redirectMode: 'REDIRECT',
    callbackUrl,
    ...(mobileNumber ? { mobileNumber: String(mobileNumber) } : {}),
    paymentInstrument: { type: 'PAY_PAGE' },
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

  const res = await axios.post(
    `${baseUrl(restaurant)}/pg/v1/pay`,
    { request: base64Payload },
    { headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerifyForPay(restaurant, base64Payload), accept: 'application/json' } }
  );
  return { redirectUrl: res.data?.data?.instrumentResponse?.redirectInfo?.url, raw: res.data };
}

async function fetchStateV1(restaurant, txnId) {
  const endpoint = `/pg/v1/status/${restaurant.phonepeMerchantId}/${txnId}`;
  const res = await axios.get(`${baseUrl(restaurant)}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerifyForStatus(restaurant, endpoint),
      'X-MERCHANT-ID': restaurant.phonepeMerchantId,
      accept: 'application/json',
    },
  });
  const state = res.data?.data?.state; // COMPLETED | PENDING | FAILED
  return { state, paid: !!res.data?.success && state === 'COMPLETED', amountPaise: res.data?.data?.amount };
}

// ── v2 (Standard Checkout, OAuth) ─────────────────────────────────────────────

const v2Urls = (restaurant) => isLive(restaurant)
  ? { token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token', pg: 'https://api.phonepe.com/apis/pg' }
  : { token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token', pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox' };

// Access tokens are cached per client + environment until shortly before they
// expire, rather than fetching a new one for every payment/status call.
const tokenCache = new Map();

async function getAccessToken(restaurant, { force = false } = {}) {
  const key = `${isLive(restaurant) ? 'live' : 'uat'}:${restaurant.phonepeClientId}:${restaurant.phonepeClientVersion || '1'}`;
  const cached = tokenCache.get(key);
  if (!force && cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const res = await axios.post(
    v2Urls(restaurant).token,
    new URLSearchParams({
      client_id: restaurant.phonepeClientId,
      client_version: restaurant.phonepeClientVersion || '1',
      client_secret: restaurant.phonepeClientSecret,
      grant_type: 'client_credentials',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const token = res.data?.access_token;
  if (!token) throw new Error('PhonePe did not return an access token — check the Client ID / Secret / Version');
  // expires_at is epoch SECONDS; fall back to a conservative 10 minutes
  const expiresAt = res.data?.expires_at ? res.data.expires_at * 1000 : Date.now() + 10 * 60_000;
  tokenCache.set(key, { token, expiresAt });
  return token;
}

// One retry with a fresh token on 401, in case PhonePe revoked/rotated it early.
async function v2Request(restaurant, config) {
  const send = async (force) => axios({
    ...config,
    headers: { ...config.headers, 'Content-Type': 'application/json', Authorization: `O-Bearer ${await getAccessToken(restaurant, { force })}` },
  });
  try {
    return await send(false);
  } catch (err) {
    if (err?.response?.status !== 401) throw err;
    return send(true);
  }
}

async function initiateV2(restaurant, { merchantOrderId, amountPaise, redirectUrl }) {
  const res = await v2Request(restaurant, {
    method: 'post',
    url: `${v2Urls(restaurant).pg}/checkout/v2/pay`,
    data: {
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 900, // 15 min — same window as the abandon cron (jobs/verifyPendingOrders.js)
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl },
      },
    },
  });
  return { redirectUrl: res.data?.redirectUrl, raw: res.data };
}

async function fetchStateV2(restaurant, txnId) {
  const res = await v2Request(restaurant, {
    method: 'get',
    url: `${v2Urls(restaurant).pg}/checkout/v2/order/${encodeURIComponent(txnId)}/status`,
    params: { details: false },
  });
  const state = res.data?.state; // COMPLETED | PENDING | FAILED
  return { state, paid: state === 'COMPLETED', amountPaise: res.data?.amount };
}

// ── Refunds ───────────────────────────────────────────────────────────────────
// Normalised to PENDING | COMPLETED | FAILED (v2 also reports CONFIRMED —
// accepted by PhonePe, money not yet moved — which is still PENDING for us).
const refundState = (s) => (s === 'COMPLETED' ? 'COMPLETED' : s === 'FAILED' ? 'FAILED' : 'PENDING');

async function refundV1(restaurant, { originalTxnId, refundTxnId, amountPaise, merchantUserId, callbackUrl }) {
  const payload = {
    merchantId: restaurant.phonepeMerchantId,
    merchantUserId,
    originalTransactionId: originalTxnId,
    merchantTransactionId: refundTxnId,
    amount: amountPaise,
    callbackUrl,
  };
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = crypto.createHash('sha256').update(base64Payload + '/pg/v1/refund' + restaurant.phonepeSaltKey).digest('hex')
    + '###' + (restaurant.phonepeSaltIndex || '1');
  const res = await axios.post(
    `${baseUrl(restaurant)}/pg/v1/refund`,
    { request: base64Payload },
    { headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify, accept: 'application/json' } }
  );
  if (!res.data?.success) throw new Error(res.data?.message || res.data?.code || 'Refund rejected by PhonePe');
  return refundState(res.data?.data?.state);
}

async function refundV2(restaurant, { originalTxnId, refundTxnId, amountPaise }) {
  const res = await v2Request(restaurant, {
    method: 'post',
    url: `${v2Urls(restaurant).pg}/payments/v2/refund`,
    data: { merchantRefundId: refundTxnId, originalMerchantOrderId: originalTxnId, amount: amountPaise },
  });
  return refundState(res.data?.state);
}

// Asks PhonePe to refund `amountPaise` of the payment `originalTxnId`
// (our MerchantTransaction.txnId). Returns the normalised refund state.
export async function initiateRefund(restaurant, params) {
  const version = gatewayVersion(restaurant);
  if (!version) throw new Error('PhonePe is not configured for this restaurant');
  return version === 'v2' ? refundV2(restaurant, params) : refundV1(restaurant, params);
}

export async function fetchRefundState(restaurant, refundTxnId) {
  const version = gatewayVersion(restaurant);
  if (!version) throw new Error('PhonePe is not configured for this restaurant');
  if (version === 'v2') {
    const res = await v2Request(restaurant, {
      method: 'get',
      url: `${v2Urls(restaurant).pg}/payments/v2/refund/${encodeURIComponent(refundTxnId)}/status`,
    });
    return refundState(res.data?.state);
  }
  // v1 uses the same status endpoint as payments, keyed by the refund's own id
  return refundState((await fetchStateV1(restaurant, refundTxnId)).state);
}

// ── Public API ────────────────────────────────────────────────────────────────

// Starts a payment and returns the PhonePe pay-page URL to send the customer to.
// merchantOrderId is our txnId (MerchantTransaction.txnId) in both versions.
export async function initiatePayment(restaurant, params) {
  const version = gatewayVersion(restaurant);
  if (!version) throw new Error('PhonePe is not configured for this restaurant');
  return version === 'v2' ? initiateV2(restaurant, params) : initiateV1(restaurant, params);
}

// Asks PhonePe (the source of truth) for a transaction's state.
export async function fetchPaymentState(restaurant, txnId) {
  const version = gatewayVersion(restaurant);
  if (!version) throw new Error('PhonePe is not configured for this restaurant');
  return version === 'v2' ? fetchStateV2(restaurant, txnId) : fetchStateV1(restaurant, txnId);
}

// Calls PhonePe's status API for one transaction and reconciles our DB if it's
// now COMPLETED or has terminally FAILED. Shared by the redirect/status routes
// (customer-triggered), the v2 webhook, and the pending-order cron job
// (self-triggered) so every path agrees on what "reconciled" means.
export async function reconcileTransaction(restaurant, txn) {
  const { state, paid: gatewayPaid, amountPaise } = await fetchPaymentState(restaurant, txn.txnId);

  // Never mark an order paid for less than it costs.
  let paid = gatewayPaid;
  if (paid && amountPaise != null) {
    const order = await prisma.order.findUnique({ where: { id: txn.orderId }, select: { totalAmount: true } });
    if (order && Number(amountPaise) < Math.round(order.totalAmount * 100)) {
      console.error(`[payment] txn ${txn.txnId}: PhonePe amount ${amountPaise} paise < order total ${order.totalAmount} — not marking paid`);
      paid = false;
    }
  }
  const failed = state === 'FAILED';

  if (paid && txn.status !== 'COMPLETED') {
    await prisma.merchantTransaction.updateMany({ where: { txnId: txn.txnId }, data: { status: 'COMPLETED' } });
    await markOrderPaid(txn.orderId, 'phonepe');
  } else if (failed && txn.status !== 'FAILED') {
    await prisma.merchantTransaction.updateMany({ where: { txnId: txn.txnId }, data: { status: 'FAILED' } });
    await markPaymentFailed(txn.orderId, 'phonepe');
  }

  return { state: state || 'UNKNOWN', paid, failed };
}

// PhonePe confirmed payment → the order becomes real (PAID). Only from
// PENDING / PAYMENT_FAILED: PhonePe re-sends callbacks and several paths
// (callback, webhook, redirect, cron) can confirm the same payment, and an
// unconditional update would yank an order the kitchen already moved to
// PREPARING/READY back to PAID.
export async function markOrderPaid(orderId, updatedBy) {
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ['PENDING', 'PAYMENT_FAILED'] } },
    data: { status: 'PAID' },
  });
  if (count) {
    await prisma.orderStatusHistory.create({ data: { orderId, status: 'PAID', updatedBy } });
  }
}

// PhonePe says the payment failed → the order was never real. Only moves an
// order that's still PENDING, so it can't clobber one that was paid meanwhile.
// The customer's status page shows it as a failed payment; the dashboard never
// sees it (see utils/orderStatus.js).
export async function markPaymentFailed(orderId, updatedBy) {
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING' },
    data: { status: 'PAYMENT_FAILED' },
  });
  if (count) {
    await prisma.orderStatusHistory.create({ data: { orderId, status: 'PAYMENT_FAILED', updatedBy } });
  }
}

// v2 webhook auth: PhonePe sends Authorization: SHA256("username:password")
// (hex), using the credentials configured on the webhook in its dashboard.
export function verifyV2WebhookAuth(restaurant, authorizationHeader) {
  if (!restaurant.phonepeWebhookUsername || !restaurant.phonepeWebhookPassword) return false;
  const expected = crypto.createHash('sha256')
    .update(`${restaurant.phonepeWebhookUsername}:${restaurant.phonepeWebhookPassword}`)
    .digest('hex');
  const received = String(authorizationHeader || '').replace(/^SHA256\s+/i, '').trim().toLowerCase();
  return received.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// For settings responses: drops the write-only secrets and replaces them with
// "is it set?" flags the dashboard can show.
export function withoutPhonepeSecrets(restaurant) {
  const { phonepeSaltKey, phonepeClientSecret, phonepeWebhookPassword, ...safe } = restaurant;
  return {
    ...safe,
    phonepeConfigured: !isDevMode(restaurant),
    phonepeSaltKeySet: !!phonepeSaltKey,
    phonepeClientSecretSet: !!phonepeClientSecret,
    phonepeWebhookConfigured: !!(restaurant.phonepeWebhookUsername && phonepeWebhookPassword),
  };
}
