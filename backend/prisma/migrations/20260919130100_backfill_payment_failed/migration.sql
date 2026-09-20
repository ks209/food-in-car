-- Orders the payment-timeout cron cancelled were never real orders — the
-- customer just didn't finish paying. Move them to PAYMENT_FAILED so they stop
-- showing as "Cancelled" in the dashboard and in customers' order history.
-- (Separate migration from the enum change: Postgres can't use a newly added
-- enum value in the same transaction that added it.)
-- Only orders that were never PAID, so a genuinely paid-then-cancelled order is untouched.
UPDATE "public"."Order" o
SET status = 'PAYMENT_FAILED'
WHERE o.status = 'CANCELLED'
  AND o."paymentMethod" = 'PHONEPE'
  AND EXISTS (
    SELECT 1 FROM "public"."OrderStatusHistory" h
    WHERE h."orderId" = o.id AND h."updatedBy" LIKE 'cron:payment-timeout%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "public"."OrderStatusHistory" h
    WHERE h."orderId" = o.id AND h.status IN ('PAID', 'PREPARING', 'READY', 'COMPLETED')
  );
