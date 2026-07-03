import express from 'express';
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

// Restaurant: all their orders
orderRouter.get('/', restaurantAuth, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { restaurantId: req.restaurantId },
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

// Single order — public for status polling
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
