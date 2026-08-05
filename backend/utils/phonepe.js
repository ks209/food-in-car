import axios from 'axios';
import crypto from 'crypto';
import prisma from '../config/prisma.js';

// PhonePe credentials are per-restaurant (set from the dashboard's Settings →
// Payments) — every tenant needs payments landing in THEIR OWN merchant
// account, not one shared account for the whole platform.

export function isDevMode(restaurant) {
  return !restaurant.phonepeMerchantId || !restaurant.phonepeSaltKey;
}

export function baseUrl(restaurant) {
  return restaurant.phonepeSandbox === false
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

// Calls PhonePe's status API for one transaction and reconciles our DB if it's
// now COMPLETED or has terminally FAILED. Shared by the redirect/status routes
// (customer-triggered) and the pending-order cron job (self-triggered) so both
// paths agree on what "reconciled" means.
export async function reconcileTransaction(restaurant, txn) {
  const endpoint = `/pg/v1/status/${restaurant.phonepeMerchantId}/${txn.txnId}`;
  const statusRes = await axios.get(`${baseUrl(restaurant)}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerifyForStatus(restaurant, endpoint),
      'X-MERCHANT-ID': restaurant.phonepeMerchantId,
      accept: 'application/json',
    },
  });

  const state = statusRes.data?.data?.state; // COMPLETED | PENDING | FAILED (PhonePe's vocabulary)
  const paid = statusRes.data?.success && state === 'COMPLETED';
  const failed = state === 'FAILED';

  if (paid && txn.status !== 'COMPLETED') {
    await prisma.merchantTransaction.updateMany({ where: { txnId: txn.txnId }, data: { status: 'COMPLETED' } });
    await prisma.order.update({
      where: { id: txn.orderId },
      data: { status: 'PAID', orderStatusHistory: { create: { status: 'PAID', updatedBy: 'phonepe' } } },
    });
  } else if (failed && txn.status !== 'FAILED') {
    await prisma.merchantTransaction.updateMany({ where: { txnId: txn.txnId }, data: { status: 'FAILED' } });
  }

  return { state: state || 'UNKNOWN', paid, failed };
}
