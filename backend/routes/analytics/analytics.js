import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';

const analyticsRouter = express.Router();

// Only COMPLETED orders are real revenue — cancelled/not-fulfilled/in-flight
// orders don't count. Mirrors the same constants on the dashboard.
const REVENUE_STATES = ['COMPLETED'];
const NON_SALE_STATES = ['CANCELLED', 'NOT_FULFILLED'];
const RESOLVED_STATES = ['COMPLETED', ...NON_SALE_STATES];

const DAY_MS = 24 * 60 * 60 * 1000;

// How many rows each "top N" list returns. The client renders these directly.
const TOP_CATEGORIES = 8;
const TOP_ITEMS = 6;
const SLOWEST_ITEMS = 6;
const MATRIX_ITEMS = 40;
const DEAD_ITEMS = 12;
const TOP_OPTIONS = 8;
// Below this an attach rate is noise — two orders of an item both adding a
// topping is not a 100% attach rate worth acting on.
const MIN_OPTION_SAMPLE = 3;

// ── Local-time helpers ────────────────────────────────────────────────────────
// Day bucketing has to happen in the RESTAURANT's local timezone, not the
// server's — a Node process in UTC would otherwise split an IST evening service
// across two calendar days. The client sends its offset (minutes east of UTC,
// i.e. -getTimezoneOffset()), so this matches exactly what the browser used to
// compute for itself.
const shifted = (date, offsetMin) => new Date(new Date(date).getTime() + offsetMin * 60000);
const localDateStr = (date, offsetMin) => shifted(date, offsetMin).toISOString().slice(0, 10);
const localHour = (date, offsetMin) => shifted(date, offsetMin).getUTCHours();

// Local midnight (start) / end-of-day for a YYYY-MM-DD string, as real UTC instants.
const startOfLocalDay = (dateStr, offsetMin) => new Date(Date.parse(`${dateStr}T00:00:00Z`) - offsetMin * 60000);
const endOfLocalDay = (dateStr, offsetMin) => new Date(Date.parse(`${dateStr}T23:59:59.999Z`) - offsetMin * 60000);

function addDays(dateStr, n) {
  const d = new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  return Math.max(1, Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / DAY_MS) + 1);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
// Linear-interpolated percentile over an already-sorted ascending array.
// p50 is the median; p90 is the number that actually drives complaints, which
// an average quietly hides.
function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

const mean = (nums) => (nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null);

function statsFor(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    avg: mean(sorted),
  };
}

// ── Order timing, from status history ────────────────────────────────────────
const historyTime = (order, status) => {
  const entry = order.orderStatusHistory.find((h) => h.status === status);
  return entry ? new Date(entry.updatedAt).getTime() : null;
};

// Minutes in PREPARING — the kitchen's own clock.
function prepMinutes(order) {
  const start = historyTime(order, 'PREPARING');
  const end = historyTime(order, 'READY');
  if (!start || !end || end < start) return null;
  return (end - start) / 60000;
}

// Minutes from placed to COMPLETED — the customer's actual wait.
function totalMinutes(order) {
  if (order.status !== 'COMPLETED') return null;
  const start = new Date(order.createdAt).getTime();
  const end = historyTime(order, 'COMPLETED');
  if (!start || !end || end < start) return null;
  return (end - start) / 60000;
}

const customerKey = (o) => o.userId ?? o.guestName ?? `order-${o.id}`;

// ── KPI block ─────────────────────────────────────────────────────────────────
// Rates stay unrounded so the client can compute deltas from real values and
// round only at display time.
function summarize(list) {
  const committed = list.filter((o) => REVENUE_STATES.includes(o.status));
  const revenue = committed.reduce((s, o) => s + o.totalAmount, 0);
  const cancelled = list.filter((o) => NON_SALE_STATES.includes(o.status)).length;
  const resolved = list.filter((o) => RESOLVED_STATES.includes(o.status)).length;

  const countByCustomer = {};
  list.forEach((o) => { const k = customerKey(o); countByCustomer[k] = (countByCustomer[k] || 0) + 1; });
  const distinct = Object.keys(countByCustomer).length;
  const repeat = Object.values(countByCustomer).filter((n) => n > 1).length;

  return {
    orders: list.length,
    revenue,
    aov: committed.length ? revenue / committed.length : 0,
    completionRate: resolved ? (committed.length / resolved) * 100 : null,
    cancellationRate: resolved ? (cancelled / resolved) * 100 : null,
    distinctCustomers: distinct,
    repeatCustomers: repeat,
    returningPct: distinct ? (repeat / distinct) * 100 : 0,
    ordersFromRepeat: list.filter((o) => countByCustomer[customerKey(o)] > 1).length,
  };
}

// Slicers, applied identically to both periods so a comparison is never drawn
// against a differently-filtered baseline. "Repeat" is judged within each
// window's own purchase history — filtering by another dimension shouldn't
// change who counts as a repeat customer, only which of their orders show up.
function applyFilters(list, { orderType, payment, status, waiterId, customerType }) {
  const countByCustomer = {};
  list.forEach((o) => { const k = customerKey(o); countByCustomer[k] = (countByCustomer[k] || 0) + 1; });

  return list.filter((o) => {
    if (orderType && orderType !== 'all') {
      const isPickup = !o.guestVehicle;
      if (orderType === 'pickup' && !isPickup) return false;
      if (orderType === 'delivery' && isPickup) return false;
    }
    if (payment && payment !== 'all' && o.paymentMethod !== payment) return false;
    if (status && status !== 'all' && o.status !== status) return false;
    if (waiterId && waiterId !== 'all' && String(o.waiterId) !== String(waiterId)) return false;
    if (customerType && customerType !== 'all') {
      const repeat = countByCustomer[customerKey(o)] > 1;
      if (customerType === 'repeat' && !repeat) return false;
      if (customerType === 'new' && repeat) return false;
    }
    return true;
  });
}

// ── GET /api/analytics/summary ────────────────────────────────────────────────
// Everything the Analytics page renders, already aggregated. The page used to
// pull every raw order in the range (with items, options and status history)
// and reduce it in the browser — which meant the payload, and the work, grew
// linearly with order volume and effectively capped how far back you could look.
//
// Note this aggregates in Node rather than in Postgres: the derived timings come
// from walking OrderStatusHistory per order, which is awkward to express as SQL
// and is the reason the raw rows are still read here. The win is the response
// size and the browser's workload, not database load.
analyticsRouter.get('/summary', restaurantAuth, async (req, res) => {
  try {
    const { from, to, orderType, payment, status, waiterId, customerType } = req.query;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      return res.status(400).json({ message: 'from and to are required as YYYY-MM-DD local dates' });
    }
    if (from > to) return res.status(400).json({ message: 'from must not be after to' });

    const offsetMin = Number.isFinite(Number(req.query.tzOffsetMinutes))
      ? Math.max(-840, Math.min(840, Number(req.query.tzOffsetMinutes)))
      : 0;

    const days = daysBetween(from, to);
    // The equal-length window immediately before the selection.
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));

    const filters = { orderType, payment, status, waiterId, customerType };

    // One read spanning both windows, then split locally — same trip, half the
    // round-trips of querying each period separately.
    const rows = await prisma.order.findMany({
      where: {
        restaurantId: req.restaurantId,
        status: { not: 'PENDING' },
        createdAt: { gte: startOfLocalDay(prevFrom, offsetMin), lte: endOfLocalDay(to, offsetMin) },
      },
      select: {
        id: true, userId: true, guestName: true, guestVehicle: true, waiterId: true,
        totalAmount: true, status: true, paymentMethod: true, createdAt: true,
        orderItems: {
          select: {
            menuItemId: true, name: true, quantity: true, unitPrice: true, finalPrice: true,
            options: { select: { name: true } },
          },
        },
        orderStatusHistory: { select: { status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } },
      },
    });

    const periodStart = startOfLocalDay(from, offsetMin).getTime();
    const current = rows.filter((o) => new Date(o.createdAt).getTime() >= periodStart);
    const previous = rows.filter((o) => new Date(o.createdAt).getTime() < periodStart);

    const filtered = applyFilters(current, filters);
    const prevFiltered = applyFilters(previous, filters);
    // What actually sold — cancelled/not-fulfilled orders don't belong in
    // item or category tallies.
    const sold = filtered.filter((o) => !NON_SALE_STATES.includes(o.status));

    // Menu is needed for category names, and for the dead-item list (which is
    // defined by ABSENCE from the order data, so it can't come from orders).
    const menu = await prisma.menuItem.findMany({
      where: { restaurantId: req.restaurantId, isActive: true },
      select: { id: true, name: true, price: true, available: true, category: { select: { name: true } } },
    });
    const catByItem = new Map(menu.map((m) => [m.id, m.category?.name || 'Uncategorized']));

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.restaurantId },
      select: { slaWarnMinutes: true, slaCritMinutes: true },
    });
    const slaWarn = restaurant?.slaWarnMinutes ?? 8;
    const slaCrit = restaurant?.slaCritMinutes ?? 15;

    // ── Daily series, zero-filled ───────────────────────────────────────────
    const byDay = new Map();
    filtered.forEach((o) => {
      const key = localDateStr(o.createdAt, offsetMin);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(o);
    });

    const daily = Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      const dayOrders = byDay.get(date) || [];
      const committed = dayOrders.filter((o) => REVENUE_STATES.includes(o.status));
      const prepDay = dayOrders.map(prepMinutes).filter((m) => m !== null).sort((a, b) => a - b);
      return {
        date,
        orders: dayOrders.length,
        committed: committed.length,
        revenue: committed.reduce((s, o) => s + o.totalAmount, 0),
        prepP50: percentile(prepDay, 50),
        prepP90: percentile(prepDay, 90),
        breached: prepDay.filter((m) => m >= slaCrit).length,
      };
    });

    // ── Categories and items ────────────────────────────────────────────────
    const catAgg = {};
    const itemAgg = {};
    sold.forEach((o) =>
      o.orderItems.forEach((it) => {
        const qty = it.quantity || 1;
        const rev = (it.finalPrice ?? it.unitPrice ?? 0) * qty;

        const cat = catByItem.get(it.menuItemId) || 'Uncategorized';
        if (!catAgg[cat]) catAgg[cat] = { name: cat, units: 0, revenue: 0 };
        catAgg[cat].units += qty;
        catAgg[cat].revenue += rev;

        // Keyed by menuItemId where available so a renamed item doesn't split
        // into two rows; falls back to the name for deleted menu items.
        const key = it.menuItemId ?? `name:${it.name}`;
        if (!itemAgg[key]) itemAgg[key] = { id: it.menuItemId ?? null, name: it.name || 'Item', category: cat, units: 0, revenue: 0, lineCount: 0, withOptions: 0 };
        itemAgg[key].units += qty;
        itemAgg[key].revenue += rev;
        itemAgg[key].lineCount += 1;
        if (it.options.length) itemAgg[key].withOptions += 1;
      })
    );

    const allItems = Object.values(itemAgg);
    const topCategories = Object.values(catAgg).sort((a, b) => b.revenue - a.revenue).slice(0, TOP_CATEGORIES);
    const topItems = [...allItems].sort((a, b) => b.units - a.units).slice(0, TOP_ITEMS)
      .map(({ name, units, revenue }) => ({ name, units, revenue }));

    // ── Orders by hour ──────────────────────────────────────────────────────
    const hourBuckets = Array.from({ length: 24 }, () => ({ orders: 0, prep: [] }));
    filtered.forEach((o) => {
      const h = localHour(o.createdAt, offsetMin);
      hourBuckets[h].orders += 1;
      const p = prepMinutes(o);
      if (p !== null) hourBuckets[h].prep.push(p);
    });
    const byHour = hourBuckets.map((b, hour) => {
      const sorted = b.prep.sort((a, c) => a - c);
      return { hour, orders: b.orders, prepP50: percentile(sorted, 50), samples: sorted.length };
    });

    // ── Fulfilment split ────────────────────────────────────────────────────
    const inCar = sold.filter((o) => o.guestVehicle).length;

    // ── Prep + total timings ────────────────────────────────────────────────
    const prepValues = filtered.map(prepMinutes).filter((m) => m !== null);
    const totalValues = filtered.map(totalMinutes).filter((m) => m !== null);
    const prepStats = statsFor(prepValues);
    const totalStats = statsFor(totalValues);
    const breached = prepValues.filter((m) => m >= slaCrit).length;

    // Grouped by category/item, ranked by p90 — the slow tail is what needs
    // fixing, and ranking by average would bury a station that is usually fine
    // but occasionally catastrophic.
    const groupTimings = (keyFor) => {
      const agg = {};
      filtered.forEach((o) => {
        const mins = prepMinutes(o);
        if (mins === null) return;
        // A Set so an order with three items from one category counts once.
        new Set(o.orderItems.map(keyFor)).forEach((k) => {
          if (!agg[k]) agg[k] = [];
          agg[k].push(mins);
        });
      });
      return Object.entries(agg).map(([name, values]) => {
        const s = statsFor(values);
        return { name, p50: s.p50, p90: s.p90, orders: s.count };
      }).sort((a, b) => b.p90 - a.p90);
    };

    const prepByCategory = groupTimings((it) => catByItem.get(it.menuItemId) || 'Uncategorized').slice(0, TOP_CATEGORIES);
    const slowestItems = groupTimings((it) => it.name || 'Item').slice(0, SLOWEST_ITEMS);

    // ── Menu engineering ────────────────────────────────────────────────────
    // Popularity (units sold) against revenue per unit. Revenue per unit stands
    // in for margin: MenuItem has no cost field, so true profitability isn't
    // computable — adding one would turn this axis into real margin without
    // changing the shape of the view.
    //
    // Thresholds follow the standard Kasavana-Smith rule rather than medians.
    // A median splits the menu in half by construction, so with tied unit
    // counts (common on a small menu) almost everything lands above the line —
    // it classed a ₹60 samosa alongside a ₹320 butter chicken as a Star.
    //   popularity: 70% of the mean units per item — an item only has to reach
    //               a fair share of the average to count as selling well
    //   value:      the WEIGHTED average revenue per unit across all sales,
    //               so the comparison is against what the menu actually earns
    //               per item sold, not an unweighted average of prices
    const withSales = allItems.filter((i) => i.units > 0);
    const totalUnits = withSales.reduce((s, i) => s + i.units, 0);
    const totalItemRevenue = withSales.reduce((s, i) => s + i.revenue, 0);

    const popularityThreshold = withSales.length ? 0.7 * (totalUnits / withSales.length) : 0;
    const valueThreshold = totalUnits ? totalItemRevenue / totalUnits : 0;

    const quadrantOf = (units, unitRevenue) => {
      const popular = units >= popularityThreshold;
      const rich = unitRevenue >= valueThreshold;
      if (popular && rich) return 'star';       // feature it, protect the quality
      if (popular && !rich) return 'plowhorse'; // sells well, earns little — reprice
      if (!popular && rich) return 'puzzle';    // earns well, nobody orders it — promote
      return 'dog';                             // neither — candidate for removal
    };

    const matrix = withSales
      .map((i) => {
        const unitRevenue = i.revenue / i.units;
        return {
          id: i.id, name: i.name, category: i.category,
          units: i.units, revenue: i.revenue, unitRevenue,
          quadrant: quadrantOf(i.units, unitRevenue),
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, MATRIX_ITEMS);

    // On the menu and orderable, but sold nothing in this range — the list
    // orders can't produce, since it's defined by their absence.
    const soldItemIds = new Set(allItems.map((i) => i.id).filter(Boolean));
    const dead = menu
      .filter((m) => m.available && !soldItemIds.has(m.id))
      .map((m) => ({ id: m.id, name: m.name, category: m.category?.name || 'Uncategorized', price: m.price }))
      .sort((a, b) => b.price - a.price)
      .slice(0, DEAD_ITEMS);

    // Option attach rate — how often an add-on rides along with its item.
    // OrderItemOption is data nothing has surfaced until now.
    const optionAgg = {};
    sold.forEach((o) =>
      o.orderItems.forEach((it) => {
        const itemName = it.name || 'Item';
        it.options.forEach((opt) => {
          const key = `${itemName} ${opt.name}`;
          if (!optionAgg[key]) optionAgg[key] = { item: itemName, option: opt.name, chosen: 0 };
          optionAgg[key].chosen += 1;
        });
      })
    );
    const lineCountByName = {};
    allItems.forEach((i) => { lineCountByName[i.name] = (lineCountByName[i.name] || 0) + i.lineCount; });

    const optionAttach = Object.values(optionAgg)
      .map((o) => ({ ...o, itemOrders: lineCountByName[o.item] || 0 }))
      .filter((o) => o.itemOrders >= MIN_OPTION_SAMPLE)
      .map((o) => ({ ...o, attachPct: (o.chosen / o.itemOrders) * 100 }))
      .sort((a, b) => b.attachPct - a.attachPct)
      .slice(0, TOP_OPTIONS);

    res.json({
      range: { from, to, days },
      previous: { from: prevFrom, to: prevTo, days },
      sla: { warnMinutes: slaWarn, critMinutes: slaCrit },
      kpis: {
        current: summarize(filtered),
        previous: summarize(prevFiltered),
        hasBaseline: prevFiltered.length > 0,
      },
      daily,
      byHour,
      topCategories,
      topItems,
      fulfilment: { inCar, pickup: sold.length - inCar },
      prep: {
        sampleCount: prepStats.count,
        p50: prepStats.p50, p90: prepStats.p90, avg: prepStats.avg,
        compliancePct: prepStats.count ? ((prepStats.count - breached) / prepStats.count) * 100 : null,
        breached,
        total: { sampleCount: totalStats.count, p50: totalStats.p50, p90: totalStats.p90, avg: totalStats.avg },
        byCategory: prepByCategory,
        slowestItems,
      },
      menu: {
        matrix,
        thresholds: { units: popularityThreshold, unitRevenue: valueThreshold },
        dead,
        deadTotal: menu.filter((m) => m.available && !soldItemIds.has(m.id)).length,
        optionAttach,
      },
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ message: 'Failed to build analytics summary', error: err.message });
  }
});

export default analyticsRouter;
