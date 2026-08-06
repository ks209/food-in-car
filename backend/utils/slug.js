// A restaurant's public, URL-safe identifier. The ordering app serves the same
// restaurant at /restaurant/<id> and at /<slug>, so this is what QR codes and
// shared links point at.
//
// The generation rules mirror the backfill in
// prisma/migrations/20260806120000_restaurant_slug, with one deliberate
// difference: slugify() folds accents ("Café" -> "cafe"), which the migration's
// plain SQL can't do without the unaccent extension. That only affects
// already-existing rows, whose backfilled slug is a starting point anyone can
// edit in Settings — new and edited slugs all come through here.

import prisma from '../config/prisma.js';

export const SLUG_MIN = 2;
export const SLUG_MAX = 50;
export const SLUG_RULES = `Use ${SLUG_MIN}–${SLUG_MAX} lowercase letters, numbers and hyphens, e.g. spice-garden`;

// Root paths the ordering app owns (or is likely to), plus the sibling segments
// of GET /api/restaurant/* that are matched before the :idOrSlug route. A
// restaurant slugged 'nearby' could never be reached, so it's never handed out.
const RESERVED_SLUGS = new Set([
  'me', 'all', 'nearby', 'create', 'update', 'activate', 'delete', 'login', 'logout',
  'restaurant', 'restaurants', 'api', 'admin', 'dashboard', 'scan', 'orders', 'order',
  'cart', 'checkout', 'payment', 'assets', 'static', 'public', 'health', 'support',
  'settings', 'about', 'menu', 'category', 'user', 'waiter', 'city', 'config',
]);

export function slugify(text) {
  if (text === null || text === undefined) return null;
  const slug = String(text)
    // Decompose accented characters and drop the combining marks, so "Café
    // Déjà" becomes "cafe-deja" rather than losing the letters entirely.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

// Returns { ok: true, slug } or { ok: false, message }. `null` is a valid value
// — it means "no vanity URL", and the restaurant stays reachable on /restaurant/<id>.
export function validateSlug(input) {
  if (input === null || input === undefined || String(input).trim() === '') {
    return { ok: true, slug: null };
  }
  const slug = String(input).trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < SLUG_MIN || slug.length > SLUG_MAX) {
    return { ok: false, message: SLUG_RULES };
  }
  // An all-digits slug would be unreachable: resolveRestaurantId reads a
  // numeric path segment as an id before it ever looks up a slug.
  if (/^\d+$/.test(slug)) {
    return { ok: false, message: 'A web address cannot be only numbers — add a word, e.g. cafe-24' };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, message: `"${slug}" is reserved — please choose another web address` };
  }
  return { ok: true, slug };
}

// First free slug at or after `base`, ignoring the row being updated. Used for
// slugs the system derives itself (on create); a slug the user typed is
// reported back as taken instead of being silently renamed.
export async function uniqueSlug(base, excludeId = null) {
  let candidate = base;
  let n = 1;
  // Bounded only by the number of restaurants sharing a name, which is tiny.
  for (;;) {
    const existing = await prisma.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export async function isSlugTaken(slug, excludeId = null) {
  if (!slug) return false;
  const existing = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  return !!existing && existing.id !== excludeId;
}

// Public routes accept the numeric id or the slug in the same path segment.
// An all-digits segment is always an id (validateSlug rejects numeric slugs),
// so the two forms can never be confused for one another.
// Returns the restaurant's numeric id, or null when nothing matches.
export async function resolveRestaurantId(param) {
  if (param === undefined || param === null) return null;
  const raw = String(param).trim();

  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  // Normalised so a shared link that picked up odd casing or spacing
  // ("Spice%20Garden") still lands on the right restaurant.
  const slug = slugify(raw);
  if (!slug) return null;
  const row = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  return row?.id ?? null;
}

// The customer-facing URL for a restaurant — the vanity form when it has a
// slug, the numeric form otherwise.
export function orderingUrlFor(restaurant, frontendUrl) {
  return restaurant.slug
    ? `${frontendUrl}/${restaurant.slug}`
    : `${frontendUrl}/restaurant/${restaurant.id}`;
}
