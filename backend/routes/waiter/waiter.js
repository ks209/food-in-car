import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import { signWaiterToken } from '../../utils/waiterToken.js';

const waiterRouter = express.Router();

// Dashboard host used to build waiter scan links. Do NOT fall back to
// FRONTEND_URL — that's the mobile ordering app (app.carkhanaa.in) which has no
// /scan route. In production a missing value must fail loudly, not silently
// point waiters at the wrong domain. Localhost default is dev-only.
const DASHBOARD_URL =
  process.env.DASHBOARD_URL ||
  (process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000');

// List a restaurant's waiters with how many orders each has delivered
waiterRouter.get('/', restaurantAuth, async (req, res) => {
  try {
    const waiters = await prisma.waiter.findMany({
      where: { restaurantId: req.restaurantId },
      include: { _count: { select: { orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(waiters.map(w => ({ ...w, deliveredCount: w._count.orders, _count: undefined })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch waiters', details: error.message });
  }
});

// Create a waiter
waiterRouter.post('/', restaurantAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const waiter = await prisma.waiter.create({
      data: { name: name.trim(), phone: phone?.trim() || null, restaurantId: req.restaurantId, isActive: true },
    });
    res.status(201).json(waiter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create waiter', details: error.message });
  }
});

// Update / activate / deactivate a waiter
waiterRouter.put('/:id', restaurantAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.waiter.findFirst({ where: { id, restaurantId: req.restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Waiter not found' });

    const { name, phone, isActive } = req.body;
    const waiter = await prisma.waiter.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });
    res.json(waiter);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update waiter', details: error.message });
  }
});

// Mint a 1-day scan token + link for a waiter
waiterRouter.post('/:id/token', restaurantAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const waiter = await prisma.waiter.findFirst({ where: { id, restaurantId: req.restaurantId } });
    if (!waiter) return res.status(404).json({ error: 'Waiter not found' });
    if (!waiter.isActive) return res.status(400).json({ error: 'Waiter is inactive' });

    if (!DASHBOARD_URL) {
      return res.status(500).json({
        error: 'Scan links are not configured: set DASHBOARD_URL (e.g. https://dash.carkhanaa.in) on the backend.',
      });
    }

    const token = signWaiterToken({ waiterId: waiter.id, restaurantId: req.restaurantId });
    const scanUrl = `${DASHBOARD_URL}/scan?token=${token}`;
    res.json({ token, scanUrl, expiresInHours: 24, waiter: { id: waiter.id, name: waiter.name } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate token', details: error.message });
  }
});

// Orders delivered by a specific waiter
waiterRouter.get('/:id/orders', restaurantAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const waiter = await prisma.waiter.findFirst({ where: { id, restaurantId: req.restaurantId } });
    if (!waiter) return res.status(404).json({ error: 'Waiter not found' });

    const orders = await prisma.order.findMany({
      where: { waiterId: id, restaurantId: req.restaurantId },
      include: { orderItems: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch waiter orders', details: error.message });
  }
});

export default waiterRouter;
