import express from 'express';
import prisma from '../../config/prisma.js';
import waiterAuth from '../../middlewares/waiter.auth.js';
import { businessDayRange } from '../../utils/businessHours.js';

// The waiter's phone app (dashboard /scan?token=…). Everything here is scoped to
// the waiter token's restaurant; the delivery itself still goes through
// PUT /api/order/scan, which needs the customer's QR/code as proof of handover.
const waiterAppRouter = express.Router();

const WAITER_ORDER_SELECT = {
  id: true, dailyOrderNumber: true, status: true, createdAt: true, updatedAt: true,
  guestName: true, guestVehicle: true, parkingSpot: true, deliveryInstructions: true,
  totalAmount: true, paymentMethod: true, claimedAt: true, claimedByWaiterId: true,
  claimedBy: { select: { id: true, name: true } },
  user: { select: { customerName: true, phoneNumber: true } },
  orderItems: { select: { id: true, name: true, quantity: true, options: { select: { name: true } } }, orderBy: { id: 'asc' } },
  orderStatusHistory: { select: { status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } },
};

// When the order entered its current status (falls back to updatedAt for orders
// whose history predates status tracking).
function statusSince(order) {
  const entry = order.orderStatusHistory.find((h) => h.status === order.status);
  return (entry ? entry.updatedAt : order.updatedAt).toISOString();
}

function shape(order) {
  const { orderStatusHistory, user, ...rest } = order;
  return {
    ...rest,
    // The name typed on THIS order first — one phone number can order under
    // different names, and the account keeps only the latest one.
    customerName: order.guestName || user?.customerName || 'Guest',
    customerPhone: user?.phoneNumber || null,
    statusSince: statusSince(order),
    deliveredAt: order.status === 'COMPLETED' ? statusSince(order) : null,
  };
}

waiterAppRouter.get('/me', waiterAuth, async (req, res) => {
  try {
    const [waiter, restaurant] = await Promise.all([
      prisma.waiter.findUnique({ where: { id: req.waiterId }, select: { id: true, name: true } }),
      prisma.restaurant.findUnique({
        where: { id: req.restaurantId },
        select: { id: true, name: true, logoUrl: true, themeColor: true, slaWarnMinutes: true, slaCritMinutes: true },
      }),
    ]);
    res.json({ waiter, restaurant, tokenExpiresAt: req.tokenExpiresAt });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load server', details: error.message });
  }
});

// Everything the waiter needs in one poll: orders ready to hand over (from any
// day — an unfinished order never disappears), what the kitchen is still
// preparing, and this waiter's own deliveries for the current business day.
waiterAppRouter.get('/orders', waiterAuth, async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.restaurantId },
      select: { openingTime: true, closingTime: true },
    });
    const { start, end } = businessDayRange(restaurant);

    const [ready, preparing, delivered] = await Promise.all([
      prisma.order.findMany({ where: { restaurantId: req.restaurantId, status: 'READY' }, select: WAITER_ORDER_SELECT }),
      prisma.order.findMany({ where: { restaurantId: req.restaurantId, status: { in: ['PAID', 'PREPARING'] } }, select: WAITER_ORDER_SELECT }),
      prisma.order.findMany({
        where: { restaurantId: req.restaurantId, status: 'COMPLETED', waiterId: req.waiterId, updatedAt: { gte: start, lt: end } },
        select: WAITER_ORDER_SELECT,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const byStatusSince = (a, b) => new Date(a.statusSince) - new Date(b.statusSince);
    res.json({
      ready: ready.map(shape).sort(byStatusSince),
      preparing: preparing.map(shape).sort(byStatusSince),
      delivered: delivered.map(shape),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load orders', details: error.message });
  }
});

// "I'm taking this one" — atomic, so two waiters tapping at once can't both win.
waiterAppRouter.post('/orders/:id/claim', waiterAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { count } = await prisma.order.updateMany({
      where: {
        id, restaurantId: req.restaurantId, status: 'READY',
        OR: [{ claimedByWaiterId: null }, { claimedByWaiterId: req.waiterId }],
      },
      data: { claimedByWaiterId: req.waiterId, claimedAt: new Date() },
    });
    if (count === 0) {
      const order = await prisma.order.findFirst({
        where: { id, restaurantId: req.restaurantId },
        select: { status: true, claimedBy: { select: { name: true } } },
      });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.status !== 'READY') return res.status(409).json({ error: 'This order is no longer waiting for delivery' });
      return res.status(409).json({ error: `Already taken by ${order.claimedBy?.name || 'another server'}` });
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to take order', details: error.message });
  }
});

// Release your own claim (e.g. you can't find the car) so someone else can take it.
waiterAppRouter.delete('/orders/:id/claim', waiterAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { count } = await prisma.order.updateMany({
      where: { id, restaurantId: req.restaurantId, claimedByWaiterId: req.waiterId },
      data: { claimedByWaiterId: null, claimedAt: null },
    });
    if (count === 0) return res.status(404).json({ error: 'You have not taken this order' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to release order', details: error.message });
  }
});

export default waiterAppRouter;
