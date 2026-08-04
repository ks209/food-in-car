import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
const menuRouter = express.Router();

menuRouter.post('/create', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    const maxPosition = await prisma.menuItem.aggregate({
      where: { restaurantId },
      _max: { position: true }
    });

    const menuItem = await prisma.menuItem.create({
      data: {
        name: req.body.name,
        description: req.body.description,
        price: parseFloat(req.body.price),
        available: req.body.available ?? true,
        imageUrl: req.body.imageUrl || null,
        position: (maxPosition._max.position ?? -1) + 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        restaurant: {
          connect: { id: restaurantId }
        },
        category: req.body.categoryId
          ? { connect: { id: req.body.categoryId } }
          : undefined,
        optionGroups: req.body.optionGroups
          ? {
              create: req.body.optionGroups.map(group => ({
                title: group.title,
                required: group.required,
                multiple: group.multiple,
                options: {
                  create: group.options.map(opt => ({
                    name: opt.name,
                    priceDelta: parseFloat(opt.priceDelta)
                  }))
                }
              }))
            }
          : undefined
      },
      include: {
        optionGroups: {
          include: {
            options: true
          }
        }
      }
    });

    res.status(201).json(menuItem);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add menu item', details: error.message });
  }
});


menuRouter.get('/', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    // Soft-deleted items (isActive: false, set by DELETE /:id below) must never
    // reach the dashboard's Menu page — they were showing up there as ghost "Off"
    // rows the restaurant had already deleted, which is exactly what made the
    // per-category "All on"/"All off" bulk toggle look broken: it correctly skips
    // deleted items (see /bulk-availability), but a still-listed "Off" row that
    // "All on" doesn't touch just reads as the button not working.
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId, isActive: true },
      include: {
        category: true,
        optionGroups: {
          include: { options: true }
        }
      },
      orderBy: [{ position: 'asc' }, { id: 'asc' }]
    });

    res.json(menuItems);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch menu items', details: error.message });
  }
});



menuRouter.get('/:id', async (req, res) => {
  try {
    const menuItem = await prisma.menuItem.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        category: true,
        optionGroups: {
          include: { options: true }
        }
      }
    });

    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json(menuItem);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch menu item', details: error.message });
  }
});

menuRouter.put('/:id', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const menuItemId = parseInt(req.params.id);
    const existing = await prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId }
    });
    if (!existing) {
      return res.status(403).json({ error: 'Not authorized to update this menu item' });
    }

    const updated = await prisma.menuItem.update({
      where: { id: menuItemId },
      data: {
        name: req.body.name,
        description: req.body.description,
        price: req.body.price !== undefined ? parseFloat(req.body.price) : undefined,
        available: req.body.available,
        imageUrl: req.body.imageUrl,
        isActive: req.body.isActive
      }
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update menu item', details: error.message });
  }
});

menuRouter.delete('/:id', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const menuItemId = parseInt(req.params.id);
    const existing = await prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId }
    });
    if (!existing) {
      return res.status(403).json({ error: 'Not authorized to delete this menu item' });
    }

    await prisma.menuItem.update({
      where: { id: menuItemId },data: { isActive: false, updatedAt: new Date() }
    });

    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete menu item', details: error.message });
  }
});

// Bulk-toggle every item in a category (or the Uncategorized group, categoryId: null)
menuRouter.patch('/bulk-availability', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const { categoryId, available } = req.body;
    if (typeof available !== 'boolean') {
      return res.status(400).json({ error: 'available (boolean) is required' });
    }

    const result = await prisma.menuItem.updateMany({
      where: {
        restaurantId,
        isActive: true,
        categoryId: categoryId === null || categoryId === undefined ? null : parseInt(categoryId)
      },
      data: { available, updatedAt: new Date() }
    });

    res.json({ message: 'Availability updated', count: result.count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update availability', details: error.message });
  }
});

menuRouter.patch('/reorder', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const items = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const uniqueIds = [...new Set(items.map(i => parseInt(i.id)))];
    const owned = await prisma.menuItem.findMany({
      where: { id: { in: uniqueIds }, restaurantId },
      select: { id: true }
    });
    if (owned.length !== uniqueIds.length) {
      return res.status(403).json({ error: 'Not authorized to reorder one or more of these menu items' });
    }

    await prisma.$transaction(
      items.map(i =>
        prisma.menuItem.update({
          where: { id: parseInt(i.id) },
          data: { position: parseInt(i.position) }
        })
      )
    );

    res.json({ message: 'Menu items reordered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder menu items', details: error.message });
  }
});

export default menuRouter;
