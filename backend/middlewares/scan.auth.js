import jwt from 'jsonwebtoken';
import { verifyWaiterToken } from '../utils/waiterToken.js';

const SECRET = process.env.JWT_SECRET || 's3cret';

// Authorizes the order-scan endpoint by EITHER:
//  - a waiter token (query ?token= or Authorization: Bearer / x-waiter-token header)
//    → sets req.restaurantId + req.waiterId
//  - the restaurant session cookie (dashboard manual completion)
//    → sets req.restaurantId, req.waiterId = null
const scanAuth = (req, res, next) => {
  const waiterToken =
    req.query?.token ||
    req.headers['x-waiter-token'] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (waiterToken) {
    try {
      const decoded = verifyWaiterToken(waiterToken);
      req.restaurantId = decoded.restaurantId;
      req.waiterId = decoded.waiterId;
      return next();
    } catch {
      return res.status(403).json({ error: 'Invalid or expired scan token' });
    }
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
