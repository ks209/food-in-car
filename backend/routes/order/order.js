import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import userAuth from '../../middlewares/user.auth.js';
import scanAuth from '../../middlewares/scan.auth.js';
import { genDeliveryCode } from '../../utils/deliveryCode.js';
import { resolveCustomerByPhone } from '../../utils/customer.js';
import { nextDailyOrderNumber } from '../../utils/dailyOrderNumber.js';

const orderRouter = express.Router();

const ORDER_INCLUDE = {
  user: { select: { id: true, customerName: true, phoneNumber: true, vehicles: { select: { vehicleNo: true } } } },
  waiter: { select: { id: true, name: true } },
  restaurant: { select: { id: true, name: true, phone: true, address: true } },
  orderItems: { include: { options: true }, orderBy: { id: 'asc' } },
  orderStatusHistory: { orderBy: { updatedAt: 'desc' } },
};

const VALID_STATUSES = ['PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'NOT_FULFILLED'];

// Only a COMPLETED order is real, counted revenue — everything else (including
// in-flight PAID/PREPARING/READY) is excluded until it actually finishes.
const REVENUE_STATES = ['COMPLETED'];

// Restaurant: their orders, optionally bounded by ?from=&to= (ISO timestamps).
// Callers pass local day boundaries already converted to UTC — this route does no
// timezone math of its own, just a plain createdAt range filter.
orderRouter.get('/', restaurantAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = { restaurantId: req.restaurantId };
    if (from || to) {
      where.createdAt = {};
      if (from) {
        const fromDate = new Date(from);
        if (isNaN(fromDate)) return res.status(400).json({ error: 'Invalid from date' });
        where.createdAt.gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (isNaN(toDate)) return res.status(400).json({ error: 'Invalid to date' });
        where.createdAt.lte = toDate;
      }
    }

    const orders = await prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
  }
});

// User: their own orders
orderRouter.get('/mine', userAuth, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.userId },
      include: {
        orderItems: { include: { options: true } },
        orderStatusHistory: { orderBy: { updatedAt: 'desc' } },
        restaurant: { select: { id: true, name: true, domain: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
  }
});

// Delivery: scan the QR code on the customer's phone to mark an order COMPLETED.
// Authorized by a waiter's 1-day token (?token=) or the restaurant cookie (scanAuth).
orderRouter.put('/scan', scanAuth, async (req, res) => {
  try {
    const code = (req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'No code provided' });

    const order = await prisma.order.findUnique({ where: { deliveryCode: code } });
    if (!order || order.restaurantId !== req.restaurantId) {
      return res.status(404).json({ error: 'Order not found for this restaurant' });
    }
    if (order.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Order already completed', order });
    }
    if (order.status !== 'READY') {
      return res.status(409).json({ error: `Order is not ready for delivery (status: ${order.status})` });
    }

    // Resolve the delivering waiter's name (if a waiter token was used) for the history log
    let updatedBy = 'restaurant';
    if (req.waiterId) {
      const waiter = await prisma.waiter.findUnique({ where: { id: req.waiterId } });
      updatedBy = waiter ? `waiter:${waiter.name}` : 'waiter';
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        waiterId: req.waiterId || null,
        orderStatusHistory: { create: { status: 'COMPLETED', updatedBy } },
      },
      include: ORDER_INCLUDE,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to complete order', details: error.message });
  }
});

// Whitelisted sort columns for /customers — never interpolate req.query directly
// into SQL; only these literal fragments (picked by key) ever reach the query.
const CUSTOMER_SORT_COLUMNS = {
  name: 'u."customerName"',
  totalSpent: '"totalSpent"',
  orderCount: '"orderCount"',
  lastOrderAt: '"lastOrderAt"',
};

// Restaurant: distinct customers who've ordered here, paginated + sorted +
// optionally filtered by ?search= (matches phone or name). Aggregates
// (orderCount/totalSpent/lastOrderAt) are computed in the DB via GROUP BY so
// sorting/paginating doesn't require pulling every order row into Node.
// Registered before the public GET /:id below — Express matches routes in
// registration order, and /:id would otherwise swallow /customers.
orderRouter.get('/customers', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const search = (req.query.search || '').trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const sortColumn = CUSTOMER_SORT_COLUMNS[req.query.sortBy] || CUSTOMER_SORT_COLUMNS.lastOrderAt;
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT u.id, u."customerName", u."phoneNumber",
        COUNT(o.id)::int AS "orderCount",
        COALESCE(SUM(CASE WHEN o.status = 'COMPLETED' THEN o."totalAmount" ELSE 0 END), 0)::float AS "totalSpent",
        MAX(o."createdAt") AS "lastOrderAt",
        COUNT(*) OVER()::int AS "totalCount"
      FROM "User" u
      JOIN "Order" o ON o."userId" = u.id AND o."restaurantId" = $1
      WHERE ($2 = '' OR u."phoneNumber" ILIKE '%' || $2 || '%' OR u."customerName" ILIKE '%' || $2 || '%')
      GROUP BY u.id, u."customerName", u."phoneNumber"
      ORDER BY ${sortColumn} ${sortDir} NULLS LAST
      LIMIT $3 OFFSET $4
      `,
      restaurantId, search, pageSize, offset
    );

    const total = rows[0]?.totalCount ?? 0;
    const userIds = rows.map(r => r.id);
    const vehicles = userIds.length
      ? await prisma.userVehicle.findMany({ where: { userId: { in: userIds } }, select: { userId: true, vehicleNo: true } })
      : [];
    const vehiclesByUser = new Map();
    for (const v of vehicles) {
      if (!vehiclesByUser.has(v.userId)) vehiclesByUser.set(v.userId, []);
      vehiclesByUser.get(v.userId).push({ vehicleNo: v.vehicleNo });
    }

    const customers = rows.map(({ totalCount, ...r }) => ({
      ...r,
      vehicles: vehiclesByUser.get(r.id) || [],
    }));

    res.json({ customers, total, page, pageSize });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customers', details: error.message });
  }
});

// Restaurant: one customer's full order history here (no date bound)
orderRouter.get('/customers/:phone', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const orders = await prisma.order.findMany({
      where: { restaurantId, user: { phoneNumber: req.params.phone } },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customer orders', details: error.message });
  }
});

// Single order — used for the customer's status-tracking page. No login is required
// (guest checkout has no session), so instead of trusting the bare numeric id —
// which is sequential and trivially enumerable — the caller must prove they're
// entitled to see it: either the order's own deliveryCode (handed to the customer
// once, at checkout) or a logged-in session that owns the order.
orderRouter.get('/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        ...ORDER_INCLUDE,
        merchantTransaction: true,
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const providedCode = (req.query.code || '').trim().toUpperCase();
    const codeMatches = order.deliveryCode && providedCode === order.deliveryCode;

    let ownsOrder = false;
    const token = req.cookies?.userToken;
    if (!codeMatches && token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 's3cret');
        ownsOrder = decoded.id === order.userId;
      } catch {
        // invalid/expired token — falls through to the 403 below
      }
    }

    if (!codeMatches && !ownsOrder) {
      return res.status(403).json({ error: 'Not authorized to view this order' });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch order', details: error.message });
  }
});

// Create order — no auth required (guest checkout + auto user creation keyed by phone)
orderRouter.post('/create', async (req, res) => {
  try {
    const { restaurantId, items, totalAmount, deliveryInstructions, guestName, guestVehicle, mobileNumber, deviceKey } = req.body;
    if (!restaurantId || !items || !totalAmount || !guestName || !mobileNumber) {
      return res.status(400).json({ error: 'Name, phone number and items are required' });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: parseInt(restaurantId) } });
    if (!restaurant || !restaurant.isActive) return res.status(404).json({ error: 'Restaurant not found' });
    if (!restaurant.isOpen) return res.status(400).json({ error: 'Restaurant is currently closed' });

    // Vehicle is optional: absent means the customer chose pickup.
    const vehicle = guestVehicle && guestVehicle.trim() ? guestVehicle.trim().toUpperCase() : null;

    // Auto-create or find the customer by phone number; remember their vehicle (if any)
    const customer = await resolveCustomerByPhone(mobileNumber, guestName, vehicle);
    const dailyOrderNumber = await nextDailyOrderNumber(parseInt(restaurantId));

    const order = await prisma.order.create({
      data: {
        restaurantId: parseInt(restaurantId),
        userId: customer.id,
        dailyOrderNumber,
        guestName,
        guestVehicle: vehicle,
        totalAmount: parseFloat(totalAmount),
        deliveryCode: genDeliveryCode(),
        deviceKey: deviceKey || null,
        deliveryInstructions: deliveryInstructions || '',
        status: 'PENDING',
        paymentMethod: 'COD',
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
      include: { orderItems: { include: { options: true } }, orderStatusHistory: true },
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
});

// Restaurant: create a walk-in bill from the offline-capable dashboard POS.
// Unlike /create (guest checkout), this is authenticated as the restaurant and the
// customer's phone is optional — a dine-in bill doesn't need one. The bill is
// considered settled the moment it's rung up, so it's created straight into
// COMPLETED (no kitchen/delivery pipeline).
//
// `idempotencyKey` (client-generated, one per locally-queued bill) makes this safe
// to retry: the offline queue may re-POST a bill whose first attempt actually
// succeeded but whose response never made it back to the browser (tab closed,
// connection dropped mid-request). On a repeat, we return the original order
// instead of billing twice.
orderRouter.post('/pos', restaurantAuth, async (req, res) => {
  try {
    const { items, totalAmount, guestName, guestVehicle, mobileNumber, paymentMethod, idempotencyKey } = req.body;
    if (!items?.length || !totalAmount) {
      return res.status(400).json({ error: 'Items and total are required' });
    }
    if (!idempotencyKey) {
      return res.status(400).json({ error: 'idempotencyKey is required' });
    }

    const existing = await prisma.order.findUnique({ where: { idempotencyKey }, include: ORDER_INCLUDE });
    if (existing) {
      if (existing.restaurantId !== req.restaurantId) return res.status(409).json({ error: 'idempotencyKey already used by another restaurant' });
      return res.status(200).json(existing);
    }

    const vehicle = guestVehicle && guestVehicle.trim() ? guestVehicle.trim().toUpperCase() : null;

    let userId = null;
    if (mobileNumber && mobileNumber.trim()) {
      const customer = await resolveCustomerByPhone(mobileNumber.trim(), guestName || 'Walk-in Customer', vehicle);
      userId = customer.id;
    }

    const dailyOrderNumber = await nextDailyOrderNumber(req.restaurantId);

    const order = await prisma.order.create({
      data: {
        restaurantId: req.restaurantId,
        userId,
        dailyOrderNumber,
        idempotencyKey,
        guestName: (guestName || '').trim() || 'Walk-in Customer',
        guestVehicle: vehicle,
        totalAmount: parseFloat(totalAmount),
        deliveryCode: genDeliveryCode(),
        deliveryInstructions: '',
        status: 'COMPLETED',
        paymentMethod: paymentMethod === 'PHONEPE' ? 'PHONEPE' : 'COD',
        orderStatusHistory: { create: { status: 'COMPLETED', updatedBy: 'restaurant (POS)' } },
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
      include: ORDER_INCLUDE,
    });

    res.status(201).json(order);
  } catch (error) {
    // Unique-constraint race on idempotencyKey — a concurrent retry beat us to it.
    if (error.code === 'P2002') {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey: req.body.idempotencyKey }, include: ORDER_INCLUDE });
      if (existing) return res.status(200).json(existing);
    }
    res.status(500).json({ error: 'Failed to create bill', details: error.message });
  }
});

// Restaurant: update order status
orderRouter.put('/:id/status', restaurantAuth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await prisma.order.findFirst({
      where: { id: orderId, restaurantId: req.restaurantId },
    });
    if (!existing) return res.status(403).json({ error: 'Not authorized' });

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        orderStatusHistory: { create: { status, updatedBy: 'restaurant' } },
      },
      include: ORDER_INCLUDE,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update order status', details: error.message });
  }
});

export default orderRouter;
