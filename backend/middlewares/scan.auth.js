import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets.js';
import { verifyWaiterToken } from '../utils/waiterToken.js';
import { waiterTokenFrom, waiterAccessError } from './waiter.auth.js';

const SECRET = JWT_SECRET;

// Authorizes the order-scan endpoint by EITHER:
//  - a waiter token (query ?token= or Authorization: Bearer / x-waiter-token header)
//    → sets req.restaurantId + req.waiterId
//  - the restaurant session cookie (dashboard manual completion)
//    → sets req.restaurantId, req.waiterId = null
const scanAuth = async (req, res, next) => {
  const waiterToken = waiterTokenFrom(req);

  if (waiterToken) {
    let decoded;
    try {
      decoded = verifyWaiterToken(waiterToken);
    } catch {
      return res.status(403).json({ error: 'Invalid or expired scan token' });
    }
    try {
      const denied = await waiterAccessError(decoded);
      if (denied) return res.status(403).json({ error: denied });
    } catch {
      return res.status(500).json({ error: 'Failed to verify server' });
    }
    req.restaurantId = decoded.restaurantId;
    req.waiterId = decoded.waiterId;
    return next();
  }

  const cookieToken = req.cookies?.token;
  if (!cookieToken) return res.status(403).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(cookieToken, SECRET);
    req.restaurantId = decoded.id;
    req.waiterId = null;
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export default scanAuth;
