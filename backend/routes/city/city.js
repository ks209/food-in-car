import express from 'express';
import prisma from '../../config/prisma.js';

const cityRouter = express.Router();

// Public — powers both the mobile app's city-picker fallback and the admin
// panel's restaurant-form dropdown. No CRUD here yet; rows come from
// prisma/seed.js (see backend/prisma/seed.js `cities`).
cityRouter.get('/', async (req, res) => {
    try {
        const cities = await prisma.city.findMany({
            where: { isActive: true },
            select: { id: true, name: true, state: true },
            orderBy: { name: 'asc' },
        });
        res.json(cities);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching cities', error: err.message });
    }
});

export default cityRouter;
