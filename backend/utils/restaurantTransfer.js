import prisma from '../config/prisma.js';

// Moving ONE restaurant's setup between deployments (staging → production):
// profile, branding, menu with its options, and parking spots. Used by the
// admin portal's Transfer tab and by scripts/export-restaurant.js.
//
// Deliberately NOT included: orders, customers, payments, refunds, analytics
// history, waiters (staff differ per location, and their delivery history is
// tied to orders that aren't coming along), and PhonePe credentials (live keys
// belong to the live deployment, not whatever staging was pointed at).

export const EXPORT_VERSION = 1;

// Reads a restaurant by id or slug and returns a plain, id-free payload.
export async function buildRestaurantExport(idOrSlug) {
  const where = /^\d+$/.test(String(idOrSlug)) ? { id: Number(idOrSlug) } : { slug: String(idOrSlug) };

  const restaurant = await prisma.restaurant.findFirst({
    where,
    include: {
      city: { select: { name: true, state: true } },
      category: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
      menu: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: {
          category: { select: { name: true } },
          optionGroups: { include: { options: { orderBy: { id: 'asc' } } }, orderBy: { id: 'asc' } },
        },
      },
      parkingSpots: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!restaurant) return null;

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { id: restaurant.id, slug: restaurant.slug, name: restaurant.name },
    restaurant: {
      name: restaurant.name,
      slug: restaurant.slug,
      domain: restaurant.domain,
      username: restaurant.username,
      password: restaurant.password, // bcrypt hash — the same dashboard login keeps working
      paymentGateway: restaurant.paymentGateway,
      address: restaurant.address,
      phone: restaurant.phone,
      themeColor: restaurant.themeColor,
      secondaryColor: restaurant.secondaryColor,
      accentColor: restaurant.accentColor,
      fontFamily: restaurant.fontFamily,
      cardStyle: restaurant.cardStyle,
      logoUrl: restaurant.logoUrl,
      coverUrl: restaurant.coverUrl,
      cuisines: restaurant.cuisines,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      pickupEnabled: restaurant.pickupEnabled,
      deliveryEnabled: restaurant.deliveryEnabled,
      isOpen: restaurant.isOpen,
      openingTime: restaurant.openingTime,
      closingTime: restaurant.closingTime,
      gstin: restaurant.gstin,
      gstRate: restaurant.gstRate,
      pricesIncludeGst: restaurant.pricesIncludeGst,
      fssaiLicense: restaurant.fssaiLicense,
      legalName: restaurant.legalName,
      supportEmail: restaurant.supportEmail,
      supportPhone: restaurant.supportPhone,
      slaWarnMinutes: restaurant.slaWarnMinutes,
      slaCritMinutes: restaurant.slaCritMinutes,
      parkingSpotRequired: restaurant.parkingSpotRequired,
      isActive: restaurant.isActive,
      // Matched (or created) by name on import — city ids differ per database.
      city: restaurant.city || null,
      // PhonePe: settings only, never the credentials.
      phonepeApiVersion: restaurant.phonepeApiVersion,
      phonepeSandbox: restaurant.phonepeSandbox,
    },
    categories: restaurant.category.map((c) => ({ name: c.name, position: c.position, isActive: c.isActive })),
    menuItems: restaurant.menu.map((m) => ({
      name: m.name,
      description: m.description,
      price: m.price,
      available: m.available,
      isVeg: m.isVeg,
      imageUrl: m.imageUrl,
      position: m.position,
      isActive: m.isActive,
      // Menu items point at categories by NAME; ids are assigned on import.
      categoryName: m.category?.name ?? null,
      optionGroups: m.optionGroups.map((g) => ({
        title: g.title,
        required: g.required,
        multiple: g.multiple,
        options: g.options.map((o) => ({ name: o.name, priceDelta: o.priceDelta })),
      })),
    })),
    parkingSpots: restaurant.parkingSpots.map((p) => ({ name: p.name, position: p.position, isActive: p.isActive })),
  };
}

export function summarize(payload) {
  return {
    name: payload?.restaurant?.name ?? null,
    slug: payload?.restaurant?.slug ?? null,
    categories: payload?.categories?.length ?? 0,
    menuItems: payload?.menuItems?.length ?? 0,
    optionGroups: (payload?.menuItems || []).reduce((s, m) => s + (m.optionGroups?.length || 0), 0),
    parkingSpots: payload?.parkingSpots?.length ?? 0,
  };
}

// Shape check before anything is written — an arbitrary uploaded file must not
// reach prisma.create.
export function validateExport(payload) {
  if (!payload || typeof payload !== 'object') return 'Not a valid export file';
  if (payload.version !== EXPORT_VERSION) return `Unsupported export version (${payload.version ?? 'none'}) — expected ${EXPORT_VERSION}`;
  const r = payload.restaurant;
  if (!r || typeof r !== 'object') return 'Export has no restaurant';
  for (const field of ['name', 'username', 'domain', 'address']) {
    if (!r[field]) return `Export is missing the restaurant's ${field}`;
  }
  for (const key of ['categories', 'menuItems', 'parkingSpots']) {
    if (!Array.isArray(payload[key])) return `Export is missing its ${key} list`;
  }
  return null;
}

// Creates the restaurant here, with fresh ids, in one transaction. Returns
// { error } when the slug/username is taken, else { restaurant, counts }.
export async function importRestaurant(payload) {
  const invalid = validateExport(payload);
  if (invalid) return { error: invalid };

  const { restaurant: r, categories, menuItems, parkingSpots } = payload;
  const { city, ...restaurantFields } = r;

  const clash = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: r.slug || undefined }, { username: r.username }] },
    select: { id: true, slug: true, username: true },
  });
  if (clash) {
    return { error: `A restaurant with that ${clash.username === r.username ? 'username' : 'web address'} already exists here (id ${clash.id})` };
  }

  const created = await prisma.$transaction(async (tx) => {
    let cityId = null;
    if (city?.name) {
      const existing = await tx.city.findFirst({ where: { name: city.name } });
      cityId = existing?.id ?? (await tx.city.create({ data: { name: city.name, state: city.state ?? null, isActive: true } })).id;
    }

    const restaurant = await tx.restaurant.create({ data: { ...restaurantFields, cityId } });

    const categoryIdByName = new Map();
    for (const c of categories) {
      const row = await tx.category.create({
        data: { name: c.name, position: c.position ?? 0, isActive: c.isActive ?? true, restaurantId: restaurant.id },
      });
      categoryIdByName.set(c.name, row.id);
    }

    for (const item of menuItems) {
      const { categoryName, optionGroups = [], ...fields } = item;
      await tx.menuItem.create({
        data: {
          ...fields,
          restaurantId: restaurant.id,
          categoryId: categoryName ? categoryIdByName.get(categoryName) ?? null : null,
          optionGroups: {
            create: optionGroups.map((g) => ({
              title: g.title,
              required: !!g.required,
              multiple: !!g.multiple,
              options: { create: (g.options || []).map((o) => ({ name: o.name, priceDelta: o.priceDelta ?? 0 })) },
            })),
          },
        },
      });
    }

    for (const spot of parkingSpots) {
      await tx.parkingSpot.create({
        data: { name: spot.name, position: spot.position ?? 0, isActive: spot.isActive ?? true, restaurantId: restaurant.id },
      });
    }

    return restaurant;
  }, { timeout: 120000 });

  const counts = await prisma.restaurant.findUnique({
    where: { id: created.id },
    select: { _count: { select: { category: true, menu: true, parkingSpots: true } } },
  });

  return {
    restaurant: { id: created.id, name: created.name, slug: created.slug, username: created.username },
    counts: { categories: counts._count.category, menuItems: counts._count.menu, parkingSpots: counts._count.parkingSpots },
  };
}
