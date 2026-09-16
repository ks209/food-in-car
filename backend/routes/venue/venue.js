import express from 'express';
import cookieParser from 'cookie-parser';
import prisma from '../../config/prisma.js';
import supportAuth from '../../middlewares/support.auth.js';
import {
    slugify, validateSlug, uniqueSlug, isSlugTaken, resolveVenueId, venueUrlFor,
    VENUE_RESERVED_SLUGS,
} from '../../utils/slug.js';
import { customerOpenState } from '../../utils/businessHours.js';
import { haversineKm, validCoords } from '../../utils/geo.js';
import { parseRange, venueAnalytics, venuesOverview } from './venueAnalytics.js';

const venueRouter = express.Router();
venueRouter.use(cookieParser());

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';

const VENUE_TYPES = [
    'UNIVERSITY', 'MALL', 'TECH_PARK', 'OFFICE_PARK',
    'HOSPITAL', 'AIRPORT', 'STADIUM', 'RESIDENTIAL', 'OTHER',
];
const MEMBERSHIP_MODES = ['STRICT', 'INCLUSIVE'];

// Sanity bounds on the two radii. The lower bound stops a typo (50 meaning
// kilometres but entered as metres) producing a venue nobody can ever be
// detected inside; the upper stops one swallowing a whole city.
const MIN_RADIUS_M = 25;
const MAX_DETECT_RADIUS_M = 20000;
const MAX_INCLUDE_RADIUS_M = 50000;

// How many venues the customer-facing search returns. Deliberately small — the
// venue group sits ABOVE restaurant results in the shared search bar, so a long
// list would push the restaurants off screen.
const SEARCH_LIMIT = 8;

// The card fields the ordering app needs, matching restaurant.js /nearby's
// projection so the mobile RestCard renders a venue's outlets and a nearby
// result with the same component.
const CARD_SELECT = {
    id: true, name: true, slug: true, logoUrl: true, coverUrl: true,
    cuisines: true, rating: true, ratingCount: true,
    isOpen: true, openingTime: true, closingTime: true, address: true,
    latitude: true, longitude: true,
};

// What a venue looks like to a customer.
const PUBLIC_VENUE_SELECT = {
    id: true, name: true, slug: true, type: true, description: true,
    logoUrl: true, coverUrl: true, address: true,
    latitude: true, longitude: true, detectRadiusM: true,
    membershipMode: true, includeRadiusM: true, cityId: true,
};

// ── Membership ────────────────────────────────────────────────────────────────

// The restaurants that make up a venue, as ids in "venue order": admin-mapped
// ones first (in the order the admin arranged them), then — for an INCLUSIVE
// venue only — anything else inside includeRadiusM of the venue centre, nearest
// first.
//
// A STRICT venue never consults the radius at all. That is the whole point of
// the mode: a university must not list the dhaba 400 m outside its gate just
// because the geometry says it is close.
async function venueMemberIds(venue) {
    const mapped = await prisma.venueRestaurant.findMany({
        where: { venueId: venue.id, restaurant: { isActive: true } },
        select: { restaurantId: true },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    const ids = mapped.map((m) => m.restaurantId);

    if (venue.membershipMode !== 'INCLUSIVE' || !venue.includeRadiusM) return ids;

    // Radius measured from the VENUE centre, not from the customer — "which
    // restaurants belong to this mall" is a fixed property of the place, and
    // must not change depending on which corner of the car park someone is
    // standing in. Same Haversine shape as restaurant.js /nearby, in metres.
    const inRadius = await prisma.$queryRawUnsafe(
        `
        SELECT id FROM (
          SELECT id,
            (6371000 * acos(LEAST(1, GREATEST(-1,
              cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
              + sin(radians($1)) * sin(radians(latitude))
            )))) AS "distanceM"
          FROM "Restaurant"
          WHERE "isActive" = true AND latitude IS NOT NULL AND longitude IS NOT NULL
        ) r
        WHERE "distanceM" <= $3
        ORDER BY "distanceM" ASC
        `,
        venue.latitude, venue.longitude, venue.includeRadiusM
    );

    const seen = new Set(ids);
    for (const row of inRadius) {
        if (!seen.has(row.id)) { seen.add(row.id); ids.push(row.id); }
    }
    return ids;
}

// Full restaurant cards for a venue, optionally filtered by a search term and
// sorted by the customer's distance when their position is known.
//
// The sort and the page slice happen in JS rather than SQL because the row set
// is one venue's outlets — a few dozen at the very most, even for a large
// campus. Doing it here keeps "venue order" (an array position, not a column)
// expressible without an array_position() join.
async function venueRestaurantCards(venue, { lat, lng, search = '' } = {}) {
    const ids = await venueMemberIds(venue);
    if (!ids.length) return [];

    const term = search.trim();
    const rows = await prisma.restaurant.findMany({
        where: {
            id: { in: ids },
            isActive: true,
            ...(term
                ? {
                    OR: [
                        { name: { contains: term, mode: 'insensitive' } },
                        { cuisines: { contains: term, mode: 'insensitive' } },
                    ],
                }
                : {}),
        },
        select: CARD_SELECT,
    });

    const rank = new Map(ids.map((id, i) => [id, i]));
    const hasCustomerPos = validCoords(lat, lng);

    return rows
        .map(({ latitude, longitude, ...r }) => ({
            ...r,
            // Distance shown on the card is always FROM THE CUSTOMER, even
            // though membership was decided from the venue centre.
            distance: hasCustomerPos ? haversineKm(lat, lng, latitude, longitude) : null,
            ...customerOpenState(r),
        }))
        .sort((a, b) => {
            if (hasCustomerPos) {
                // Outlets with no coordinates sort last rather than first.
                if (a.distance == null && b.distance == null) return rank.get(a.id) - rank.get(b.id);
                if (a.distance == null) return 1;
                if (b.distance == null) return -1;
                if (a.distance !== b.distance) return a.distance - b.distance;
            }
            return rank.get(a.id) - rank.get(b.id);
        });
}

// ── Validation ────────────────────────────────────────────────────────────────

function parseIntInRange(value, { min, max }) {
    const n = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    return n;
}

// Returns { ok: true, data } or { ok: false, message }. Shared by create and
// update; `partial` lets update leave any field alone.
function parseVenueBody(body, { partial = false } = {}) {
    const data = {};
    const {
        name, type, description, logoUrl, coverUrl, address,
        latitude, longitude, detectRadiusM, membershipMode, includeRadiusM, cityId,
    } = body;

    if (name !== undefined) {
        if (!String(name).trim()) return { ok: false, message: 'Name is required' };
        data.name = String(name).trim();
    } else if (!partial) {
        return { ok: false, message: 'Name is required' };
    }

    if (type !== undefined) {
        if (!VENUE_TYPES.includes(type)) return { ok: false, message: 'Invalid place type' };
        data.type = type;
    }

    for (const [key, value] of Object.entries({ description, logoUrl, coverUrl, address })) {
        if (value !== undefined) data[key] = String(value).trim() || null;
    }

    // Coordinates are mandatory on a venue (unlike a restaurant's, which are
    // nullable) — without them it can never auto-detect anyone.
    const hasLat = latitude !== undefined, hasLng = longitude !== undefined;
    if (hasLat || hasLng || !partial) {
        const lat = Number(latitude), lng = Number(longitude);
        if (!validCoords(lat, lng)) {
            return { ok: false, message: 'A valid latitude and longitude are required' };
        }
        data.latitude = lat;
        data.longitude = lng;
    }

    if (detectRadiusM !== undefined || !partial) {
        const r = parseIntInRange(detectRadiusM ?? 500, { min: MIN_RADIUS_M, max: MAX_DETECT_RADIUS_M });
        if (r === null) {
            return { ok: false, message: `Detection radius must be between ${MIN_RADIUS_M} and ${MAX_DETECT_RADIUS_M} metres` };
        }
        data.detectRadiusM = r;
    }

    if (membershipMode !== undefined) {
        if (!MEMBERSHIP_MODES.includes(membershipMode)) return { ok: false, message: 'Invalid membership mode' };
        data.membershipMode = membershipMode;
    }

    // includeRadiusM only means anything in INCLUSIVE mode. On STRICT it is
    // cleared rather than kept, so a venue switched to STRICT can never quietly
    // resume pulling in neighbours if someone switches it back later without
    // rechecking the number.
    const effectiveMode = data.membershipMode ?? (partial ? undefined : 'STRICT');
    if (effectiveMode === 'INCLUSIVE') {
        const r = parseIntInRange(includeRadiusM, { min: MIN_RADIUS_M, max: MAX_INCLUDE_RADIUS_M });
        if (r === null) {
            return { ok: false, message: `An inclusive place needs a radius between ${MIN_RADIUS_M} and ${MAX_INCLUDE_RADIUS_M} metres` };
        }
        data.includeRadiusM = r;
    } else if (effectiveMode === 'STRICT') {
        data.includeRadiusM = null;
    }

    if (cityId !== undefined) {
        if (cityId === '' || cityId === null) {
            data.cityId = null;
        } else {
            const id = parseInt(cityId, 10);
            if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid city' };
            data.cityId = id;
        }
    }

    return { ok: true, data };
}

// ── Admin: listing ────────────────────────────────────────────────────────────
// Declared before /:idOrSlug — Express matches in order, and 'all' is in
// VENUE_RESERVED_SLUGS so no venue can ever shadow it.

venueRouter.get('/all', supportAuth, async (req, res) => {
    try {
        const venues = await prisma.venue.findMany({
            select: {
                ...PUBLIC_VENUE_SELECT,
                isActive: true,
                createdAt: true,
                city: { select: { id: true, name: true } },
                restaurants: {
                    select: {
                        position: true,
                        restaurant: { select: { id: true, name: true, slug: true, isActive: true } },
                    },
                    orderBy: [{ position: 'asc' }, { id: 'asc' }],
                },
            },
            orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
        });

        // mappedCount is the admin's own number — what they ticked — and stays
        // independent of whatever the radius is currently pulling in.
        res.json(venues.map((v) => ({
            ...v,
            venueUrl: venueUrlFor(v, FRONTEND_URL),
            mappedCount: v.restaurants.filter((m) => m.restaurant.isActive).length,
        })));
    } catch (err) {
        res.status(500).json({ message: 'Error fetching places', error: err.message });
    }
});

// ── Public: auto-detect ───────────────────────────────────────────────────────

// The single venue a customer at (lat, lng) is inside, or null. Called by the
// ordering app's home page the moment a position is available.
//
// Overlap rule: when a customer stands inside more than one venue — a food court
// inside a campus — the SMALLEST detection radius wins. That makes the most
// specific place win without needing a parent/child hierarchy on the model.
// Distance breaks exact ties.
//
// This runs a full scan of active venues on every geolocation grant. That is
// deliberate: there are tens of venues, not millions, and a bounding-box
// prefilter or PostGIS would be complexity with nothing to show for it. Revisit
// only if the venue count reaches the thousands.
venueRouter.get('/detect', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!validCoords(lat, lng)) return res.json({ venue: null });

    try {
        const rows = await prisma.$queryRawUnsafe(
            `
            SELECT * FROM (
              SELECT id, name, slug, type, description, "logoUrl", "coverUrl", address,
                latitude, longitude, "detectRadiusM", "membershipMode", "includeRadiusM",
                (6371000 * acos(LEAST(1, GREATEST(-1,
                  cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
                  + sin(radians($1)) * sin(radians(latitude))
                )))) AS "distanceM"
              FROM "Venue"
              WHERE "isActive" = true
            ) v
            WHERE "distanceM" <= "detectRadiusM"
            ORDER BY "detectRadiusM" ASC, "distanceM" ASC
            LIMIT 1
            `,
            lat, lng
        );

        const venue = rows[0];
        if (!venue) return res.json({ venue: null });

        const outletCount = (await venueMemberIds(venue)).length;
        res.json({ venue: { ...venue, outletCount } });
    } catch (err) {
        res.status(500).json({ message: 'Error detecting place', error: err.message });
    }
});

// ── Public: search ────────────────────────────────────────────────────────────

// Venues matching a search term, for the ordering app's shared search bar.
// Returns [] for an empty term — the home page lists venues only when the
// customer is standing in one, never as a browsable directory.
venueRouter.get('/', async (req, res) => {
    const search = (req.query.search || '').trim();
    if (!search) return res.json({ venues: [] });

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasCoords = validCoords(lat, lng);

    try {
        const venues = await prisma.venue.findMany({
            where: {
                isActive: true,
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { address: { contains: search, mode: 'insensitive' } },
                ],
            },
            select: PUBLIC_VENUE_SELECT,
            orderBy: { name: 'asc' },
            take: SEARCH_LIMIT,
        });

        // One membership resolution per venue. N+1 in principle, but N is capped
        // at SEARCH_LIMIT and a STRICT venue costs exactly one indexed query.
        const withCounts = await Promise.all(venues.map(async (v) => ({
            ...v,
            outletCount: (await venueMemberIds(v)).length,
            distance: hasCoords ? haversineKm(lat, lng, v.latitude, v.longitude) : null,
        })));

        // Closest first when we know where the customer is; a venue is a place,
        // so proximity ranks better than alphabetical once it is available.
        if (hasCoords) withCounts.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

        res.json({ venues: withCounts });
    } catch (err) {
        res.status(500).json({ message: 'Error searching places', error: err.message });
    }
});

// ── Admin: create / update / membership ───────────────────────────────────────

venueRouter.post('/create', supportAuth, async (req, res) => {
    const parsed = parseVenueBody(req.body);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    try {
        // A slug the admin typed is reported back as taken; one we derive
        // ourselves from the name gets a numeric suffix. Same split as
        // restaurant create.
        let slug;
        if (req.body.slug) {
            const checked = validateSlug(req.body.slug, VENUE_RESERVED_SLUGS);
            if (!checked.ok) return res.status(400).json({ message: checked.message });
            if (!checked.slug) return res.status(400).json({ message: 'A web address is required' });
            if (await isSlugTaken(checked.slug, null, prisma.venue)) {
                return res.status(409).json({ message: 'That web address is already taken' });
            }
            slug = checked.slug;
        } else {
            const base = slugify(parsed.data.name);
            if (!base) return res.status(400).json({ message: 'Could not build a web address from that name — set one manually' });
            slug = await uniqueSlug(base, null, prisma.venue);
        }

        const venue = await prisma.venue.create({
            data: { ...parsed.data, slug, isActive: true },
            select: { ...PUBLIC_VENUE_SELECT, isActive: true },
        });
        res.status(201).json({ ...venue, venueUrl: venueUrlFor(venue, FRONTEND_URL) });
    } catch (err) {
        res.status(500).json({ message: 'Error creating place', error: err.message });
    }
});

venueRouter.put('/update/:id', supportAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid place' });

    try {
        const existing = await prisma.venue.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ message: 'Place not found' });

        // Merge the stored mode in before validating, so sending only
        // includeRadiusM on an already-INCLUSIVE venue doesn't read as "no mode,
        // default STRICT" and silently null the radius out.
        const parsed = parseVenueBody(
            { membershipMode: existing.membershipMode, ...req.body },
            { partial: true }
        );
        if (!parsed.ok) return res.status(400).json({ message: parsed.message });

        const data = { ...parsed.data };
        if (req.body.slug !== undefined) {
            const checked = validateSlug(req.body.slug, VENUE_RESERVED_SLUGS);
            if (!checked.ok) return res.status(400).json({ message: checked.message });
            if (!checked.slug) return res.status(400).json({ message: 'A web address is required' });
            if (await isSlugTaken(checked.slug, id, prisma.venue)) {
                return res.status(409).json({ message: 'That web address is already taken' });
            }
            data.slug = checked.slug;
        }

        const venue = await prisma.venue.update({
            where: { id },
            data,
            select: { ...PUBLIC_VENUE_SELECT, isActive: true },
        });
        res.json({ ...venue, venueUrl: venueUrlFor(venue, FRONTEND_URL) });
    } catch (err) {
        res.status(500).json({ message: 'Error updating place', error: err.message });
    }
});

// Soft delete, mirroring restaurant delete — the venue stops being detected and
// its /at/ page 404s, but membership rows and any history survive a mistake.
venueRouter.delete('/delete/:id', supportAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid place' });
    try {
        await prisma.venue.update({ where: { id }, data: { isActive: false } });
        res.json({ message: 'Place deactivated' });
    } catch (err) {
        res.status(500).json({ message: 'Error deactivating place', error: err.message });
    }
});

venueRouter.put('/activate/:id', supportAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid place' });
    try {
        await prisma.venue.update({ where: { id }, data: { isActive: true } });
        res.json({ message: 'Place reactivated' });
    } catch (err) {
        res.status(500).json({ message: 'Error reactivating place', error: err.message });
    }
});

// Replace a venue's mapped restaurants wholesale. The admin UI sends the full
// ticked list every time, so this is a set-not-patch operation — simpler to
// reason about than add/remove deltas, and array order becomes `position`.
venueRouter.put('/:id/restaurants', supportAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid place' });

    const { restaurantIds } = req.body;
    if (!Array.isArray(restaurantIds)) {
        return res.status(400).json({ message: 'restaurantIds must be an array' });
    }
    // Dedupe before validating — the unique constraint would reject a repeat,
    // but a clear message beats a 500 out of createMany.
    const ids = [...new Set(restaurantIds.map((n) => parseInt(n, 10)))];
    if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
        return res.status(400).json({ message: 'restaurantIds must all be numeric ids' });
    }

    try {
        const venue = await prisma.venue.findUnique({ where: { id }, select: { id: true } });
        if (!venue) return res.status(404).json({ message: 'Place not found' });

        if (ids.length) {
            const found = await prisma.restaurant.count({ where: { id: { in: ids } } });
            if (found !== ids.length) return res.status(400).json({ message: 'One or more restaurants do not exist' });
        }

        await prisma.$transaction([
            prisma.venueRestaurant.deleteMany({ where: { venueId: id } }),
            ...(ids.length
                ? [prisma.venueRestaurant.createMany({
                    data: ids.map((restaurantId, position) => ({ venueId: id, restaurantId, position })),
                })]
                : []),
        ]);

        res.json({ venueId: id, restaurantIds: ids });
    } catch (err) {
        res.status(500).json({ message: 'Error updating place restaurants', error: err.message });
    }
});

// ── Admin: analytics ──────────────────────────────────────────────────────────
// Both take ?from=&to=&tzOffset=. Declared before the :idOrSlug routes; the
// literal segments can't be shadowed anyway (a venue slugged "analytics" is
// rejected by VENUE_RESERVED_SLUGS), but keeping the order explicit means one
// less thing to reason about when a route is added later.

// Every venue side by side, so the admin can rank them without opening each.
venueRouter.get('/analytics/overview', supportAuth, async (req, res) => {
    const parsed = parseRange(req.query);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });
    try {
        res.json(await venuesOverview(parsed.range));
    } catch (err) {
        res.status(500).json({ message: 'Error building places overview', error: err.message });
    }
});

venueRouter.get('/:id/analytics', supportAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid place' });

    const parsed = parseRange(req.query);
    if (!parsed.ok) return res.status(400).json({ message: parsed.message });

    try {
        const venue = await prisma.venue.findUnique({
            where: { id },
            select: { id: true, name: true, slug: true, type: true, membershipMode: true, isActive: true },
        });
        if (!venue) return res.status(404).json({ message: 'Place not found' });

        const data = await venueAnalytics(id, parsed.range);
        res.json({ venue, ...data });
    } catch (err) {
        res.status(500).json({ message: 'Error building place analytics', error: err.message });
    }
});

// ── Public: one venue ─────────────────────────────────────────────────────────
// Declared last: /:idOrSlug would otherwise swallow every literal path above.

venueRouter.get('/:idOrSlug', async (req, res) => {
    try {
        const id = await resolveVenueId(req.params.idOrSlug);
        if (id === null) return res.status(404).json({ message: 'Place not found' });

        const venue = await prisma.venue.findUnique({
            where: { id },
            select: { ...PUBLIC_VENUE_SELECT, isActive: true },
        });
        // A deactivated venue 404s rather than redirecting — a stale QR code on
        // a campus noticeboard should say so, not silently dump the customer on
        // the generic home page wondering what happened.
        if (!venue || !venue.isActive) return res.status(404).json({ message: 'Place not found' });

        const { isActive, ...rest } = venue;
        res.json({
            ...rest,
            outletCount: (await venueMemberIds(venue)).length,
            venueUrl: venueUrlFor(venue, FRONTEND_URL),
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching place', error: err.message });
    }
});

venueRouter.get('/:idOrSlug/restaurants', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const search = (req.query.search || '').trim();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    try {
        const id = await resolveVenueId(req.params.idOrSlug);
        if (id === null) return res.status(404).json({ message: 'Place not found' });

        const venue = await prisma.venue.findUnique({ where: { id } });
        if (!venue || !venue.isActive) return res.status(404).json({ message: 'Place not found' });

        const all = await venueRestaurantCards(venue, { lat, lng, search });
        const offset = (page - 1) * pageSize;
        // NEARBY_RADIUS_KM deliberately does NOT apply here. Inside a venue the
        // customer sees every outlet that belongs to it, however far across the
        // campus it happens to be.
        res.json({
            restaurants: all.slice(offset, offset + pageSize),
            page,
            pageSize,
            total: all.length,
            totalPages: Math.max(1, Math.ceil(all.length / pageSize)),
            sortedBy: validCoords(lat, lng) ? 'distance' : 'venueOrder',
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching place restaurants', error: err.message });
    }
});

export default venueRouter;
export { venueMemberIds, venueRestaurantCards, parseVenueBody };
