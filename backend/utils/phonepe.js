import axios from 'axios';
import crypto from 'crypto';
import prisma from '../config/prisma.js';

export const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
export const SALT_KEY    = process.env.PHONEPE_SALT_KEY;
export const SALT_INDEX  = process.env.PHONEPE_SALT_INDEX || '1';
export const IS_SANDBOX  = process.env.PHONEPE_IS_SANDBOX !== 'false';
export const DEV_MODE    = process.env.PHONEPE_DEV_MODE === 'true' || !MERCHANT_ID || !SALT_KEY;

export const BASE = IS_SANDBOX
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
  : 'https://api.phonepe.com/apis/hermes';

export function xVerifyForPay(base64Payload) {
  return crypto.createHash('sha256').update(base64Payload + '/pg/v1/pay' + SALT_KEY).digest('hex')
    + '###' + SALT_INDEX;
}
export function xVerifyForStatus(endpoint) {
  return crypto.createHash('sha256').update(endpoint + SALT_KEY).digest('hex')
    + '###' + SALT_INDEX;
}

// Calls PhonePe's status API for one transaction and reconciles our DB if it's
// now COMPLETED or has terminally FAILED. Shared by the redirect/status routes
// (customer-triggered) and the pending-order cron job (self-triggered) so both
// paths agree on what "reconciled" means.
export async function reconcileTransaction(txn) {
  const endpoint = `/pg/v1/status/${MERCHANT_ID}/${txn.txnId}`;
  const statusRes = await axios.get(`${BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerifyForStatus(endpoint),
      'X-MERCHANT-ID': MERCHANT_ID,
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
