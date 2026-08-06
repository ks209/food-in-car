import { PrismaClient } from '../generated/prisma/index.js';
import bcrypt from 'bcryptjs';
// Only the pure helper — utils/slug.js's DB-backed functions import the shared
// client from config/prisma.js, and the seed deliberately runs its own.
import { slugify } from '../utils/slug.js';

const prisma = new PrismaClient();

// First free slug at or after `base`, using the seed's own client.
async function freeSlug(base) {
  let candidate = base;
  let n = 1;
  while (await prisma.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } })) {
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
];

const restaurants = [
  {
    name: 'Spice Garden',
    username: 'spicegarden',
    password: 'spice123',
    domain: 'spicegarden.food',
    address: '12 Curry Lane, Mumbai, MH 400001',
    cityName: 'Mumbai',
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

  const heroFields = (r) => ({
    coverUrl: r.coverUrl ?? null,
    cuisines: r.cuisines ?? null,
    rating: r.rating ?? null,
    ratingCount: r.ratingCount ?? null,
  });

  for (const r of restaurants) {
    const cityId = r.cityName ? cityIdByName.get(r.cityName) ?? null : null;
    const existing = await prisma.restaurant.findUnique({ where: { username: r.username } });
    if (existing) {
      // Backfill hero metadata + city on already-seeded restaurants.
      await prisma.restaurant.update({ where: { id: existing.id }, data: { ...heroFields(r), cityId } });
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

  console.log('\nSeed complete. Restaurants:');
  console.log('  spicegarden / spice123  — orange theme');
  console.log('  burgerbarn  / burger123 — red theme');
  console.log('  greenbowl   / green123  — green theme');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
