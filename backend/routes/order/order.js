import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import userAuth from '../../middlewares/user.auth.js';
import scanAuth from '../../middlewares/scan.auth.js';
import { genDeliveryCode } from '../../utils/deliveryCode.js';
import { resolveCustomerByPhone } from '../../utils/customer.js';

const orderRouter = express.Router();

const ORDER_INCLUDE = {
  user: { select: { id: true, customerName: true, phoneNumber: true, vehicles: { select: { vehicleNo: true } } } },
  waiter: { select: { id: true, name: true } },
  restaurant: { select: { id: true, name: true, phone: true, address: true } },
  orderItems: { include: { options: true }, orderBy: { id: 'asc' } },
  orderStatusHistory: { orderBy: { updatedAt: 'desc' } },
};

const VALID_STATUSES = ['PENDING', 'PAID', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];

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

// Restaurant: distinct customers who've ordered here, optionally filtered by
// ?search= (matches phone or name). Registered before the public GET /:id
// below — Express matches routes in registration order, and /:id would
// otherwise swallow /customers (treating "customers" as the id param).
orderRouter.get('/customers', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const search = (req.query.search || '').trim();

    const customers = await prisma.user.findMany({
      where: {
        orders: { some: { restaurantId } },
        ...(search
          ? { OR: [
              { phoneNumber: { contains: search } },
              { customerName: { contains: search, mode: 'insensitive' } },
            ] }
          : {}),
      },
      select: {
        id: true,
        customerName: true,
        phoneNumber: true,
        vehicles: { select: { vehicleNo: true } },
        orders: {
          where: { restaurantId },
          select: { totalAmount: true, status: true, createdAt: true },
        },
      },
    });

    const REVENUE_STATES = ['PAID', 'PREPARING', 'READY', 'COMPLETED'];
    const result = customers.map(({ orders, ...c }) => ({
      ...c,
      orderCount: orders.length,
      totalSpent: orders.filter(o => REVENUE_STATES.includes(o.status)).reduce((s, o) => s + o.totalAmount, 0),
      lastOrderAt: orders.reduce((max, o) => (o.createdAt > max ? o.createdAt : max), orders[0]?.createdAt || null),
    })).sort((a, b) => new Date(b.lastOrderAt) - new Date(a.lastOrderAt));

    res.json(result);
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

    // Vehicle is optional: absent means the customer chose pickup.
    const vehicle = guestVehicle && guestVehicle.trim() ? guestVehicle.trim().toUpperCase() : null;

    // Auto-create or find the customer by phone number; remember their vehicle (if any)
    const customer = await resolveCustomerByPhone(mobileNumber, guestName, vehicle);

    const order = await prisma.order.create({
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
