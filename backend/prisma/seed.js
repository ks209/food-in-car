import { PrismaClient } from '../generated/prisma/index.js';
import bcrypt from 'bcryptjs';
// Only the pure helper — utils/slug.js's DB-backed functions import the shared
// client from config/prisma.js, and the seed deliberately runs its own.
import { slugify } from '../utils/slug.js';

const prisma = new PrismaClient();

// First free slug at or after `base`, using the seed's own client. `delegate`
// is any model with a unique `slug` — restaurants and venues both qualify.
async function freeSlug(base, delegate = prisma.restaurant) {
  let candidate = base;
  let n = 1;
  while (await delegate.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

// Fixed list for the mobile app's city-picker fallback (no admin UI for this
// yet — add rows here and re-run the seed to grow it).
const cities = [
  { name: 'Mumbai', state: 'Maharashtra' },
  { name: 'Pune', state: 'Maharashtra' },
  { name: 'Bengaluru', state: 'Karnataka' },
  { name: 'Delhi', state: 'Delhi' },
  { name: 'Hyderabad', state: 'Telangana' },
  { name: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Kolkata', state: 'West Bengal' },
  { name: 'Ahmedabad', state: 'Gujarat' },
  { name: 'Jaipur', state: 'Rajasthan' },
  { name: 'Chandigarh', state: 'Chandigarh' },
  { name: 'Vellore', state: 'Tamil Nadu' },
];

// Places that club several restaurants together. The two below are chosen to
// demonstrate the difference between the membership modes, which is the part of
// this feature most likely to be broken by a later change:
//
//   VIT University  STRICT    — lists ONLY its four mapped campus outlets.
//   City Square     INCLUSIVE — lists its two mapped outlets PLUS anything
//                               within 3 km, which picks up Green Bowl (1.6 km
//                               away, deliberately NOT mapped).
//
// So: Green Bowl must appear on City Square and must NOT appear on VIT. If it
// ever shows up on VIT, membershipMode is being ignored somewhere.
const venues = [
  {
    name: 'VIT University, Vellore',
    slug: 'vit-vellore',
    type: 'UNIVERSITY',
    description: 'Food outlets across the VIT Vellore campus — order from your hostel block or the car park.',
    address: 'VIT University, Katpadi, Vellore, TN 632014',
    cityName: 'Vellore',
    latitude: 12.9692,
    longitude: 79.1559,
    // A campus is wide — a customer anywhere inside the gates should be
    // detected, which needs a far larger radius than a single building.
    detectRadiusM: 900,
    membershipMode: 'STRICT',
    coverUrl: 'https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1200&q=70',
  },
  {
    name: 'City Square Mall',
    slug: 'city-square',
    type: 'MALL',
    description: 'The food court plus everything worth eating around City Square.',
    address: 'City Square Mall, Kharadi, Pune, MH 411014',
    cityName: 'Pune',
    latitude: 18.5610,
    longitude: 73.9170,
    // One building, so detection is tight — but the surrounding street food
    // genuinely is part of the destination, hence the wide include radius.
    detectRadiusM: 200,
    membershipMode: 'INCLUSIVE',
    includeRadiusM: 3000,
    coverUrl: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&w=1200&q=70',
  },
];

const restaurants = [
  {
    name: 'Spice Garden',
    username: 'spicegarden',
    password: 'spice123',
    domain: 'spicegarden.food',
    address: '12 Curry Lane, Mumbai, MH 400001',
    cityName: 'Mumbai',
    latitude: 19.0760,
    longitude: 72.8777,
    phone: '+91 98200 11111',
    paymentGateway: 'PHONEPE',
    themeColor: '#f97316',
    coverUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=70',
    cuisines: 'North Indian · Mughlai · Tandoor',
    rating: 4.5,
    ratingCount: 1240,
    waiters: ['Ravi Kumar', 'Anita Desai'],
    categories: [
      {
        name: 'Starters',
        items: [
          { name: 'Samosa (2 pcs)', description: 'Crispy fried pastry filled with spiced potatoes and peas', price: 60, isVeg: true },
          { name: 'Paneer Tikka', description: 'Grilled cottage cheese marinated in tandoori spices', price: 180, isVeg: true },
          { name: 'Chicken 65', description: 'Spicy fried chicken with curry leaves and green chillies', price: 200, isVeg: false },
        ],
      },
      {
        name: 'Main Course',
        items: [
          { name: 'Butter Chicken', description: 'Tender chicken in rich tomato-cream sauce', price: 320, isVeg: false },
          { name: 'Dal Tadka', description: 'Yellow lentils tempered with cumin and garlic', price: 180, isVeg: true },
          { name: 'Palak Paneer', description: 'Cottage cheese cubes in smooth spinach gravy', price: 220, isVeg: true },
        ],
      },
      {
        name: 'Breads',
        items: [
          { name: 'Butter Naan', description: 'Soft leavened flatbread with butter', price: 50, isVeg: true },
          { name: 'Garlic Roti', description: 'Whole wheat flatbread with garlic butter', price: 40, isVeg: true },
        ],
      },
      {
        name: 'Beverages',
        items: [
          { name: 'Mango Lassi', description: 'Chilled yogurt drink with fresh mango', price: 80, isVeg: true },
          { name: 'Masala Chai', description: 'Spiced Indian milk tea', price: 40, isVeg: true },
        ],
      },
    ],
  },
  {
    name: 'Burger Barn',
    username: 'burgerbarn',
    password: 'burger123',
    domain: 'burgerbarn.food',
    address: '88 Fast Food Street, Bengaluru, KA 560001',
    cityName: 'Bengaluru',
    latitude: 12.9716,
    longitude: 77.5946,
    phone: '+91 98450 22222',
    paymentGateway: 'razorpay',
    themeColor: '#ef4444',
    coverUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=70',
    cuisines: 'Burgers · American · Fast Food',
    rating: 4.3,
    ratingCount: 980,
    waiters: ['Suresh M', 'Priya N'],
    categories: [
      {
        name: 'Burgers',
        items: [
          { name: 'Classic Beef Burger', description: 'Juicy beef patty with lettuce, tomato, and pickles', price: 220, isVeg: false },
          { name: 'Crispy Chicken Burger', description: 'Fried chicken fillet with coleslaw and mayo', price: 200, isVeg: false },
          { name: 'Veggie Delight Burger', description: 'Bean patty with avocado, lettuce and sriracha', price: 160, isVeg: true },
        ],
      },
      {
        name: 'Sides',
        items: [
          { name: 'Cheese Fries', description: 'Crispy fries loaded with cheddar sauce', price: 100, isVeg: true },
          { name: 'Onion Rings', description: 'Battered and fried golden onion rings', price: 90, isVeg: true },
        ],
      },
      {
        name: 'Drinks',
        items: [
          { name: 'Chocolate Milkshake', description: 'Thick creamy chocolate shake', price: 120, isVeg: true },
          { name: 'Cold Coffee', description: 'Iced coffee with vanilla ice cream', price: 100, isVeg: true },
          { name: 'Fresh Lime Soda', description: 'Fizzy lime drink with mint', price: 60, isVeg: true },
        ],
      },
    ],
  },
  {
    name: 'The Green Bowl',
    username: 'greenbowl',
    password: 'green123',
    domain: 'greenbowl.food',
    address: '5 Wellness Avenue, Pune, MH 411001',
    cityName: 'Pune',
    latitude: 18.5700,
    longitude: 73.9050,
    phone: '+91 90110 33333',
    paymentGateway: 'razorpay',
    themeColor: '#10b981',
    coverUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=70',
    cuisines: 'Healthy · Salads · Power Bowls',
    rating: 4.6,
    ratingCount: 760,
    waiters: ['Karan S', 'Meera J'],
    categories: [
      {
        name: 'Salads',
        items: [
          { name: 'Caesar Salad', description: 'Romaine lettuce, parmesan, croutons, caesar dressing', price: 180, isVeg: true },
          { name: 'Greek Salad', description: 'Olives, feta, cucumber, tomatoes in olive oil', price: 200, isVeg: true },
        ],
      },
      {
        name: 'Power Bowls',
        items: [
          { name: 'Buddha Bowl', description: 'Roasted veggies, chickpeas, quinoa, tahini dressing', price: 280, isVeg: true },
          { name: 'Salmon Poke Bowl', description: 'Fresh salmon, edamame, avocado over brown rice', price: 380, isVeg: false },
          { name: 'Tofu Teriyaki Bowl', description: 'Grilled tofu, broccoli, sesame seeds, teriyaki sauce', price: 260, isVeg: true },
        ],
      },
      {
        name: 'Smoothies',
        items: [
          { name: 'Green Goddess', description: 'Spinach, banana, mango, coconut water', price: 140, isVeg: true },
          { name: 'Berry Blast', description: 'Mixed berries, yogurt, honey, chia seeds', price: 150, isVeg: true },
        ],
      },
      {
        name: 'Soups',
        items: [
          { name: 'Tomato Basil Soup', description: 'Classic roasted tomato soup with fresh basil', price: 140, isVeg: true },
          { name: 'Lentil Soup', description: 'Hearty red lentil soup with lemon and cumin', price: 120, isVeg: true },
        ],
      },
    ],
  },

  // ── Venue members ──────────────────────────────────────────────────────────
  // Mapped to a venue by `venueSlug`, the same way `cityName` maps to a City.
  // Deliberately lighter menus than the three above: these exist to populate
  // the venues, not to exercise the menu model.
  {
    name: "Nescafe Corner",
    username: "nescafecorner",
    password: "nescafe123",
    domain: "nescafecorner.food",
    address: "Main Gate, VIT University, Vellore, TN 632014",
    cityName: "Vellore",
    venueSlug: "vit-vellore",
    latitude: 12.9702,
    longitude: 79.1548,
    phone: "+91 94420 10001",
    paymentGateway: "PHONEPE",
    themeColor: "#b91c1c",
    coverUrl: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=70',
    cuisines: "Cafe · Beverages · Snacks",
    rating: 4.2,
    ratingCount: 310,
    waiters: ["Manoj R"],
    categories: [
      {
        name: "Hot Drinks",
        items: [
          { name: "Filter Coffee", description: "South Indian filter coffee, strong and sweet", price: 30, isVeg: true },
          { name: "Masala Chai", description: "Spiced milk tea", price: 25, isVeg: true },
        ],
      },
      {
        name: "Quick Bites",
        items: [
          { name: "Veg Puff", description: "Flaky pastry with spiced vegetable filling", price: 30, isVeg: true },
          { name: "Grilled Sandwich", description: "Cheese, tomato and capsicum, pressed hot", price: 70, isVeg: true },
        ],
      },
    ],
  },
  {
    name: "Darling Restaurant",
    username: "darlingrest",
    password: "darling123",
    domain: "darlingrest.food",
    address: "Gandhi Road, VIT Campus, Vellore, TN 632014",
    cityName: "Vellore",
    venueSlug: "vit-vellore",
    latitude: 12.9685,
    longitude: 79.1572,
    phone: "+91 94420 10002",
    paymentGateway: "PHONEPE",
    themeColor: "#ea580c",
    coverUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1200&q=70',
    cuisines: "South Indian · Chettinad",
    rating: 4.4,
    ratingCount: 820,
    waiters: ["Suresh K","Lakshmi V"],
    categories: [
      {
        name: "Tiffin",
        items: [
          { name: "Masala Dosa", description: "Crisp dosa with potato masala and chutney", price: 90, isVeg: true },
          { name: "Idli Sambar", description: "Two steamed idlis with sambar", price: 60, isVeg: true },
        ],
      },
      {
        name: "Meals",
        items: [
          { name: "Chettinad Chicken", description: "Pepper-heavy Chettinad style chicken curry", price: 260, isVeg: false },
          { name: "Veg Meals", description: "Rice, sambar, rasam, two poriyals and curd", price: 150, isVeg: true },
        ],
      },
    ],
  },
  {
    name: "Campus Food Court",
    username: "campusfc",
    password: "campus123",
    domain: "campusfc.food",
    address: "Block A Basement, VIT University, Vellore, TN 632014",
    cityName: "Vellore",
    venueSlug: "vit-vellore",
    latitude: 12.971,
    longitude: 79.1565,
    phone: "+91 94420 10003",
    paymentGateway: "COD",
    themeColor: "#0d9488",
    coverUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1200&q=70',
    cuisines: "Multi-cuisine · Fast Food",
    rating: 4,
    ratingCount: 1450,
    waiters: ["Deepak S"],
    categories: [
      {
        name: "Street Food",
        items: [
          { name: "Pav Bhaji", description: "Spiced vegetable mash with buttered pav", price: 120, isVeg: true },
          { name: "Pani Puri", description: "Six puris with spiced water", price: 60, isVeg: true },
        ],
      },
      {
        name: "Rolls",
        items: [
          { name: "Paneer Kathi Roll", description: "Paneer tikka rolled in a paratha", price: 130, isVeg: true },
          { name: "Chicken Kathi Roll", description: "Chicken tikka rolled in a paratha", price: 160, isVeg: false },
        ],
      },
    ],
  },
  {
    name: "Chatkara Express",
    username: "chatkara",
    password: "chatkara123",
    domain: "chatkara.food",
    address: "Hostel Block C, VIT University, Vellore, TN 632014",
    cityName: "Vellore",
    venueSlug: "vit-vellore",
    latitude: 12.9678,
    longitude: 79.1541,
    phone: "+91 94420 10004",
    paymentGateway: "COD",
    themeColor: "#7c3aed",
    coverUrl: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=1200&q=70',
    cuisines: "North Indian · Late Night",
    rating: 4.1,
    ratingCount: 640,
    waiters: ["Amit P"],
    categories: [
      {
        name: "Late Night",
        items: [
          { name: "Maggi Masala", description: "Two-minute noodles, campus style", price: 50, isVeg: true },
          { name: "Cheese Omelette", description: "Three-egg omelette with cheese", price: 80, isVeg: false },
        ],
      },
      {
        name: "Curries",
        items: [
          { name: "Rajma Chawal", description: "Kidney bean curry with steamed rice", price: 120, isVeg: true },
          { name: "Butter Paneer", description: "Paneer in tomato-cream gravy with rice", price: 180, isVeg: true },
        ],
      },
    ],
  },
  {
    name: "The Grill House",
    username: "grillhouse",
    password: "grill123",
    domain: "grillhouse.food",
    address: "Level 3 Food Court, City Square Mall, Kharadi, Pune, MH 411014",
    cityName: "Pune",
    venueSlug: "city-square",
    latitude: 18.5612,
    longitude: 73.9173,
    phone: "+91 98220 30001",
    paymentGateway: "PHONEPE",
    themeColor: "#dc2626",
    coverUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=1200&q=70',
    cuisines: "Grills · Kebabs · BBQ",
    rating: 4.5,
    ratingCount: 530,
    waiters: ["Vikram J","Neha D"],
    categories: [
      {
        name: "Grills",
        items: [
          { name: "Peri Peri Chicken", description: "Half chicken, peri peri rub, charcoal grilled", price: 340, isVeg: false },
          { name: "Grilled Paneer Skewers", description: "Paneer, peppers and onion, mint chutney", price: 240, isVeg: true },
        ],
      },
      {
        name: "Sides",
        items: [
          { name: "Peri Fries", description: "Fries tossed in peri peri seasoning", price: 120, isVeg: true },
          { name: "Garlic Bread", description: "Toasted with garlic butter and herbs", price: 100, isVeg: true },
        ],
      },
    ],
  },
  {
    name: "Wok and Roll",
    username: "wokandroll",
    password: "wok123",
    domain: "wokandroll.food",
    address: "Level 3 Food Court, City Square Mall, Kharadi, Pune, MH 411014",
    cityName: "Pune",
    venueSlug: "city-square",
    latitude: 18.5608,
    longitude: 73.9166,
    phone: "+91 98220 30002",
    paymentGateway: "PHONEPE",
    themeColor: "#16a34a",
    coverUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=70',
    cuisines: "Pan Asian · Chinese · Thai",
    rating: 4.2,
    ratingCount: 410,
    waiters: ["Tenzin L"],
    categories: [
      {
        name: "Noodles and Rice",
        items: [
          { name: "Hakka Noodles", description: "Wok-tossed noodles with vegetables", price: 190, isVeg: true },
          { name: "Burnt Garlic Fried Rice", description: "Fried rice with crisp burnt garlic", price: 180, isVeg: true },
        ],
      },
      {
        name: "Starters",
        items: [
          { name: "Chilli Paneer", description: "Paneer tossed in a sweet-hot chilli sauce", price: 220, isVeg: true },
          { name: "Chicken Momos", description: "Eight steamed momos with chilli chutney", price: 180, isVeg: false },
        ],
      },
    ],
  },
];

async function main() {
  console.log('Seeding database...');

  const cityIdByName = new Map();
  for (const c of cities) {
    const existingCity = await prisma.city.findFirst({ where: { name: c.name } });
    const city = existingCity ?? await prisma.city.create({ data: { name: c.name, state: c.state, isActive: true } });
    cityIdByName.set(c.name, city.id);
  }
  console.log(`Seeded ${cities.length} cities.`);

  // Venues before restaurants — a restaurant declares its venue by slug, the
  // same way it declares its city by name. Idempotent on slug; an existing
  // venue has its geometry refreshed so tweaking a radius here and re-running
  // actually takes effect.
  const venueIdBySlug = new Map();
  for (const v of venues) {
    const cityId = v.cityName ? cityIdByName.get(v.cityName) ?? null : null;
    const data = {
      name: v.name,
      type: v.type,
      description: v.description ?? null,
      address: v.address ?? null,
      coverUrl: v.coverUrl ?? null,
      latitude: v.latitude,
      longitude: v.longitude,
      detectRadiusM: v.detectRadiusM,
      membershipMode: v.membershipMode,
      // Null on a STRICT venue — the API clears it the same way, so a mode
      // flip can never leave a stale radius behind.
      includeRadiusM: v.membershipMode === 'INCLUSIVE' ? v.includeRadiusM : null,
      cityId,
      isActive: true,
    };
    const venue = await prisma.venue.upsert({
      where: { slug: v.slug },
      update: data,
      create: { ...data, slug: await freeSlug(v.slug, prisma.venue) },
    });
    venueIdBySlug.set(v.slug, venue.id);
  }
  console.log(`Seeded ${venues.length} places.`);

  const heroFields = (r) => ({
    coverUrl: r.coverUrl ?? null,
    cuisines: r.cuisines ?? null,
    rating: r.rating ?? null,
    ratingCount: r.ratingCount ?? null,
    // Backfilled, not just set on create — restaurants seeded before venues
    // existed have no coordinates, which excludes them from /nearby entirely.
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
  });

  // Needed after the loop to wire up venue membership, and populated on both
  // branches below so a re-run remaps restaurants that already existed.
  const restaurantIdByUsername = new Map();

  for (const r of restaurants) {
    const cityId = r.cityName ? cityIdByName.get(r.cityName) ?? null : null;
    const existing = await prisma.restaurant.findUnique({ where: { username: r.username } });
    if (existing) {
      // Backfill hero metadata + city on already-seeded restaurants.
      await prisma.restaurant.update({ where: { id: existing.id }, data: { ...heroFields(r), cityId } });
      restaurantIdByUsername.set(r.username, existing.id);
      console.log(`"${r.name}" already exists — refreshed hero fields.`);
      continue;
    }

    const hashedPassword = await bcrypt.hash(r.password, 10);
    const restaurant = await prisma.restaurant.create({
      data: {
        name: r.name,
        // Same derivation the API uses on create — seeded restaurants get the
        // same /<slug> vanity URL a real one would.
        slug: await freeSlug(slugify(r.name) || slugify(r.username)),
        username: r.username,
        password: hashedPassword,
        domain: r.domain,
        address: r.address,
        phone: r.phone || null,
        paymentGateway: r.paymentGateway,
        themeColor: r.themeColor,
        cityId,
        ...heroFields(r),
        isActive: true,
      },
    });

    restaurantIdByUsername.set(r.username, restaurant.id);

    for (const waiterName of r.waiters || []) {
      await prisma.waiter.create({
        data: { name: waiterName, restaurantId: restaurant.id, isActive: true },
      });
    }

    let totalItems = 0;
    for (const cat of r.categories) {
      const category = await prisma.category.create({
        data: { name: cat.name, restaurantId: restaurant.id, isActive: true },
      });

      for (const item of cat.items) {
        await prisma.menuItem.create({
          data: {
            name: item.name,
            description: item.description,
            price: item.price,
            isVeg: item.isVeg,
            available: true,
            isActive: true,
            restaurantId: restaurant.id,
            categoryId: category.id,
          },
        });
        totalItems++;
      }
    }

    console.log(`Created "${r.name}" (login: ${r.username} / ${r.password}) — ${r.categories.length} categories, ${totalItems} items, ${(r.waiters || []).length} waiters.`);
  }

  // Venue membership, after every restaurant exists. Upserted on the compound
  // unique so a re-run re-points rather than duplicating, and `position` follows
  // the order restaurants are declared in above.
  const positionByVenue = new Map();
  let mappings = 0;
  for (const r of restaurants) {
    if (!r.venueSlug) continue;
    const venueId = venueIdBySlug.get(r.venueSlug);
    const restaurantId = restaurantIdByUsername.get(r.username);
    if (!venueId || !restaurantId) continue;
    const position = positionByVenue.get(venueId) ?? 0;
    positionByVenue.set(venueId, position + 1);
    await prisma.venueRestaurant.upsert({
      where: { venueId_restaurantId: { venueId, restaurantId } },
      update: { position },
      create: { venueId, restaurantId, position },
    });
    mappings++;
  }
  console.log(`Mapped ${mappings} restaurants into places.`);

  console.log('\nSeed complete. Restaurants:');
  console.log('  spicegarden / spice123  — orange theme');
  console.log('  burgerbarn  / burger123 — red theme');
  console.log('  greenbowl   / green123  — green theme');
  console.log('\nPlaces:');
  console.log('  /at/vit-vellore  — STRICT, 4 mapped campus outlets');
  console.log('  /at/city-square  — INCLUSIVE, 2 mapped + Green Bowl pulled in from 1.6 km away');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
