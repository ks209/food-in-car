// Orders that exist only as payment attempts, not as real orders:
//   PENDING        — payment not confirmed yet
//   PAYMENT_FAILED — payment failed or was abandoned (see jobs/verifyPendingOrders.js)
// Every restaurant-facing read (Orders, Kitchen Display, Overview, Analytics,
// Customers, the new-order alert) and the customer's order history leave these
// out, so a customer retrying a failed payment doesn't flood them with
// "Cancelled" orders.
export const NOT_REAL_ORDER_STATES = ['PENDING', 'PAYMENT_FAILED'];
