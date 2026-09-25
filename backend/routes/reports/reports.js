import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import { NOT_REAL_ORDER_STATES } from '../../utils/orderStatus.js';

// Reporting for the dashboard: day-end/GST reports, menu performance, server
// performance and the waste log.
//
// Every endpoint takes ?from= and ?to= as ISO timestamps, exactly like
// GET /api/order — the dashboard already converts a picked date range into
// business-day boundaries (lib/format.js localDateRange), so the timezone
// maths lives in one place instead of being redone per report.

const reportsRouter = express.Router();

// Revenue is only counted once an order is actually finished.
const SOLD = 'COMPLETED';

function parseRange(req, res) {
  const from = new Date(req.query.from);
  const to = new Date(req.query.to);
  if (isNaN(from) || isNaN(to)) {
    res.status(400).json({ error: 'from and to are required as ISO timestamps' });
    return null;
  }
  if (from > to) {
    res.status(400).json({ error: 'from must not be after to' });
    return null;
  }
  return { from, to };
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── Day-end / Z report ────────────────────────────────────────────────────────
// What the owner counts the till against: sales, tax, how it was paid, what
// went wrong, and what was thrown away.
reportsRouter.get('/day-end', restaurantAuth, async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;

    const [orders, waste] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId: req.restaurantId,
          status: { notIn: NOT_REAL_ORDER_STATES },
          createdAt: { gte: range.from, lte: range.to },
        },
        select: {
          id: true, dailyOrderNumber: true, status: true, paymentMethod: true, createdAt: true,
          totalAmount: true, gstAmount: true, gstRate: true, subtotalAmount: true,
          guestVehicle: true, cancelReason: true, idempotencyKey: true,
          refunds: { select: { amount: true, status: true } },
        },
      }),
      prisma.wasteLog.findMany({
        where: { restaurantId: req.restaurantId, createdAt: { gte: range.from, lte: range.to } },
        select: { quantity: true, estimatedCost: true, reason: true, name: true },
      }),
    ]);

    const sold = orders.filter((o) => o.status === SOLD);
    const sum = (list, pick) => round2(list.reduce((s, o) => s + (pick(o) || 0), 0));

    // Cash vs online, split over completed orders only — an unfinished order
    // hasn't been paid into the till.
    const byPayment = {};
    for (const o of sold) {
      const key = o.paymentMethod || 'COD';
      byPayment[key] = byPayment[key] || { orders: 0, amount: 0 };
      byPayment[key].orders += 1;
      byPayment[key].amount = round2(byPayment[key].amount + o.totalAmount);
    }

    // Counter bills carry an idempotencyKey (the POS writes one); app orders don't.
    const posOrders = sold.filter((o) => !!o.idempotencyKey);

    const byHour = {};
    for (const o of sold) {
      const hour = new Date(o.createdAt).getHours();
      byHour[hour] = byHour[hour] || { orders: 0, amount: 0 };
      byHour[hour].orders += 1;
      byHour[hour].amount = round2(byHour[hour].amount + o.totalAmount);
    }

    const cancelled = orders.filter((o) => ['CANCELLED', 'NOT_FULFILLED'].includes(o.status));
    const byReason = {};
    for (const o of cancelled) {
      const key = o.cancelReason || 'Not recorded';
      byReason[key] = (byReason[key] || 0) + 1;
    }

    const refunds = orders.flatMap((o) => o.refunds);

    res.json({
      range,
      sales: {
        orders: sold.length,
        gross: sum(sold, (o) => o.totalAmount),
        net: sum(sold, (o) => (o.subtotalAmount ?? o.totalAmount - (o.gstAmount || 0))),
        gst: sum(sold, (o) => o.gstAmount),
        averageOrder: sold.length ? round2(sum(sold, (o) => o.totalAmount) / sold.length) : 0,
      },
      byPayment,
      channels: {
        counter: { orders: posOrders.length, amount: sum(posOrders, (o) => o.totalAmount) },
        app: { orders: sold.length - posOrders.length, amount: round2(sum(sold, (o) => o.totalAmount) - sum(posOrders, (o) => o.totalAmount)) },
      },
      byHour,
      cancellations: { count: cancelled.length, byReason },
      refunds: {
        due: refunds.filter((r) => r.status === 'DUE').length,
        dueAmount: sum(refunds.filter((r) => r.status === 'DUE'), (r) => r.amount),
        completed: refunds.filter((r) => r.status === 'COMPLETED').length,
        completedAmount: sum(refunds.filter((r) => r.status === 'COMPLETED'), (r) => r.amount),
      },
      waste: {
        entries: waste.length,
        cost: sum(waste, (w) => w.estimatedCost),
        items: waste.map((w) => ({ name: w.name, quantity: w.quantity, reason: w.reason, cost: w.estimatedCost })),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build the day-end report', details: error.message });
  }
});

// ── GST report ────────────────────────────────────────────────────────────────
// One row per completed order, in the shape an accountant files from: taxable
// value, CGST, SGST, total. GST is split half/half (intra-state supply, which
// is what a restaurant serving on-premises always is).
reportsRouter.get('/gst', restaurantAuth, async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;

    const orders = await prisma.order.findMany({
      where: {
        restaurantId: req.restaurantId,
        status: SOLD,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true, dailyOrderNumber: true, createdAt: true, gstin: true, gstRate: true,
        gstAmount: true, subtotalAmount: true, totalAmount: true, paymentMethod: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = orders.map((o) => {
      const gst = o.gstAmount || 0;
      const taxable = round2(o.subtotalAmount ?? (o.totalAmount - gst));
      return {
        invoiceNo: o.dailyOrderNumber ?? o.id,
        date: o.createdAt,
        gstin: o.gstin || null,
        sac: '996331', // restaurant service
        rate: o.gstRate || 0,
        taxable,
        cgst: round2(gst / 2),
        sgst: round2(gst / 2),
        total: round2(o.totalAmount),
        payment: o.paymentMethod,
      };
    });

    const totals = rows.reduce((acc, r) => ({
      taxable: round2(acc.taxable + r.taxable),
      cgst: round2(acc.cgst + r.cgst),
      sgst: round2(acc.sgst + r.sgst),
      total: round2(acc.total + r.total),
    }), { taxable: 0, cgst: 0, sgst: 0, total: 0 });

    res.json({ range, rows, totals, count: rows.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build the GST report', details: error.message });
  }
});

// ── Menu performance ──────────────────────────────────────────────────────────
// What sells, what doesn't, and what happened after a price change.
reportsRouter.get('/menu-performance', restaurantAuth, async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const days = Math.max(1, Math.round((range.to - range.from) / 86400000));

    const [items, soldRows, priceChanges] = await Promise.all([
      prisma.menuItem.findMany({
        where: { restaurantId: req.restaurantId, isActive: true },
        select: { id: true, name: true, price: true, available: true, category: { select: { name: true } } },
      }),
      prisma.orderItem.findMany({
        where: {
          order: {
            restaurantId: req.restaurantId,
            status: SOLD,
            createdAt: { gte: range.from, lte: range.to },
          },
        },
        select: { menuItemId: true, name: true, quantity: true, finalPrice: true, order: { select: { createdAt: true } } },
      }),
      prisma.menuItemHistory.findMany({
        where: {
          menuItem: { restaurantId: req.restaurantId },
          changedAt: { gte: range.from, lte: range.to },
        },
        select: { menuItemId: true, name: true, price: true, changedAt: true, changedBy: true },
        orderBy: { changedAt: 'asc' },
      }),
    ]);

    const stats = new Map();
    for (const row of soldRows) {
      // Falls back to the name for off-menu (custom) items, which have no id.
      const key = row.menuItemId ?? `name:${row.name}`;
      const entry = stats.get(key) || { quantity: 0, revenue: 0, lastSold: null, name: row.name };
      entry.quantity += row.quantity;
      entry.revenue = round2(entry.revenue + row.finalPrice * row.quantity);
      const at = row.order.createdAt;
      if (!entry.lastSold || at > entry.lastSold) entry.lastSold = at;
      stats.set(key, entry);
    }

    const totalRevenue = round2([...stats.values()].reduce((s, e) => s + e.revenue, 0));

    const performance = items.map((item) => {
      const entry = stats.get(item.id) || { quantity: 0, revenue: 0, lastSold: null };
      return {
        id: item.id,
        name: item.name,
        category: item.category?.name || null,
        price: item.price,
        available: item.available,
        quantity: entry.quantity,
        revenue: entry.revenue,
        sharePct: totalRevenue ? round2((entry.revenue / totalRevenue) * 100) : 0,
        perDay: round2(entry.quantity / days),
        lastSold: entry.lastSold,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // The smallest set of items making up 80% of revenue — the menu that
    // actually earns, as opposed to the menu that exists.
    const core = [];
    let running = 0;
    for (const row of performance) {
      if (running >= totalRevenue * 0.8) break;
      core.push(row.id);
      running += row.revenue;
    }

    // Price changes with sales either side, so a rise that killed an item is
    // visible rather than inferred.
    const changes = priceChanges.map((change) => {
      const before = soldRows.filter((r) => r.menuItemId === change.menuItemId && r.order.createdAt < change.changedAt);
      const after = soldRows.filter((r) => r.menuItemId === change.menuItemId && r.order.createdAt >= change.changedAt);
      const qty = (list) => list.reduce((s, r) => s + r.quantity, 0);
      const daysBefore = Math.max(1, (change.changedAt - range.from) / 86400000);
      const daysAfter = Math.max(1, (range.to - change.changedAt) / 86400000);
      return {
        menuItemId: change.menuItemId,
        name: change.name,
        price: Number(change.price),
        changedAt: change.changedAt,
        changedBy: change.changedBy,
        perDayBefore: round2(qty(before) / daysBefore),
        perDayAfter: round2(qty(after) / daysAfter),
      };
    });

    res.json({
      range,
      days,
      totalRevenue,
      items: performance,
      coreItemIds: core,
      deadItems: performance.filter((p) => p.quantity === 0).map((p) => p.id),
      priceChanges: changes,
      // Custom/off-menu lines sold at the counter, which have no menu item.
      offMenu: [...stats.entries()]
        .filter(([key]) => typeof key === 'string')
        .map(([, entry]) => ({ name: entry.name, quantity: entry.quantity, revenue: entry.revenue })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build menu performance', details: error.message });
  }
});

// ── Server performance ────────────────────────────────────────────────────────
// Built from the delivery scan: READY is when the kitchen finished, COMPLETED
// is when the server handed it over, so the gap is the server's time.
reportsRouter.get('/servers', restaurantAuth, async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;

    const [waiters, orders] = await Promise.all([
      prisma.waiter.findMany({
        where: { restaurantId: req.restaurantId, deletedAt: null },
        select: { id: true, name: true },
      }),
      prisma.order.findMany({
        where: {
          restaurantId: req.restaurantId,
          createdAt: { gte: range.from, lte: range.to },
          OR: [{ waiterId: { not: null } }, { claimedByWaiterId: { not: null } }],
        },
        select: {
          id: true, status: true, waiterId: true, claimedByWaiterId: true, totalAmount: true,
          orderStatusHistory: { select: { status: true, updatedAt: true }, orderBy: { updatedAt: 'asc' } },
        },
      }),
    ]);

    const byWaiter = new Map(waiters.map((w) => [w.id, {
      id: w.id, name: w.name, deliveries: 0, revenue: 0, claimedNotDelivered: 0, times: [],
    }]));

    for (const order of orders) {
      const delivered = order.status === SOLD && order.waiterId;
      const stat = byWaiter.get(delivered ? order.waiterId : order.claimedByWaiterId);
      if (!stat) continue; // deleted server
      if (!delivered) { stat.claimedNotDelivered += 1; continue; }

      stat.deliveries += 1;
      stat.revenue = round2(stat.revenue + order.totalAmount);
      const ready = order.orderStatusHistory.find((h) => h.status === 'READY');
      const done = [...order.orderStatusHistory].reverse().find((h) => h.status === 'COMPLETED');
      if (ready && done) {
        const minutes = (new Date(done.updatedAt) - new Date(ready.updatedAt)) / 60000;
        if (minutes >= 0 && minutes < 240) stat.times.push(minutes); // ignore clock-skew outliers
      }
    }

    const servers = [...byWaiter.values()].map((s) => {
      const sorted = [...s.times].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
      return {
        id: s.id,
        name: s.name,
        deliveries: s.deliveries,
        revenue: s.revenue,
        claimedNotDelivered: s.claimedNotDelivered,
        avgMinutes: sorted.length ? round2(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
        medianMinutes: median === null ? null : round2(median),
        slowestMinutes: sorted.length ? round2(sorted[sorted.length - 1]) : null,
        // Averages over a handful of deliveries say nothing — the dashboard
        // greys these rows out rather than ranking them.
        enoughData: sorted.length >= 5,
      };
    }).sort((a, b) => b.deliveries - a.deliveries);

    res.json({ range, servers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build server performance', details: error.message });
  }
});

// ── Waste log ─────────────────────────────────────────────────────────────────
reportsRouter.get('/waste', restaurantAuth, async (req, res) => {
  try {
    const range = parseRange(req, res);
    if (!range) return;
    const entries = await prisma.wasteLog.findMany({
      where: { restaurantId: req.restaurantId, createdAt: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: 'desc' },
    });
    const byReason = {};
    for (const e of entries) {
      byReason[e.reason] = round2((byReason[e.reason] || 0) + e.estimatedCost);
    }
    res.json({
      entries,
      totalCost: round2(entries.reduce((s, e) => s + e.estimatedCost, 0)),
      byReason,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch the waste log', details: error.message });
  }
});

reportsRouter.post('/waste', restaurantAuth, async (req, res) => {
  try {
    const { menuItemId, name, quantity, reason, note, estimatedCost } = req.body;
    const qty = Number(quantity);
    if (!reason || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'A quantity and a reason are required' });
    }

    // Costed at the current menu price unless the caller says otherwise, and
    // the name is snapshotted so the log survives menu edits.
    let item = null;
    if (menuItemId) {
      item = await prisma.menuItem.findFirst({
        where: { id: Number(menuItemId), restaurantId: req.restaurantId },
        select: { id: true, name: true, price: true },
      });
      if (!item) return res.status(400).json({ error: 'Menu item not found' });
    }
    if (!item && !name?.trim()) return res.status(400).json({ error: 'Pick an item or give it a name' });

    const entry = await prisma.wasteLog.create({
      data: {
        restaurantId: req.restaurantId,
        menuItemId: item?.id ?? null,
        name: item?.name ?? name.trim(),
        quantity: qty,
        reason: String(reason).slice(0, 80),
        estimatedCost: Number.isFinite(Number(estimatedCost))
          ? Number(estimatedCost)
          : round2((item?.price || 0) * qty),
        note: note?.trim() || null,
        loggedBy: 'restaurant',
      },
    });
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: 'Failed to log waste', details: error.message });
  }
});

export default reportsRouter;
