import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/prisma.js';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import supportAuth from '../../middlewares/support.auth.js';
import { slugify, validateSlug, uniqueSlug, isSlugTaken, resolveRestaurantId, orderingUrlFor } from '../../utils/slug.js';
import { validateHours, customerOpenState } from '../../utils/businessHours.js';
import { menuWaitEstimate } from '../../utils/waitEstimate.js';
import { validateTaxSettings } from '../../utils/gst.js';

const restaurantRouter = express.Router();
restaurantRouter.use(cookieParser());

// The mobile ordering app's own base URL — do NOT confuse with DASHBOARD_URL
// (used elsewhere for waiter /scan links). Same env var as payment.js's redirect
// target, so the QR always points at the same app customers actually order from.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';

restaurantRouter.get('/me', restaurantAuth, async (req, res) => {
    try {
        const restaurant = await prisma.restaurant.findUnique({
            where: { id: req.restaurantId },
            select: { id: true, name: true, slug: true, username: true, domain: true, address: true, phone: true, themeColor: true, secondaryColor: true, accentColor: true, fontFamily: true, cardStyle: true, logoUrl: true, coverUrl: true, pickupEnabled: true, deliveryEnabled: true, isOpen: true, slaWarnMinutes: true, slaCritMinutes: true, openingTime: true, closingTime: true, gstin: true, gstRate: true, fssaiLicense: true, legalName: true, supportEmail: true, supportPhone: true, latitude: true, longitude: true, cityId: true, phonepeMerchantId: true, phonepeSaltIndex: true, phonepeSandbox: true, phonepeSaltKey: true },
        });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        // phonepeSaltKey is fetched only to derive this flag — it must never
        // leave the server in a response body.
        const { phonepeSaltKey, ...safe } = restaurant;
        res.json({ ...safe, phonepeConfigured: !!(restaurant.phonepeMerchantId && phonepeSaltKey), orderingUrl: orderingUrlFor(restaurant, FRONTEND_URL) });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurant', error: err });
    }
});

// Restaurant edits its OWN profile/branding from the dashboard settings page.
const FONT_KEYS = ['manrope', 'inter', 'poppins', 'playfair', 'spacegrotesk', 'fraunces'];
const CARD_STYLES = ['rounded', 'sharp'];

restaurantRouter.put('/me', restaurantAuth, async (req, res) => {
    const { name, slug, phone, address, themeColor, secondaryColor, accentColor, fontFamily, cardStyle, logoUrl, coverUrl, pickupEnabled, deliveryEnabled, isOpen, slaWarnMinutes, slaCritMinutes, openingTime, closingTime, gstin, gstRate, fssaiLicense, legalName, supportEmail, supportPhone, latitude, longitude, cityId, phonepeMerchantId, phonepeSaltKey, phonepeSaltIndex, phonepeSandbox } = req.body;
    try {
        const data = {};
        if (name !== undefined) data.name = name || null;

        // The owner picked this themselves, so a clash is reported back rather
        // than silently suffixed the way a system-derived slug is — otherwise
        // they'd print a QR code for an address they never chose.
        if (slug !== undefined) {
            const check = validateSlug(slug);
            if (!check.ok) return res.status(400).json({ message: check.message });
            if (await isSlugTaken(check.slug, req.restaurantId)) {
                return res.status(409).json({ message: `The web address "${check.slug}" is already taken` });
            }
            data.slug = check.slug;
        }
        if (phone !== undefined) data.phone = phone || null;
        if (address !== undefined) data.address = address;
        if (themeColor !== undefined) data.themeColor = themeColor || '#f97316';
        if (secondaryColor !== undefined) data.secondaryColor = secondaryColor || '#7c3aed';
        if (accentColor !== undefined) data.accentColor = accentColor || '#f59e0b';
        if (fontFamily !== undefined) data.fontFamily = FONT_KEYS.includes(fontFamily) ? fontFamily : 'manrope';
        if (cardStyle !== undefined) data.cardStyle = CARD_STYLES.includes(cardStyle) ? cardStyle : 'rounded';
        if (logoUrl !== undefined) data.logoUrl = logoUrl || null;
        if (coverUrl !== undefined) data.coverUrl = coverUrl || null;
        if (isOpen !== undefined) data.isOpen = !!isOpen;

        // Location — same parsing/validation the SaaS admin portal uses (see
        // parseCoordinates/parseCityId below) so a restaurant owner setting
        // these themselves is held to the same rules.
        if (latitude !== undefined || longitude !== undefined) {
            const coords = parseCoordinates(latitude, longitude);
            if (!coords.ok) {
                return res.status(400).json({ message: 'Latitude must be between -90 and 90, longitude between -180 and 180' });
            }
            Object.assign(data, coords.data);
        }
        if (cityId !== undefined) {
            const city = parseCityId(cityId);
            if (!city.ok) {
                return res.status(400).json({ message: 'Invalid city' });
            }
            Object.assign(data, city.data);
        }

        // Kitchen SLA thresholds — validated together (like fulfilment) so a
        // request touching only one can't leave warn >= crit.
        if (slaWarnMinutes !== undefined || slaCritMinutes !== undefined) {
            const existing = await prisma.restaurant.findUnique({
                where: { id: req.restaurantId },
                select: { slaWarnMinutes: true, slaCritMinutes: true },
            });
            const nextWarn = slaWarnMinutes !== undefined ? parseInt(slaWarnMinutes) : existing.slaWarnMinutes;
            const nextCrit = slaCritMinutes !== undefined ? parseInt(slaCritMinutes) : existing.slaCritMinutes;
            if (!Number.isInteger(nextWarn) || !Number.isInteger(nextCrit) || nextWarn < 1 || nextCrit < 1) {
                return res.status(400).json({ message: 'SLA thresholds must be positive whole numbers of minutes' });
            }
            if (nextWarn >= nextCrit) {
                return res.status(400).json({ message: 'The warning threshold must be less than the critical threshold' });
            }
            data.slaWarnMinutes = nextWarn;
            data.slaCritMinutes = nextCrit;
        }

        // Opening hours — validated as a pair so a request can't leave just one set.
        if (openingTime !== undefined || closingTime !== undefined) {
            const hours = validateHours(openingTime ?? null, closingTime ?? null);
            if (!hours.ok) return res.status(400).json({ message: hours.message });
            Object.assign(data, hours.data);
        }

        // Tax & compliance — validated against the saved values so e.g. setting a
        // GST rate without a GSTIN is refused even if the GSTIN isn't in this request.
        if (gstin !== undefined || gstRate !== undefined || fssaiLicense !== undefined) {
            const existing = await prisma.restaurant.findUnique({ where: { id: req.restaurantId }, select: { gstin: true, gstRate: true } });
            const tax = validateTaxSettings({ gstin, gstRate, fssaiLicense }, existing);
            if (!tax.ok) return res.status(400).json({ message: tax.message });
            Object.assign(data, tax.data);
        }

        // Seller details for this restaurant's policy pages. Payment gateways
        // check these against the merchant's KYC, so they're validated rather
        // than stored as free text.
        if (legalName !== undefined) data.legalName = (legalName || '').trim() || null;
        if (supportEmail !== undefined) {
            const v = (supportEmail || '').trim();
            if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
                return res.status(400).json({ message: 'Support email must be a valid address' });
            }
            data.supportEmail = v || null;
        }
        if (supportPhone !== undefined) {
            const v = (supportPhone || '').replace(/[^\d+]/g, '');
            if (v && !/^\+?\d{10,13}$/.test(v)) {
                return res.status(400).json({ message: 'Support phone must be 10-13 digits' });
            }
            data.supportPhone = v || null;
        }

        // Pickup and delivery-in-car are validated together — at least one must stay
        // enabled, whether this request is touching one of them or both at once.
        if (pickupEnabled !== undefined || deliveryEnabled !== undefined) {
            const existing = await prisma.restaurant.findUnique({
                where: { id: req.restaurantId },
                select: { pickupEnabled: true, deliveryEnabled: true },
            });
            const nextPickup = pickupEnabled !== undefined ? !!pickupEnabled : existing.pickupEnabled;
            const nextDelivery = deliveryEnabled !== undefined ? !!deliveryEnabled : existing.deliveryEnabled;
            if (!nextPickup && !nextDelivery) {
                return res.status(400).json({ message: 'At least one fulfilment option (pickup or delivery) must stay enabled' });
            }
            data.pickupEnabled = nextPickup;
            data.deliveryEnabled = nextDelivery;
        }

        // PhonePe credentials. phonepeSaltKey is write-only ("leave blank to
        // keep existing", same pattern as the restaurant login password on the
        // admin edit form) — an empty/undefined value never overwrites a saved
        // key, since GET /me can't hand it back for the form to round-trip.
        if (phonepeMerchantId !== undefined) data.phonepeMerchantId = phonepeMerchantId.trim() || null;
        if (phonepeSaltKey !== undefined && phonepeSaltKey.trim()) data.phonepeSaltKey = phonepeSaltKey.trim();
        if (phonepeSaltIndex !== undefined) data.phonepeSaltIndex = phonepeSaltIndex.trim() || '1';
        if (phonepeSandbox !== undefined) data.phonepeSandbox = !!phonepeSandbox;

        const updated = await prisma.restaurant.update({
            where: { id: req.restaurantId },
            data,
            select: { id: true, name: true, slug: true, username: true, domain: true, address: true, phone: true, themeColor: true, secondaryColor: true, accentColor: true, fontFamily: true, cardStyle: true, logoUrl: true, coverUrl: true, pickupEnabled: true, deliveryEnabled: true, isOpen: true, slaWarnMinutes: true, slaCritMinutes: true, openingTime: true, closingTime: true, gstin: true, gstRate: true, fssaiLicense: true, legalName: true, supportEmail: true, supportPhone: true, latitude: true, longitude: true, cityId: true, phonepeMerchantId: true, phonepeSaltIndex: true, phonepeSandbox: true, phonepeSaltKey: true },
        });
        const { phonepeSaltKey: _saltKey, ...safeUpdated } = updated;
        res.json({ ...safeUpdated, phonepeConfigured: !!(updated.phonepeMerchantId && _saltKey), orderingUrl: orderingUrlFor(updated, FRONTEND_URL) });
    } catch (err) {
        res.status(500).json({ message: 'Error updating restaurant', error: err });
    }
});

// Admin portal list — every restaurant, deactivated ones included (they need
// to be visible to be reactivated), active first. An explicit select rather
// than full rows: this used to ship every restaurant's password hash, PhonePe
// salt key, refresh token and entire order history to the browser.
restaurantRouter.get('/all', supportAuth, async (req, res) => {
    try {
        const restaurants = await prisma.restaurant.findMany({
            select: {
                id: true, name: true, slug: true, domain: true, username: true, address: true, phone: true,
                paymentGateway: true, themeColor: true, logoUrl: true, latitude: true, longitude: true, cityId: true,
                isActive: true, isOpen: true, createdAt: true, parkingSpotRequired: true,
                parkingSpots: { where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
                _count: { select: { menu: true, orders: true } },
            },
            orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
        });
        res.json(restaurants);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurants', error: err });
    }
});

// How far a customer will be shown restaurants from. The mobile home page is
// GPS-only, so in practice this is the whole catalogue a customer ever sees —
// env-overridable to tune it per deployment without a code change.
const NEARBY_RADIUS_KM = Number(process.env.NEARBY_RADIUS_KM) || 3;

// Public, unauthenticated — the mobile app's homepage. Registered before
// GET /:id (Express matches routes in order; /:id would otherwise swallow
// this path). Distance-sorted when ?lat=&lng= are given and valid (GPS
// takes priority over ?cityId= if both are somehow sent). Browsing (no
// ?search=) is capped at NEARBY_RADIUS_KM and only lists restaurants with
// saved coordinates. A search is NOT capped: it matches name or cuisines
// across every active restaurant, still closest first, with ones that have
// no coordinates yet listed after all the located ones — and if that finds
// nothing it retries against the address, so typing an area still works.
// Without coordinates it falls back to rating-sorted, optionally narrowed to
// one city.
restaurantRouter.get('/nearby', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 10));
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || '').trim();

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    const cityIdNum = parseInt(req.query.cityId, 10);
    const cityId = !hasCoords && Number.isInteger(cityIdNum) && cityIdNum > 0 ? cityIdNum : null;

    // Which columns a search term is matched against. Address is NOT in the
    // first pass on purpose: "garden" would otherwise pull in every restaurant
    // on Garden Road alongside Spice Garden, burying the obvious answer. It is
    // only consulted when the name/cuisine pass found nothing at all, which is
    // when a customer is most likely to have typed a place rather than a
    // restaurant ("kharadi", "connaught place").
    const matchExpr = (p, withAddress) => [
        `name ILIKE '%' || ${p} || '%'`,
        `cuisines ILIKE '%' || ${p} || '%'`,
        ...(withAddress ? [`address ILIKE '%' || ${p} || '%'`] : []),
    ].join(' OR ');

    const runQuery = (withAddress) => (hasCoords
        // The Haversine distance is computed in a subquery so the radius
        // cut and the COUNT(*) OVER() total can both be applied to it —
        // a bare SELECT alias isn't referenceable from its own WHERE.
        ? prisma.$queryRawUnsafe(
            `
            SELECT *, COUNT(*) OVER()::int AS "totalCount"
            FROM (
              SELECT id, name, slug, "logoUrl", "coverUrl", cuisines, rating, "ratingCount", "isOpen", "openingTime", "closingTime", address,
                -- NULL (not a number) for a restaurant without coordinates —
                -- GREATEST() skips NULLs, so without this guard it would
                -- come out as acos(-1): half the planet away.
                CASE WHEN latitude IS NULL OR longitude IS NULL THEN NULL ELSE
                (6371 * acos(LEAST(1, GREATEST(-1,
                  cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
                  + sin(radians($1)) * sin(radians(latitude))
                )))) END AS distance
              FROM "Restaurant"
              WHERE "isActive" = true
                AND ($3 <> '' OR (latitude IS NOT NULL AND longitude IS NOT NULL))
                AND ($3 = '' OR ${matchExpr('$3', withAddress)})
            ) nearby
            WHERE $3 <> '' OR distance <= $6
            ORDER BY distance ASC NULLS LAST, rating DESC NULLS LAST
            LIMIT $4 OFFSET $5
            `,
            lat, lng, search, pageSize, offset, NEARBY_RADIUS_KM
          )
        : prisma.$queryRawUnsafe(
            `
            SELECT id, name, slug, "logoUrl", "coverUrl", cuisines, rating, "ratingCount", "isOpen", "openingTime", "closingTime", address,
              NULL::float AS distance,
              COUNT(*) OVER()::int AS "totalCount"
            FROM "Restaurant"
            WHERE "isActive" = true
              AND ($1::int IS NULL OR "cityId" = $1::int)
              AND ($2 = '' OR ${matchExpr('$2', withAddress)})
            ORDER BY rating DESC NULLS LAST, "ratingCount" DESC NULLS LAST
            LIMIT $3 OFFSET $4
            `,
            cityId, search, pageSize, offset
          ));

    try {
        let rows = await runQuery(false);
        // Fall back to matching the address when the ordinary search came back
        // empty. Paging stays consistent without tracking which pass produced
        // page 1: a name/cuisine search that yields nothing yields nothing on
        // every page, so every page of a fallback result set takes this branch
        // too. (And when the first pass does have hits, the client never asks
        // for a page beyond its totalPages, so this never fires mid-set.)
        let matchedOn = 'name';
        if (!rows.length && search) {
            rows = await runQuery(true);
            if (rows.length) matchedOn = 'address';
        }

        const total = rows[0]?.totalCount ?? 0;
        // isOpen as customers see it: the manual switch AND the opening hours.
        const restaurants = rows.map(({ totalCount, ...r }) => ({ ...r, ...customerOpenState(r) }));
        res.json({
            restaurants,
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            sortedBy: hasCoords ? 'distance' : 'rating',
            radiusKm: hasCoords ? NEARBY_RADIUS_KM : null,
            // Whether the radius was applied — searches cover every restaurant.
            withinRadius: hasCoords && !search,
            // 'address' means nothing matched by name or cuisine and these are
            // area matches instead, so the app can say so rather than looking
            // like it ignored what was typed.
            matchedOn: search ? matchedOn : null,
        });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching nearby restaurants', error: err.message });
    }
});

// Public lookup. The path segment is either the numeric id (/restaurant/12) or
// the slug (/restaurant/spice-garden) — the ordering app's vanity URL /<slug>
// resolves through here too. Declared after /me, /all and /nearby so those keep
// matching first; they're reserved slugs, so nothing can shadow them.
restaurantRouter.get('/:idOrSlug', async (req, res) => {
    try {
        const id = await resolveRestaurantId(req.params.idOrSlug);
        if (id === null) return res.status(404).json({ message: 'Restaurant not found' });

        const restaurant = await prisma.restaurant.findUnique({
            where: { id },
            // Public endpoint — credentials must never be part of the response.
            omit: { password: true, refreshToken: true, phonepeSaltKey: true, phonepeMerchantId: true, phonepeSaltIndex: true },
            include: {
                menu: true,
                category: true,
                // Checkout's "Where are you parked?" dropdown.
                parkingSpots: { where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
            },
        });

        if (!restaurant || !restaurant.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        // Customer-facing wait estimate — see utils/waitEstimate.js. Replaces
        // a plain average of the last 20 completed orders (placed → updatedAt),
        // which POS bills dragged towards 0 and late clean-ups inflated.
        // avgWaitMinutes stays for app versions that still read it.
        const waitEstimate = await menuWaitEstimate(restaurant);

        res.json({ ...restaurant, ...customerOpenState(restaurant), waitEstimate, avgWaitMinutes: waitEstimate?.minutes ?? null });
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurant', error: err });
    }
});


// Coordinates are optional (a restaurant not yet located is simply excluded
// from the mobile app's distance-sorted nearby listing), but if given they
// must be real lat/lng values — bad data here silently breaks Haversine sort.
function parseCoordinates(latitude, longitude) {
    if (latitude === undefined && longitude === undefined) return { ok: true, data: {} };
    const latEmpty = latitude === '' || latitude === null;
    const lngEmpty = longitude === '' || longitude === null;
    if (latEmpty && lngEmpty) return { ok: true, data: { latitude: null, longitude: null } };
    if (latEmpty || lngEmpty) return { ok: false }; // must set both together, or neither
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { ok: false };
    }
    return { ok: true, data: { latitude: lat, longitude: lng } };
}

// cityId is optional — '' / null / undefined all mean "not set". Existence of
// the referenced City row is enforced by the FK constraint (Prisma throws on
// a bad id), not re-checked here — the admin dropdown only ever sends real ids.
function parseCityId(cityId) {
    if (cityId === undefined) return { ok: true, data: {} };
    if (cityId === '' || cityId === null) return { ok: true, data: { cityId: null } };
    const id = parseInt(cityId, 10);
    if (!Number.isInteger(id) || id <= 0) return { ok: false };
    return { ok: true, data: { cityId: id } };
}

restaurantRouter.post('/create', supportAuth, async (req, res) => {
    const {
        name,
        slug,
        domain,
        username,
        password,
        paymentGateway,
        address,
        phone,
        themeColor,
        logoUrl,
        latitude,
        longitude,
        cityId,
    } = req.body;

    console.log(req.body);

    if (!domain || !username || !password || !address) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const coords = parseCoordinates(latitude, longitude);
    if (!coords.ok) {
        return res.status(400).json({ message: 'Latitude must be between -90 and 90, longitude between -180 and 180' });
    }
    const city = parseCityId(cityId);
    if (!city.ok) {
        return res.status(400).json({ message: 'Invalid city' });
    }

    // An explicit slug is held to the rules and reported back if taken; an
    // omitted one is derived from the name (falling back to the username) and
    // auto-suffixed on collision, so every new restaurant gets a vanity URL
    // without support staff having to think about it.
    let resolvedSlug;
    if (slug !== undefined && String(slug).trim() !== '') {
        const check = validateSlug(slug);
        if (!check.ok) return res.status(400).json({ message: check.message });
        if (await isSlugTaken(check.slug)) {
            return res.status(409).json({ message: `The web address "${check.slug}" is already taken` });
        }
        resolvedSlug = check.slug;
    } else {
        const derived = validateSlug(slugify(name) || slugify(username));
        resolvedSlug = derived.ok && derived.slug ? await uniqueSlug(derived.slug) : null;
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const restaurant = await prisma.restaurant.create({
            data: {
                name: name || null,
                slug: resolvedSlug,
                domain,
                username,
                password: hashedPassword,
                paymentGateway,
                address,
                phone: phone || null,
                themeColor: themeColor || '#f97316',
                logoUrl: logoUrl || null,
                isActive: true,
                ...coords.data,
                ...city.data,
            },
        });

        res.status(201).json(restaurant);
    } catch (err) {
        console.error('Error creating restaurant:', err);
        res.status(500).json({ message: 'Error creating restaurant', error: err });
    }
});


restaurantRouter.put('/update/:id', supportAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { name, slug, domain, username, password, paymentGateway, address, phone, themeColor, logoUrl, latitude, longitude, cityId } = req.body;

    // Blank password means "keep the current one" (the admin form's label says
    // so). This field used to be dropped entirely, so a password "changed"
    // from the admin portal silently stayed the same.
    const passwordData = {};
    if (typeof password === 'string' && password !== '') {
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }
        passwordData.password = await bcrypt.hash(password, 10);
        passwordData.refreshToken = null;
    }

    const coords = parseCoordinates(latitude, longitude);
    if (!coords.ok) {
        return res.status(400).json({ message: 'Latitude must be between -90 and 90, longitude between -180 and 180' });
    }
    const city = parseCityId(cityId);
    if (!city.ok) {
        return res.status(400).json({ message: 'Invalid city' });
    }

    // Omitting slug leaves the existing one alone — changing a restaurant's
    // public address breaks every QR code already printed, so it only ever
    // moves when someone explicitly sends a new one.
    const slugData = {};
    if (slug !== undefined) {
        const check = validateSlug(slug);
        if (!check.ok) return res.status(400).json({ message: check.message });
        if (await isSlugTaken(check.slug, id)) {
            return res.status(409).json({ message: `The web address "${check.slug}" is already taken` });
        }
        slugData.slug = check.slug;
    }

    try {
        // Deactivated restaurants are editable too — the admin list shows them.
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const updated = await prisma.restaurant.update({
            where: { id },
            data: { name, domain, username, paymentGateway, address, phone, themeColor, logoUrl, ...slugData, ...coords.data, ...city.data, ...passwordData },
            select: { id: true, name: true, slug: true, username: true, isActive: true },
        });

        res.json({ ...updated, passwordChanged: !!passwordData.password });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ message: 'That username is already taken' });
        }
        res.status(500).json({ message: 'Error updating restaurant', error: err });
    }
});


restaurantRouter.put('/activate/:id', supportAuth, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ message: 'Restaurant not found' });

        const updated = await prisma.restaurant.update({
            where: { id },
            data: { isActive: true },
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error reactivating restaurant', error: err });
    }
});

restaurantRouter.delete('/delete/:id', supportAuth, async (req, res) => {
    const id = Number(req.params.id);

    try {
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing || !existing.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        await prisma.restaurant.update({
            where: { id },
            data: {
                isActive: false,
            },
        });

        res.json({ message: 'Restaurant deactivated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deactivating restaurant', error: err });
    }
});

restaurantRouter.post('/login',async(req,res)=>{
    const {username,password}=req.body || {};
    if(!username || !password) return res.status(400).json({code:400, message:"Missing fields"});

    const existing = await prisma.restaurant.findUnique({where:{username:username}})

    // Real HTTP status codes, not just a `code` field in a 200 body — the
    // dashboard (axios) decides success from the HTTP status, so a 200 here
    // showed "Signed in" for a wrong password. Unknown username gets the same
    // 401 as a wrong password so usernames can't be probed.
    if(existing && existing.password && await bcrypt.compare(password,existing.password)){
        // Checked only after the password matches, so this can't be used to
        // find out which usernames exist.
        if(!existing.isActive){
            return res.status(403).json({code:403, message:"This restaurant has been deactivated. Contact support."});
        }
        const accessToken=jwt.sign({ id: existing.id }, process.env.JWT_SECRET || "s3cret", { expiresIn: '24h' });
        const refreshToken=jwt.sign({ id: existing.id }, process.env.JWT_SECRET || "s3cret", { expiresIn:'7d' });
        await prisma.restaurant.update({
            where: { id: existing.id },
            data: {
                refreshToken: refreshToken,
            },
        })
        res.cookie("token", accessToken, {
        httpOnly: true,
        secure: false,       // change to true in production with HTTPS
        sameSite: "lax",     // or "strict" if you want tighter CSRF protection
        maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
        res.json({code:200,message:"loggedIn"});
    }else{
        res.status(401).json({code:401, message:"Wrong Credentials"})
    }

})

restaurantRouter.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

export default restaurantRouter;