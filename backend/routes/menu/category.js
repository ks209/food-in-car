import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import { resolveRestaurantId } from '../../utils/slug.js';


const categoryRouter = express.Router();

// Categories are shown in `position` order everywhere a menu is rendered;
// ties (and rows predating the column) fall back to id so the order is at
// least stable. Kept in one place so no read forgets it.
const CATEGORY_ORDER = [{ position: 'asc' }, { id: 'asc' }];

categoryRouter.post('/create', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    // New categories land at the end of this restaurant's list rather than
    // jumping to the front on the shared default of 0.
    const maxPosition = await prisma.category.aggregate({
      where: { restaurantId },
      _max: { position: true }
    });
    const category = await prisma.category.create({
      data: {
        name: req.body.name,
        menuItems: req.body.menuItems || undefined,
        position: (maxPosition._max.position ?? -1) + 1,
        isActive: true,
        restaurant: {
          connect: { id: restaurantId }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: "Failed to add category", details: error.message });
  }
});

// Drag-to-reorder from the dashboard. Mirrors PATCH /api/menu/reorder: the
// client sends the categories in their new order and every position is
// rewritten in one transaction, so a partial save can't leave a mixed order.
// Declared above PUT/DELETE '/:id' for readability — PATCH can't collide with
// them anyway.
categoryRouter.patch('/reorder', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const categories = req.body.categories;
    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'categories array is required' });
    }

    const uniqueIds = [...new Set(categories.map(c => parseInt(c.id)))];
    if (uniqueIds.some(id => !Number.isInteger(id))) {
      return res.status(400).json({ error: 'Every category needs a numeric id' });
    }

    // Ownership check before any write — otherwise one tenant could reposition
    // another's categories by guessing ids.
    const owned = await prisma.category.findMany({
      where: { id: { in: uniqueIds }, restaurantId },
      select: { id: true }
    });
    if (owned.length !== uniqueIds.length) {
      return res.status(403).json({ error: 'Not authorized to reorder one or more of these categories' });
    }

    await prisma.$transaction(
      categories.map((c, idx) =>
        prisma.category.update({
          where: { id: parseInt(c.id) },
          data: { position: Number.isInteger(parseInt(c.position)) ? parseInt(c.position) : idx }
        })
      )
    );

    res.json({ message: 'Categories reordered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reorder categories', details: error.message });
  }
});

categoryRouter.get('/all', restaurantAuth, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { restaurantId: req.restaurantId, isActive: true },
      select: { id: true, name: true, position: true },
      orderBy: CATEGORY_ORDER
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch all categories", details: error.message });
  }
});

// Restaurant-scoped: this used to be public, so any id returned another
// tenant's category and its whole item list. The customer app doesn't use it —
// it reads GET /restaurant/:idOrSlug below.
categoryRouter.get('/:id', restaurantAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    const category = await prisma.category.findFirst({
      where: { id: categoryId, restaurantId: req.restaurantId },
      include: {
        menuItems: true
      }
    });
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.status(200).json(category);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch category", details: error.message });
  }
});

categoryRouter.get('/', restaurantAuth, async (req, res) => {
  try {
    // isActive only: a deleted category must not come back on the next load —
    // that's what made "delete" look like it did nothing in the dashboard.
    // ?includeDeleted=true also returns removed ones (each carries isActive),
    // so the dashboard can offer to restore them — with their items.
    const includeDeleted = req.query.includeDeleted === 'true';
    const categories = await prisma.category.findMany({
      where: { restaurantId: req.restaurantId, ...(includeDeleted ? {} : { isActive: true }) },
      include: { menuItems: { where: { isActive: true } } },
      orderBy: CATEGORY_ORDER
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories", details: error.message });
  }
});



categoryRouter.put('/:id', restaurantAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
    if (!Number.isInteger(categoryId)) return res.status(400).json({ error: 'Invalid category id' });

    // Same tenant check as DELETE below.
    const existing = await prisma.category.findFirst({
      where: { id: categoryId, restaurantId: req.restaurantId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: req.body.name,
        isActive: req.body.isActive,
        updatedAt: new Date()
        }
    });

    res.status(200).json(updatedCategory);
  }
    catch (error) {
    res.status(500).json({ error: "Failed to update category", details: error.message });
    }
});

// Deleting a category, in order of preference:
//
//   1. ?moveItemsTo=<id> — its items are re-filed under another category, then
//      the category itself is deleted outright. Nothing is hidden.
//   2. No items on the menu under it — deleted outright.
//   3. Still has items and no destination — the category AND its items are
//      hidden together (isActive: false, items keep pointing at it), and the
//      dashboard offers to restore them. Items are never dumped into an
//      "Uncategorized" bucket: that isn't a real category in this product.
//
// Rows are only kept when they still hold items, so the "removed categories"
// list stays short instead of collecting every category ever deleted.
categoryRouter.delete('/:id', restaurantAuth, async (req, res) => {
    try {
        const categoryId = parseInt(req.params.id);
        if (!Number.isInteger(categoryId)) return res.status(400).json({ error: 'Invalid category id' });

        // Scoped to the caller's restaurant — without this, any signed-in
        // restaurant could delete another tenant's category by guessing an id.
        const existing = await prisma.category.findFirst({
            where: { id: categoryId, restaurantId: req.restaurantId },
            select: { id: true },
        });
        if (!existing) return res.status(404).json({ error: 'Category not found' });

        // ?moveItemsTo=<id> re-files this category's items first, so the
        // category itself can then be removed outright.
        const moveItemsTo = req.query.moveItemsTo ? parseInt(req.query.moveItemsTo) : null;
        if (moveItemsTo !== null) {
            if (!Number.isInteger(moveItemsTo) || moveItemsTo === categoryId) {
                return res.status(400).json({ error: 'Invalid destination category' });
            }
            const target = await prisma.category.findFirst({
                where: { id: moveItemsTo, restaurantId: req.restaurantId, isActive: true },
                select: { id: true },
            });
            if (!target) return res.status(400).json({ error: 'Destination category not found' });
            await prisma.menuItem.updateMany({
                where: { categoryId, restaurantId: req.restaurantId },
                data: { categoryId: moveItemsTo },
            });
        }

        // Nothing left on the menu under it → delete for real rather than
        // leaving a hidden row to clutter the "removed" list forever. Only
        // live items count: already-deleted ones are detached first, since
        // they're invisible anyway and would otherwise block the delete.
        const liveItems = await prisma.menuItem.count({ where: { categoryId, isActive: true } });
        if (liveItems === 0) {
            await prisma.$transaction([
                prisma.menuItem.updateMany({ where: { categoryId }, data: { categoryId: null } }),
                prisma.category.delete({ where: { id: categoryId } }),
            ]);
            return res.status(200).json({ message: 'Category deleted', outcome: 'deleted', movedItems: moveItemsTo ? true : false });
        }

        // Still has items and no destination was given: hide both, restorable.
        const deletedCategory = await prisma.category.update({
            where: { id: categoryId },
            data: { isActive: false, updatedAt: new Date() },
        });

        res.status(200).json({ message: 'Category hidden with its items', outcome: 'hidden', hiddenItems: liveItems, category: deletedCategory });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete category", details: error.message });
    }
});

// Accepts the numeric id or the slug, matching GET /api/restaurant/:idOrSlug —
// the ordering app loads the restaurant and its categories in parallel off the
// same URL segment, so both have to understand both forms.
categoryRouter.get('/restaurant/:idOrSlug', async (req, res) => {
  try {
    const restaurantId = await resolveRestaurantId(req.params.idOrSlug);
    if (restaurantId === null) return res.status(404).json({ error: 'Restaurant not found' });

    const categories = await prisma.category.findMany({
      where: { restaurantId: restaurantId, isActive: true },
      include: {
        menuItems: {
          where: { isActive: true, available: true },
          include: {
            optionGroups: {
              include: { options: true }
            }
          },
          // Same order the dashboard's drag-to-reorder writes (MenuItem.position).
          orderBy: [{ position: 'asc' }, { id: 'asc' }]
        }
      },
      orderBy: CATEGORY_ORDER
    });
    res.status(200).json(categories);
    } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories for restaurant", details: error.message });
    }
});

categoryRouter.get('/active', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: true },
            include: {
                restaurant: {
                select: {
                    id: true,
                    name: true
                }
            },
                menuItems: true
            }
        });
        res.status(200).json(categories);
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch active categories", details: error.message });
    }
});



export default categoryRouter;
