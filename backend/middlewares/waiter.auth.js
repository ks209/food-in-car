import prisma from '../config/prisma.js';
import { verifyWaiterToken } from '../utils/waiterToken.js';

export function waiterTokenFrom(req) {
  return req.query?.token ||
    req.headers['x-waiter-token'] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
}

// A waiter token is a signed 1-day link, so on its own it keeps working after
// the restaurant deletes or deactivates that waiter — or after the restaurant
// itself is deactivated. Checked on every request so revoking takes effect now.
// Returns an error message, or null when the waiter may proceed.
export async function waiterAccessError(decoded) {
  const waiter = await prisma.waiter.findUnique({
    where: { id: decoded.waiterId },
    select: { restaurantId: true, isActive: true, deletedAt: true, restaurant: { select: { isActive: true } } },
  });
  if (!waiter || waiter.restaurantId !== decoded.restaurantId || waiter.deletedAt) return 'This scan link is no longer valid — ask the restaurant for a new one';
  if (!waiter.isActive) return 'Your waiter account is inactive — ask the restaurant to re-activate it';
  if (!waiter.restaurant.isActive) return 'This restaurant has been deactivated';
  return null;
}

// Waiter-app routes: only a waiter token is accepted (never the restaurant
// cookie), so req.waiterId is always set.
const waiterAuth = async (req, res, next) => {
  const token = waiterTokenFrom(req);
  if (!token) return res.status(403).json({ error: 'Missing scan link token', expired: true });

  let decoded;
  try {
    decoded = verifyWaiterToken(token);
  } catch {
    return res.status(403).json({ error: 'This scan link has expired — ask the restaurant for a new one', expired: true });
  }

  try {
    const denied = await waiterAccessError(decoded);
    if (denied) return res.status(403).json({ error: denied, expired: true });
  } catch {
    return res.status(500).json({ error: 'Failed to verify server' });
  }

  req.restaurantId = decoded.restaurantId;
  req.waiterId = decoded.waiterId;
  req.tokenExpiresAt = decoded.exp ? new Date(decoded.exp * 1000) : null;
  next();
};

export default waiterAuth;
