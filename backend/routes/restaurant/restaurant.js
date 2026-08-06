import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/prisma.js';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import supportAuth from '../../middlewares/support.auth.js';
import { slugify, validateSlug, uniqueSlug, isSlugTaken, resolveRestaurantId, orderingUrlFor } from '../../utils/slug.js';

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
            select: { id: true, name: true, slug: true, username: true, domain: true, address: true, phone: true, themeColor: true, secondaryColor: true, accentColor: true, fontFamily: true, cardStyle: true, logoUrl: true, coverUrl: true, pickupEnabled: true, deliveryEnabled: true, isOpen: true, slaWarnMinutes: true, slaCritMinutes: true, latitude: true, longitude: true, cityId: true, phonepeMerchantId: true, phonepeSaltIndex: true, phonepeSandbox: true, phonepeSaltKey: true },
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
    const { name, slug, phone, address, themeColor, secondaryColor, accentColor, fontFamily, cardStyle, logoUrl, coverUrl, pickupEnabled, deliveryEnabled, isOpen, slaWarnMinutes, slaCritMinutes, latitude, longitude, cityId, phonepeMerchantId, phonepeSaltKey, phonepeSaltIndex, phonepeSandbox } = req.body;
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
            select: { id: true, name: true, slug: true, username: true, domain: true, address: true, phone: true, themeColor: true, secondaryColor: true, accentColor: true, fontFamily: true, cardStyle: true, logoUrl: true, coverUrl: true, pickupEnabled: true, deliveryEnabled: true, isOpen: true, slaWarnMinutes: true, slaCritMinutes: true, latitude: true, longitude: true, cityId: true, phonepeMerchantId: true, phonepeSaltIndex: true, phonepeSandbox: true, phonepeSaltKey: true },
        });
        const { phonepeSaltKey: _saltKey, ...safeUpdated } = updated;
        res.json({ ...safeUpdated, phonepeConfigured: !!(updated.phonepeMerchantId && _saltKey), orderingUrl: orderingUrlFor(updated, FRONTEND_URL) });
    } catch (err) {
        res.status(500).json({ message: 'Error updating restaurant', error: err });
    }
});

restaurantRouter.get('/all', supportAuth, async (req, res) => {
    try {
        const restaurants = await prisma.restaurant.findMany({
            where: { isActive: true },
            include: {
                menu: true,
                orders: true,
                category: true,
            },
        });
        res.json(restaurants);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurants', error: err });
    }
});

// Public, unauthenticated — the mobile app's homepage. Registered before
// GET /:id (Express matches routes in order; /:id would otherwise swallow
// this path). Distance-sorted when ?lat=&lng= are given and valid (GPS
// takes priority over ?cityId= if both are somehow sent); otherwise falls
// back to rating-sorted, optionally narrowed to one city (the customer
// picked a city instead of granting location). ?search= matches name or
// cuisines and layers onto either mode. Only restaurants with saved
// coordinates are eligible for distance sort — one without them just
// doesn't show up until an admin sets them.
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

    try {
        const rows = hasCoords
            ? await prisma.$queryRawUnsafe(
                `
                SELECT id, name, slug, "logoUrl", "coverUrl", cuisines, rating, "ratingCount", "isOpen", address,
                  (6371 * acos(LEAST(1, GREATEST(-1,
                    cos(radians($1)) * cos(radians(latitude)) * cos(radians(longitude) - radians($2))
                    + sin(radians($1)) * sin(radians(latitude))
                  )))) AS distance,
                  COUNT(*) OVER()::int AS "totalCount"
                FROM "Restaurant"
                WHERE "isActive" = true AND latitude IS NOT NULL AND longitude IS NOT NULL
                  AND ($3 = '' OR name ILIKE '%' || $3 || '%' OR cuisines ILIKE '%' || $3 || '%')
                ORDER BY distance ASC
                LIMIT $4 OFFSET $5
                `,
                lat, lng, search, pageSize, offset
              )
            : await prisma.$queryRawUnsafe(
                `
                SELECT id, name, slug, "logoUrl", "coverUrl", cuisines, rating, "ratingCount", "isOpen", address,
                  NULL::float AS distance,
                  COUNT(*) OVER()::int AS "totalCount"
                FROM "Restaurant"
                WHERE "isActive" = true
                  AND ($1::int IS NULL OR "cityId" = $1::int)
                  AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR cuisines ILIKE '%' || $2 || '%')
                ORDER BY rating DESC NULLS LAST, "ratingCount" DESC NULLS LAST
                LIMIT $3 OFFSET $4
                `,
                cityId, search, pageSize, offset
              );

        const total = rows[0]?.totalCount ?? 0;
        const restaurants = rows.map(({ totalCount, ...r }) => r);
        res.json({
            restaurants,
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            sortedBy: hasCoords ? 'distance' : 'rating',
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
            include: {
                menu: true,
                category: true,
            },
        });

        if (!restaurant || !restaurant.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        // Average total wait (placed → COMPLETED) over the most recent
        // completed orders — a light public signal for "how long will this
        // take", not the full order history (this endpoint used to include
        // every raw Order row — every guest's name/vehicle/phone-linked order
        // — to any unauthenticated caller; that's gone in favor of just this).
        const waitRows = await prisma.$queryRawUnsafe(
            `
            SELECT AVG(EXTRACT(EPOCH FROM ("updatedAt" - "createdAt")) / 60) AS "avgMinutes"
            FROM (
              SELECT "updatedAt", "createdAt" FROM "Order"
              WHERE "restaurantId" = $1 AND status = 'COMPLETED'
              ORDER BY "createdAt" DESC
              LIMIT 20
            ) recent
            `,
            id
        );
        const avgWaitMinutes = waitRows[0]?.avgMinutes != null ? Math.round(Number(waitRows[0].avgMinutes)) : null;

        res.json({ ...restaurant, avgWaitMinutes });
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
    const { name, slug, domain, username, paymentGateway, address, phone, themeColor, logoUrl, latitude, longitude, cityId } = req.body;

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
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing || !existing.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const updated = await prisma.restaurant.update({
            where: { id },
            data: { name, domain, username, paymentGateway, address, phone, themeColor, logoUrl, ...slugData, ...coords.data, ...city.data },
        });

        res.json(updated);
    } catch (err) {
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
    const {username,password}=req.body;
    const existing = await prisma.restaurant.findUnique({where:{username:username}})
    
    
    if(await bcrypt.compare(password,existing.password)){
        const accessToken=jwt.sign({ id: existing.id }, process.env.JWT_SECRET || "s3cret", { expiresIn: '24h' });
        const refreshToken=jwt.sign({ id: existing.id }, process.env.JWT_SECRET || "s3cret", { expiresIn:'7d' });
        prisma.restaurant.update({
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
        res.json({code:401, message:"Wrong Credentials"})
    }

})

restaurantRouter.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

export default restaurantRouter;