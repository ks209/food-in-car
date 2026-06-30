import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.js';
import userAuth from '../../middlewares/user.auth.js';

const userRouter = express.Router();

userRouter.post('/register', async (req, res) => {
  const { customerName, phoneNumber, username, password, vehicleNo } = req.body;
  if (!customerName || !phoneNumber || !username || !password) {
    return res.status(400).json({ message: 'Name, phone number, username and password are required' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // A guest account may already exist for this phone (auto-created on first order).
    // Upgrade it in place so the new account inherits the prior orders/payments.
    const existing = await prisma.user.findFirst({ where: { phoneNumber } });
    if (existing?.password) {
      return res.status(400).json({ message: 'Phone number already registered' });
    }

    const data = { customerName, phoneNumber, username, password: hashedPassword, isActive: true };
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data })
      : await prisma.user.create({ data });

    // Save the vehicle to the user's list (deduped)
    if (vehicleNo?.trim()) {
      const v = vehicleNo.trim().toUpperCase();
      await prisma.userVehicle.upsert({
        where: { userId_vehicleNo: { userId: user.id, vehicleNo: v } },
        update: {},
        create: { userId: user.id, vehicleNo: v },
      });
    }

    res.status(201).json({ id: user.id, customerName: user.customerName, phoneNumber: user.phoneNumber });
  } catch (err) {
    res.status(500).json({ message: 'Error registering user', error: err.message });
  }
});

userRouter.post('/login', async (req, res) => {
  const { phoneNumber, password } = req.body;
  if (!phoneNumber || !password) return res.status(400).json({ message: 'Missing fields' });

  try {
    const user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: { vehicles: { orderBy: { lastUsedAt: 'desc' } } },
    });
    if (!user || !user.isActive || !user.password) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Wrong credentials' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 's3cret', { expiresIn: '7d' });

    res.cookie('userToken', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      code: 200,
      message: 'Logged in',
      user: {
        id: user.id,
        customerName: user.customerName,
        phoneNumber: user.phoneNumber,
        vehicles: user.vehicles.map(v => v.vehicleNo),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Error logging in', error: err.message });
  }
});

userRouter.post('/logout', (req, res) => {
  res.clearCookie('userToken');
  res.json({ message: 'Logged out' });
});

userRouter.get('/me', userAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, customerName: true, phoneNumber: true, username: true,
        vehicles: { select: { vehicleNo: true }, orderBy: { lastUsedAt: 'desc' } },
      },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ ...user, vehicles: user.vehicles.map(v => v.vehicleNo) });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user', error: err.message });
  }
});

export default userRouter;
