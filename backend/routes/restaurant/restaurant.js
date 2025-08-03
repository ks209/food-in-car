import express from 'express';
const restaurantRouter = express.Router();

restaurantRouter.get('/all', async (req, res) => {
    try {
        const restaurants = await prisma.restaurant.findMany({
            where: { isActive: true },
            include: {
                menu: true,
                orders: true,
                category: true,
            },
        });
        res.json(restaurants);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurants', error: err });
    }
});

restaurantRouter.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const restaurant = await prisma.restaurant.findUnique({
            where: { id },
            include: {
                menu: true,
                orders: true,
                category: true,
            },
        });

        if (!restaurant || !restaurant.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        res.json(restaurant);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurant', error: err });
    }
});


restaurantRouter.post('/create', async (req, res) => {
    const {
        domain,
        username,
        password,
        paymentGateway,
        address,
    } = req.body;

    if (!domain || !username || !password || !paymentGateway || !address) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const restaurant = await prisma.restaurant.create({
            data: {
                domain,
                username,
                password: hashedPassword,
                paymentGateway,
                address,
                isActive: true,
            },
        });

        res.status(201).json(restaurant);
    } catch (err) {
        res.status(500).json({ message: 'Error creating restaurant', error: err });
    }
});


restaurantRouter.put('/update/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { domain, username, password, paymentGateway, address } = req.body;

    try {
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing || !existing.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const updateData = {
            domain,
            username,
            paymentGateway,
            address,
        };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updated = await prisma.restaurant.update({
            where: { id },
            data: updateData,
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error updating restaurant', error: err });
    }
});


restaurantRouter.delete('/delete/:id', async (req, res) => {
    const id = Number(req.params.id);

    try {
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing || !existing.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        await prisma.restaurant.update({
            where: { id },
            data: {
                isActive: false,
            },
        });

        res.json({ message: 'Restaurant deactivated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deactivating restaurant', error: err });
    }
});

export default restaurantRouter;