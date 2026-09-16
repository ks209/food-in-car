// Cross-restaurant rollups for a venue, for the SaaS admin panel.
//
// Deliberately NOT built on routes/analytics/analytics.js: that one is
// restaurant-scoped (restaurantAuth) and answers a kitchen's questions — prep
// percentiles, price-change comparisons, dead items. This answers a different
// one: which outlet is carrying this campus, and is the place growing. What the
// two DO share lives in utils/analyticsTime.js, so the same order can never
// land on different calendar days in the two reports.

import prisma from '../../config/prisma.js';
import {
    REVENUE_STATES, NON_SALE_STATES, RESOLVED_STATES,
    DAYPARTS, daypartFor,
    localDateStr, localHour, startOfLocalDay, endOfLocalDay, addDays, daysBetween,
} from '../../utils/analyticsTime.js';

// Longest range the admin can ask for in one call. Orders are loaded into
// memory to be bucketed, so this is the ceiling on that.
const MAX_RANGE_DAYS = 400;
const DEFAULT_RANGE_DAYS = 30;

const customerKey = (o) => o.userId ?? o.guestName ?? `order-${o.id}`;

// Validates ?from=&to=&tzOffset= and fills in a sensible default range.
// Returns { ok: true, range } or { ok: false, message }.
export function parseRange(query) {
    const tzRaw = query.tzOffset;
    // Minutes east of UTC, as the browser computes it (-getTimezoneOffset()).
    // Defaults to IST rather than the server's zone: this is an India-only
    // product, and a UTC server would otherwise split an evening service.
    const tzOffset = tzRaw === undefined || tzRaw === '' ? 330 : parseInt(tzRaw, 10);
    if (!Number.isInteger(tzOffset) || tzOffset < -720 || tzOffset > 840) {
        return { ok: false, message: 'Invalid timezone offset' };
    }

    const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

    let { from, to } = query;
    if (!to) to = localDateStr(new Date(), tzOffset);
    if (!from) from = addDays(to, -(DEFAULT_RANGE_DAYS - 1));

    if (!isDate(from) || !isDate(to)) return { ok: false, message: 'Dates must be YYYY-MM-DD' };
    if (Date.parse(`${from}T00:00:00Z`) > Date.parse(`${to}T00:00:00Z`)) {
        return { ok: false, message: 'The start date must be on or before the end date' };
    }

    const days = daysBetween(from, to);
    if (days > MAX_RANGE_DAYS) return { ok: false, message: `Pick a range of ${MAX_RANGE_DAYS} days or fewer` };

    // Immediately-preceding window of the same length, so a comparison is never
    // drawn against a differently-sized baseline.
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));

    return { ok: true, range: { from, to, days, prevFrom, prevTo, tzOffset } };
}

// The restaurants a venue's numbers are computed over: its MAPPED members only,
// in both membership modes.
//
// An INCLUSIVE venue shows extra nearby restaurants to customers, but counting
// their revenue as the mall's would be wrong — they are not part of it, they are
// merely near it. So the customer-facing list and the analytics population are
// deliberately different sets. Do not "fix" this to match.
async function mappedMembers(venueId) {
    const rows = await prisma.venueRestaurant.findMany({
        where: { venueId, restaurant: { isActive: true } },
        select: { restaurant: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => r.restaurant);
}

function summarize(list) {
    const committed = list.filter((o) => REVENUE_STATES.includes(o.status));
    const revenue = committed.reduce((s, o) => s + o.totalAmount, 0);
    const cancelled = list.filter((o) => NON_SALE_STATES.includes(o.status)).length;
    const resolved = list.filter((o) => RESOLVED_STATES.includes(o.status)).length;
    const customers = new Set(list.map(customerKey));

    return {
        orders: list.length,
        completedOrders: committed.length,
        revenue,
        aov: committed.length ? revenue / committed.length : 0,
        cancellationRate: resolved ? (cancelled / resolved) * 100 : null,
        distinctCustomers: customers.size,
        // Outlets that actually sold something — a venue with 14 mapped outlets
        // but 3 trading is the number worth seeing.
        activeOutlets: new Set(committed.map((o) => o.restaurantId)).size,
    };
}

// Fetches both the requested window and its baseline in ONE query, then splits
// them — two round trips for the same table would be wasteful and could
// straddle a write.
async function loadOrders(restaurantIds, range) {
    if (!restaurantIds.length) return { current: [], previous: [] };
    const { from, to, prevFrom, tzOffset } = range;
    const windowStart = startOfLocalDay(prevFrom, tzOffset);
    const windowEnd = endOfLocalDay(to, tzOffset);
    const currentStart = startOfLocalDay(from, tzOffset);

    const orders = await prisma.order.findMany({
        where: {
            restaurantId: { in: restaurantIds },
            createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
            id: true, restaurantId: true, userId: true, guestName: true,
            status: true, totalAmount: true, createdAt: true,
        },
    });

    const current = [], previous = [];
    for (const o of orders) {
        (o.createdAt >= currentStart ? current : previous).push(o);
    }
    return { current, previous };
}

export async function venueAnalytics(venueId, range) {
    const members = await mappedMembers(venueId);
    const ids = members.map((m) => m.id);
    const { current, previous } = await loadOrders(ids, range);
    const { from, to, days, prevFrom, prevTo, tzOffset } = range;

    const committed = current.filter((o) => REVENUE_STATES.includes(o.status));

    // ── Daily trend ──────────────────────────────────────────────────────────
    // Pre-seeded with every date in the range so the chart has no gaps on days
    // nothing was sold — a missing point and a zero read very differently.
    const daily = [];
    const dayIndex = new Map();
    for (let i = 0; i < days; i++) {
        const date = addDays(from, i);
        dayIndex.set(date, daily.length);
        daily.push({ date, orders: 0, revenue: 0 });
    }
    for (const o of committed) {
        const bucket = daily[dayIndex.get(localDateStr(o.createdAt, tzOffset))];
        if (bucket) { bucket.orders += 1; bucket.revenue += o.totalAmount; }
    }

    // ── Outlet leaderboard ───────────────────────────────────────────────────
    // Every mapped outlet appears, including ones that sold nothing — "which of
    // my outlets is dead" is exactly the question this view exists to answer.
    const byOutlet = new Map(members.map((m) => [m.id, {
        id: m.id, name: m.name, slug: m.slug, orders: 0, revenue: 0,
    }]));
    for (const o of committed) {
        const row = byOutlet.get(o.restaurantId);
        if (row) { row.orders += 1; row.revenue += o.totalAmount; }
    }
    const totalRevenue = committed.reduce((s, o) => s + o.totalAmount, 0);
    const outlets = [...byOutlet.values()]
        .map((r) => ({
            ...r,
            aov: r.orders ? r.revenue / r.orders : 0,
            sharePct: totalRevenue ? (r.revenue / totalRevenue) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders || a.name.localeCompare(b.name));

    // ── Daypart split ────────────────────────────────────────────────────────
    // A campus peaks at lunch, a mall at dinner — the shape is the point.
    const daypartTotals = Object.fromEntries(DAYPARTS.map((d) => [d.key, { orders: 0, revenue: 0 }]));
    for (const o of committed) {
        const part = daypartFor(localHour(o.createdAt, tzOffset));
        if (part) {
            daypartTotals[part.key].orders += 1;
            daypartTotals[part.key].revenue += o.totalAmount;
        }
    }
    const dayparts = DAYPARTS.map((d) => ({ key: d.key, label: d.label, ...daypartTotals[d.key] }));

    return {
        range: { from, to, days, tzOffset },
        previous: { from: prevFrom, to: prevTo, days },
        kpis: {
            current: summarize(current),
            previous: summarize(previous),
            // Lets the client show "no baseline" instead of a misleading +100%.
            hasBaseline: previous.length > 0,
        },
        mappedOutlets: members.length,
        daily,
        outlets,
        dayparts,
    };
}

// One row per venue for the admin's comparison table. Same population rule and
// same date handling as the per-venue view, so the numbers reconcile.
export async function venuesOverview(range) {
    const venues = await prisma.venue.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true, type: true, membershipMode: true },
        orderBy: { name: 'asc' },
    });
    if (!venues.length) return { range, venues: [] };

    const memberships = await prisma.venueRestaurant.findMany({
        where: { venueId: { in: venues.map((v) => v.id) }, restaurant: { isActive: true } },
        select: { venueId: true, restaurantId: true },
    });

    const idsByVenue = new Map(venues.map((v) => [v.id, []]));
    for (const m of memberships) idsByVenue.get(m.venueId)?.push(m.restaurantId);

    // One query covering every venue's outlets, then split per venue in memory —
    // N queries for N venues would be the obvious N+1 here.
    const allIds = [...new Set(memberships.map((m) => m.restaurantId))];
    const { current, previous } = await loadOrders(allIds, range);

    const currentByRestaurant = new Map();
    for (const o of current) {
        if (!currentByRestaurant.has(o.restaurantId)) currentByRestaurant.set(o.restaurantId, []);
        currentByRestaurant.get(o.restaurantId).push(o);
    }
    const previousByRestaurant = new Map();
    for (const o of previous) {
        if (!previousByRestaurant.has(o.restaurantId)) previousByRestaurant.set(o.restaurantId, []);
        previousByRestaurant.get(o.restaurantId).push(o);
    }

    const { from, days, tzOffset } = range;

    const rows = venues.map((v) => {
        const ids = idsByVenue.get(v.id) || [];
        const cur = ids.flatMap((id) => currentByRestaurant.get(id) || []);
        const prev = ids.flatMap((id) => previousByRestaurant.get(id) || []);
        const stats = summarize(cur);

        // Daily revenue for a sparkline, zero-filled like `daily` above.
        const spark = Array.from({ length: days }, () => 0);
        for (const o of cur.filter((x) => REVENUE_STATES.includes(x.status))) {
            const i = daysBetween(from, localDateStr(o.createdAt, tzOffset)) - 1;
            if (i >= 0 && i < spark.length) spark[i] += o.totalAmount;
        }

        return {
            ...v,
            mappedOutlets: ids.length,
            ...stats,
            previousRevenue: summarize(prev).revenue,
            hasBaseline: prev.length > 0,
            spark,
        };
    });

    rows.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
    return { range: { from, to: range.to, days, tzOffset }, venues: rows };
}
