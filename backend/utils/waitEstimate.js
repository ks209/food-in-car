import prisma from '../config/prisma.js';

// Waiting-time estimates shown to customers: "~15 min wait" on the menu and a
// live ETA on the order status page.
//
// Built from recent history rather than a single average:
//  - only real customer orders (POS counter bills are created already
//    COMPLETED, so they'd count as 0-minute orders and drag the number down;
//    they're the only orders with an idempotencyKey)
//  - timings come from the status history — payment confirmed (PAID) → READY
//    for the kitchen, READY → COMPLETED for the handover — not updatedAt, which
//    also moves when an order is completed hours later (e.g. "Complete all")
//  - medians over the last LOOKBACK_DAYS, with obvious outliers dropped, so one
//    forgotten order can't skew the result
//  - plus the current queue: orders already waiting push a new one back

const LOOKBACK_DAYS = 7;
const MAX_SAMPLES = 200;
const MIN_SAMPLES = 3;          // fewer than this → no estimate ("—")
const MAX_STAGE_MINUTES = 120;  // longer than this is a forgotten order, not a real timing
// Kitchens cook several orders in parallel, so each order already waiting adds
// only a fraction of a typical prep time. Tunable guess, not measured.
const QUEUE_WEIGHT = 0.3;
const MAX_QUEUE_COUNTED = 15;
const CACHE_MS = 60 * 1000;     // the status page polls every 2s — don't recompute history each time

const cache = new Map(); // restaurantId -> { at, stats }

function historyTime(history, status) {
  // Earliest entry for that status — the moment the order first reached it.
  let t = null;
  for (const h of history) {
    if (h.status === status) {
      const ms = new Date(h.updatedAt).getTime();
      if (t === null || ms < t) t = ms;
    }
  }
  return t;
}

function median(values) {
  if (values.length < MIN_SAMPLES) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const minutesBetween = (from, to) => (from != null && to != null ? (to - from) / 60000 : null);
const usable = (m) => m != null && m >= 0 && m <= MAX_STAGE_MINUTES;

// Typical kitchen time and handover time (split pickup vs in-car) from recent
// completed customer orders.
export async function waitStats(restaurantId) {
  const hit = cache.get(restaurantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.stats;

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: 'COMPLETED',
      idempotencyKey: null, // excludes POS counter bills
      createdAt: { gte: new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60000) },
    },
    select: { createdAt: true, guestVehicle: true, orderStatusHistory: { select: { status: true, updatedAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: MAX_SAMPLES,
  });

  const prep = [], cook = [], handoverCar = [], handoverPickup = [];
  for (const o of orders) {
    const paid = historyTime(o.orderStatusHistory, 'PAID') ?? new Date(o.createdAt).getTime();
    const cooking = historyTime(o.orderStatusHistory, 'PREPARING');
    const ready = historyTime(o.orderStatusHistory, 'READY');
    const done = historyTime(o.orderStatusHistory, 'COMPLETED');
    const p = minutesBetween(paid, ready);
    const c = minutesBetween(cooking, ready);
    const h = minutesBetween(ready, done);
    if (usable(p)) prep.push(p);
    if (usable(c)) cook.push(c);
    if (usable(h)) (o.guestVehicle ? handoverCar : handoverPickup).push(h);
  }

  const stats = {
    // paid → ready: queue wait + cooking, as customers experience it
    prepMinutes: median(prep),
    // preparing → ready: cooking alone (null if the kitchen skips "Preparing")
    cookMinutes: median(cook),
    handoverCarMinutes: median(handoverCar),
    handoverPickupMinutes: median(handoverPickup),
    samples: prep.length,
  };
  cache.set(restaurantId, { at: Date.now(), stats });
  return stats;
}

// Minutes of delay caused by orders ahead in the kitchen: not-started orders
// count fully, ones already cooking count half.
function queueDelayMinutes(stats, queuedAhead, cookingAhead) {
  const ahead = Math.min(MAX_QUEUE_COUNTED, queuedAhead + cookingAhead * 0.5);
  return ahead * (stats.cookMinutes ?? stats.prepMinutes) * QUEUE_WEIGHT;
}

function handoverFor(stats, isCar) {
  // Fall back to the other fulfilment type's timing when one has too few samples.
  return (isCar ? stats.handoverCarMinutes ?? stats.handoverPickupMinutes : stats.handoverPickupMinutes ?? stats.handoverCarMinutes) ?? 0;
}

// "~N min" for someone about to order (menu page). In-car delivery is assumed
// when the restaurant offers it, since it's the slower of the two.
export async function menuWaitEstimate(restaurant) {
  const stats = await waitStats(restaurant.id);
  if (stats.prepMinutes == null) return null;
  const [queued, cooking] = await Promise.all([
    prisma.order.count({ where: { restaurantId: restaurant.id, status: 'PAID' } }),
    prisma.order.count({ where: { restaurantId: restaurant.id, status: 'PREPARING' } }),
  ]);
  const minutes = queueDelayMinutes(stats, queued, cooking) + stats.prepMinutes + handoverFor(stats, restaurant.deliveryEnabled !== false);
  return { minutes: Math.max(1, Math.round(minutes)), samples: stats.samples, busy: queued + cooking };
}

// Live ETA for one order (order status page). Returns null when there's nothing
// meaningful to promise: not paid yet, finished, or too little history.
export async function orderEta(order) {
  if (!['PAID', 'PREPARING', 'READY'].includes(order.status)) return null;
  const stats = await waitStats(order.restaurantId);
  if (stats.prepMinutes == null) return null;

  const now = Date.now();
  const isCar = !!order.guestVehicle;
  const handover = handoverFor(stats, isCar);
  const history = order.orderStatusHistory || [];
  let readyAt;

  if (order.status === 'PAID') {
    const [queuedAhead, cooking] = await Promise.all([
      prisma.order.count({ where: { restaurantId: order.restaurantId, status: 'PAID', createdAt: { lt: order.createdAt } } }),
      prisma.order.count({ where: { restaurantId: order.restaurantId, status: 'PREPARING' } }),
    ]);
    readyAt = now + (queueDelayMinutes(stats, queuedAhead, cooking) + stats.prepMinutes) * 60000;
  } else if (order.status === 'PREPARING') {
    const started = historyTime(history, 'PREPARING') ?? new Date(order.updatedAt).getTime();
    readyAt = started + (stats.cookMinutes ?? stats.prepMinutes) * 60000;
  } else {
    readyAt = historyTime(history, 'READY') ?? new Date(order.updatedAt).getTime();
  }

  // Past the promised moment = running late; the countdown then holds at 0
  // ("any minute now") instead of going negative.
  const expectedArrival = readyAt + handover * 60000;
  const overdue = order.status !== 'PAID' && now > expectedArrival;
  const arriveAt = Math.max(now, expectedArrival);

  return {
    stage: order.status,
    readyAt: new Date(readyAt).toISOString(),
    arriveAt: new Date(arriveAt).toISOString(),
    minutesLeft: Math.max(0, Math.round((arriveAt - now) / 60000)),
    overdue,
    fulfilment: isCar ? 'car' : 'pickup',
    samples: stats.samples,
  };
}
