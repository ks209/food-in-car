import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';

const parkingRouter = express.Router();

const NAME_MAX = 60;

const SPOT_SELECT = { id: true, name: true, position: true };

function cleanName(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
}

// A restaurant's active spots in display order, plus whether picking one is
// required. Shared by the dashboard and checkout validation so both agree on
// what "the restaurant's spots" means.
export async function parkingConfigFor(restaurantId) {
  const [restaurant, spots] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { parkingSpotRequired: true } }),
    prisma.parkingSpot.findMany({
      where: { restaurantId, isActive: true },
      select: SPOT_SELECT,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return { required: restaurant?.parkingSpotRequired ?? true, spots };
}

// Resolves the parking spot for a customer order. Pickup orders (no vehicle)
// never carry one. For in-car delivery the spot must be one of the
// restaurant's active spots, and is mandatory when the restaurant has spots
// AND has "required" switched on. Returns the spot NAME to store on the order.
export async function resolveOrderParkingSpot(restaurantId, { isDelivery, parkingSpotId }) {
  if (!isDelivery) return { ok: true, name: null };

  const { required, spots } = await parkingConfigFor(restaurantId);
  const hasId = parkingSpotId !== undefined && parkingSpotId !== null && parkingSpotId !== '';

  if (!hasId) {
    if (required && spots.length > 0) return { ok: false, error: 'Please select where your car is parked' };
    return { ok: true, name: null };
  }

  const spot = spots.find((s) => s.id === Number(parkingSpotId));
  if (!spot) return { ok: false, error: 'That parking spot is no longer available — please pick another' };
  return { ok: true, name: spot.name };
}

// ── Dashboard (restaurant) ────────────────────────────────────────────────────

parkingRouter.get('/', restaurantAuth, async (req, res) => {
  try {
    res.json(await parkingConfigFor(req.restaurantId));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch parking spots', details: error.message });
  }
});

parkingRouter.post('/', restaurantAuth, async (req, res) => {
  try {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Name must be at most ${NAME_MAX} characters` });

    const duplicate = await prisma.parkingSpot.findFirst({
      where: { restaurantId: req.restaurantId, isActive: true, name: { equals: name, mode: 'insensitive' } },
    });
    if (duplicate) return res.status(409).json({ error: `"${name}" already exists` });

    const last = await prisma.parkingSpot.findFirst({
      where: { restaurantId: req.restaurantId, isActive: true },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const spot = await prisma.parkingSpot.create({
      data: { restaurantId: req.restaurantId, name, position: (last?.position ?? -1) + 1 },
      select: SPOT_SELECT,
    });
    res.status(201).json(spot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create parking spot', details: error.message });
  }
});

// "Required" toggle — declared before /:id so "settings" isn't read as an id.
parkingRouter.put('/settings', restaurantAuth, async (req, res) => {
  try {
    if (typeof req.body.required !== 'boolean') return res.status(400).json({ error: 'required must be true or false' });
    await prisma.restaurant.update({
      where: { id: req.restaurantId },
      data: { parkingSpotRequired: req.body.required },
    });
    res.json(await parkingConfigFor(req.restaurantId));
  } catch (error) {
    res.status(500).json({ error: 'Failed to update parking settings', details: error.message });
  }
});

// Body: { ids: [3, 1, 2] } — the full new order of the restaurant's active spots.
parkingRouter.put('/reorder', restaurantAuth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : null;
    if (!ids || ids.some((id) => !Number.isInteger(id))) return res.status(400).json({ error: 'ids must be a list of spot ids' });

    const owned = await prisma.parkingSpot.findMany({
      where: { restaurantId: req.restaurantId, isActive: true, id: { in: ids } },
      select: { id: true },
    });
    if (owned.length !== ids.length) return res.status(400).json({ error: 'Unknown parking spot in list' });

    await prisma.$transaction(ids.map((id, position) => prisma.parkingSpot.update({ where: { id }, data: { position } })));
    res.json(await parkingConfigFor(req.restaurantId));
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder parking spots', details: error.message });
  }
});

parkingRouter.put('/:id', restaurantAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.parkingSpot.findFirst({ where: { id, restaurantId: req.restaurantId, isActive: true } });
    if (!existing) return res.status(404).json({ error: 'Parking spot not found' });

    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (name.length > NAME_MAX) return res.status(400).json({ error: `Name must be at most ${NAME_MAX} characters` });

    const duplicate = await prisma.parkingSpot.findFirst({
      where: { restaurantId: req.restaurantId, isActive: true, id: { not: id }, name: { equals: name, mode: 'insensitive' } },
    });
    if (duplicate) return res.status(409).json({ error: `"${name}" already exists` });

    const spot = await prisma.parkingSpot.update({ where: { id }, data: { name }, select: SPOT_SELECT });
    res.json(spot);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update parking spot', details: error.message });
  }
});

// Soft delete — orders already placed keep their own copy of the spot name.
parkingRouter.delete('/:id', restaurantAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await prisma.parkingSpot.findFirst({ where: { id, restaurantId: req.restaurantId, isActive: true } });
    if (!existing) return res.status(404).json({ error: 'Parking spot not found' });

    await prisma.parkingSpot.update({ where: { id }, data: { isActive: false } });
    res.json({ message: 'Parking spot removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove parking spot', details: error.message });
  }
});

// The admin portal reads spots through GET /api/restaurant/all (read-only).

export default parkingRouter;
