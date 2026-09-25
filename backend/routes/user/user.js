import express from 'express';
import { sessionCookie, clearCookieOptions, SESSION_MAX_AGE } from '../../config/cookies.js';
import { JWT_SECRET } from '../../config/secrets.js';
// import bcrypt from 'bcryptjs'; // only used by the disabled password routes below
import jwt from 'jsonwebtoken';
import prisma from '../../config/prisma.js';
import userAuth from '../../middlewares/user.auth.js';
import { firebaseAuth } from '../../config/firebase.js';
import loginLimiter from '../../middlewares/loginLimiter.js';

const userRouter = express.Router();

/*
 * DISABLED — password register/login, replaced by phone OTP (/firebase-login).
 * /register let anyone attach a password to a guest account (auto-created at
 * checkout) knowing only the phone number — no OTP — and then read that
 * customer's order history. Existing password users sign in with OTP instead;
 * they're matched by phone number. Kept for reference; don't re-enable
 * without phone verification.

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

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('userToken', token, sessionCookie({ maxAge: SESSION_MAX_AGE.week }));

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
*/

// Phone-OTP sign-in. The client does the OTP with Firebase, then sends the
// resulting ID token here; we trust the phone number inside it and issue our
// own userToken cookie. First-time users get { needsProfile: true } until they
// resend with customerName (and optionally vehicleNo).
userRouter.post('/firebase-login', loginLimiter, async (req, res) => {
  const { idToken, customerName, vehicleNo } = req.body;
  if (!idToken) return res.status(400).json({ message: 'Missing idToken' });
  if (!firebaseAuth) return res.status(500).json({ message: 'Phone login is not configured' });

  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired verification' });
  }
  if (!decoded.phone_number) return res.status(400).json({ message: 'No phone number on this account' });

  // Firebase gives E.164 (+91XXXXXXXXXX); we store the bare 10-digit number.
  const phoneNumber = decoded.phone_number.replace(/\D/g, '').slice(-10);

  try {
    let user = await prisma.user.findUnique({ where: { phoneNumber } });
    if (user && !user.isActive) return res.status(403).json({ message: 'Account disabled' });

    if (!user) {
      if (!customerName?.trim()) return res.json({ needsProfile: true, phoneNumber });
      user = await prisma.user.create({ data: { customerName: customerName.trim(), phoneNumber } });
    }

    if (vehicleNo?.trim()) {
      const v = vehicleNo.trim().toUpperCase();
      await prisma.userVehicle.upsert({
        where: { userId_vehicleNo: { userId: user.id, vehicleNo: v } },
        update: {},
        create: { userId: user.id, vehicleNo: v },
      });
    }

    const vehicles = await prisma.userVehicle.findMany({
      where: { userId: user.id }, orderBy: { lastUsedAt: 'desc' }, select: { vehicleNo: true },
    });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('userToken', token, sessionCookie({ maxAge: SESSION_MAX_AGE.week }));

    res.json({
      code: 200,
      message: 'Logged in',
      user: {
        id: user.id,
        customerName: user.customerName,
        phoneNumber: user.phoneNumber,
        vehicles: vehicles.map(v => v.vehicleNo),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Error logging in', error: err.message });
  }
});

userRouter.post('/logout', (req, res) => {
  res.clearCookie('userToken', clearCookieOptions);
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

// Edit profile: name + saved vehicles. `vehicles` is the full desired list —
// ones missing from it are removed (orders keep their own vehicleNo copy).
userRouter.put('/me', userAuth, async (req, res) => {
  const { customerName, vehicles } = req.body;
  if (!customerName?.trim()) return res.status(400).json({ message: 'Name is required' });
  if (vehicles !== undefined && !Array.isArray(vehicles)) {
    return res.status(400).json({ message: 'vehicles must be a list' });
  }

  try {
    await prisma.user.update({ where: { id: req.userId }, data: { customerName: customerName.trim() } });

    if (vehicles) {
      const wanted = [...new Set(vehicles.map(v => String(v).trim().toUpperCase()).filter(Boolean))];
      await prisma.$transaction([
        prisma.userVehicle.deleteMany({ where: { userId: req.userId, vehicleNo: { notIn: wanted } } }),
        ...wanted.map(vehicleNo => prisma.userVehicle.upsert({
          where: { userId_vehicleNo: { userId: req.userId, vehicleNo } },
          update: {},
          create: { userId: req.userId, vehicleNo },
        })),
      ]);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true, customerName: true, phoneNumber: true, username: true,
        vehicles: { select: { vehicleNo: true }, orderBy: { lastUsedAt: 'desc' } },
      },
    });
    res.json({ ...user, vehicles: user.vehicles.map(v => v.vehicleNo) });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile', error: err.message });
  }
});

export default userRouter;
