import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../../config/prisma.js';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import restaurantAuth from '../../middlewares/restaurant.auth.js';
import supportAuth from '../../middlewares/support.auth.js';

const restaurantRouter = express.Router();
restaurantRouter.use(cookieParser());

restaurantRouter.get('/me', restaurantAuth, async (req, res) => {
    try {
        const restaurant = await prisma.restaurant.findUnique({
            where: { id: req.restaurantId },
            select: { id: true, name: true, username: true, domain: true, address: true, phone: true, themeColor: true, logoUrl: true },
        });
        if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
        res.json(restaurant);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching restaurant', error: err });
    }
});

// Restaurant edits its OWN profile/branding from the dashboard settings page.
restaurantRouter.put('/me', restaurantAuth, async (req, res) => {
    const { name, phone, address, themeColor, logoUrl } = req.body;
    try {
        const data = {};
        if (name !== undefined) data.name = name || null;
        if (phone !== undefined) data.phone = phone || null;
        if (address !== undefined) data.address = address;
        if (themeColor !== undefined) data.themeColor = themeColor || '#f97316';
        if (logoUrl !== undefined) data.logoUrl = logoUrl || null;

        const updated = await prisma.restaurant.update({
            where: { id: req.restaurantId },
            data,
            select: { id: true, name: true, username: true, domain: true, address: true, phone: true, themeColor: true, logoUrl: true },
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error updating restaurant', error: err });
    }
});

restaurantRouter.get('/all', supportAuth, async (req, res) => {
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


restaurantRouter.post('/create', supportAuth, async (req, res) => {
    const {
        name,
        domain,
        username,
        password,
        paymentGateway,
        address,
        phone,
        themeColor,
        logoUrl,
    } = req.body;

    console.log(req.body);

    if (!domain || !username || !password || !address) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const restaurant = await prisma.restaurant.create({
            data: {
                name: name || null,
                domain,
                username,
                password: hashedPassword,
                paymentGateway,
                address,
                phone: phone || null,
                themeColor: themeColor || '#f97316',
                logoUrl: logoUrl || null,
                isActive: true,
            },
        });

        res.status(201).json(restaurant);
    } catch (err) {
        console.error('Error creating restaurant:', err);
        res.status(500).json({ message: 'Error creating restaurant', error: err });
    }
});


restaurantRouter.put('/update/:id', supportAuth, async (req, res) => {
    const id = Number(req.params.id);
    const { name, domain, username, paymentGateway, address, phone, themeColor, logoUrl } = req.body;

    try {
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing || !existing.isActive) {
            return res.status(404).json({ message: 'Restaurant not found' });
        }

        const updated = await prisma.restaurant.update({
            where: { id },
            data: { name, domain, username, paymentGateway, address, phone, themeColor, logoUrl },
        });

        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error updating restaurant', error: err });
    }
});


restaurantRouter.put('/activate/:id', supportAuth, async (req, res) => {
    const id = Number(req.params.id);
    try {
        const existing = await prisma.restaurant.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ message: 'Restaurant not found' });

        const updated = await prisma.restaurant.update({
            where: { id },
            data: { isActive: true },
        });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ message: 'Error reactivating restaurant', error: err });
    }
});

restaurantRouter.delete('/delete/:id', supportAuth, async (req, res) => {
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

restaurantRouter.post('/login',async(req,res)=>{
    const {username,password}=req.body;
    const existing = await prisma.restaurant.findUnique({where:{username:username}})
    
    
    if(await bcrypt.compare(password,existing.password)){
        const accessToken=jwt.sign({ id: existing.id }, process.env.JWT_SECRET || "s3cret", { expiresIn: '24h' });
        const refreshToken=jwt.sign({ id: existing.id }, process.env.JWT_SECRET || "s3cret", { expiresIn:'7d' });
        prisma.restaurant.update({
            where: { id: existing.id },
            data: {
                refreshToken: refreshToken,
            },
        })
        res.cookie("token", accessToken, {
        httpOnly: true,
        secure: false,       // change to true in production with HTTPS
        sameSite: "lax",     // or "strict" if you want tighter CSRF protection
        maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
        res.json({code:200,message:"loggedIn"});
    }else{
        res.json({code:401, message:"Wrong Credentials"})
    }

})

restaurantRouter.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

export default restaurantRouter;