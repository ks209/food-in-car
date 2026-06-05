import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
const menuRouter = express.Router();

menuRouter.post('/create', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;

    const menuItem = await prisma.menuItem.create({
      data: {
        name: req.body.name,
        description: req.body.description,
        price: parseFloat(req.body.price),
        available: req.body.available ?? true,
        imageUrl: req.body.imageUrl || null,
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

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      include: {
        category: true,
        optionGroups: {
          include: { options: true }
        }
      }
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

export default menuRouter;
