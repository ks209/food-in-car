import express from 'express';
import prisma from '../../config/prisma.js';
import restaurantAuth from '../../middlewares/restaurant.auth.js';


const categoryRouter = express.Router();

categoryRouter.post('/create', restaurantAuth, async (req, res) => {
  try {
    const restaurantId = req.restaurantId;
    const category = await prisma.category.create({
      data: {
        name: req.body.name,
        menuItems: req.body.menuItems || undefined,
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

categoryRouter.get('/all', restaurantAuth, async (req, res) => {
  try {
    console.log("Fetching all categories for restaurantId:", req.body?.restaurantId);
    const categories = await prisma.category.findMany({
      where: { restaurantId: req.body?.restaurantId },
      select: {
        id: true,
        name: true
    }});

    res.status(200).json(categories);
  }

  catch (error) {
    res.status(500).json({ error: "Failed to fetch all categories", details: error.message });
  }
});

categoryRouter.get('/:id', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);     
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
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
    const categories = await prisma.category.findMany({
      where: { restaurantId: req.body?.restaurantId }
    });

    res.status(200).json(categories);
  }
    catch (error) {
    res.status(500).json({ error: "Failed to fetch categories", details: error.message });
    }
});



categoryRouter.put('/:id', restaurantAuth, async (req, res) => {
  try {
    const categoryId = parseInt(req.params.id);
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

categoryRouter.delete('/:id', restaurantAuth, async (req, res) => {
    try {   
        const categoryId = parseInt(req.params.id);
        const deletedCategory = await prisma.category.update({
            where: { id: categoryId },data:{isActive: false, updatedAt: new Date()}
        });
        res.status(200).json({ message: "Category deleted successfully", category: deletedCategory });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete category", details: error.message });
    }
});

categoryRouter.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const restaurantId = parseInt(req.params.restaurantId);
    const categories = await prisma.category.findMany({
      where: { restaurantId: restaurantId, isActive: 1 },
      include: {
        menuItems: true
      }
    });
    res.status(200).json(categories);
    } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories for restaurant", details: error.message });
    }
});

categoryRouter.get('/active', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            where: { isActive: 1 },
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
