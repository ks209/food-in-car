import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';

const restaurantAuth = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(403).json({ error: "No token provided" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || "s3cret");
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }

  // Login refuses deactivated restaurants, but a token issued before the
  // deactivation stays valid for up to 24h — so the dashboard is cut off on
  // every request, not just at sign-in.
  try {
    const restaurant = await prisma.restaurant.findUnique({ where: { id: decoded.id }, select: { isActive: true } });
    if (!restaurant) return res.status(403).json({ error: "Invalid token" });
    if (!restaurant.isActive) {
      return res.status(403).json({ error: "This restaurant has been deactivated. Contact support.", deactivated: true });
    }
  } catch (err) {
    return res.status(500).json({ error: "Failed to verify restaurant" });
  }

  req.restaurantId = decoded.id;
  next();
};

export default restaurantAuth;
