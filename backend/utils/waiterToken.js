import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets.js';

const SECRET = JWT_SECRET;

// Short-lived (1 day) bearer token a restaurant mints for a waiter so they can scan
// deliveries from their own phone without a login.
export function signWaiterToken({ waiterId, restaurantId }) {
  return jwt.sign({ waiterId, restaurantId, type: 'waiter' }, SECRET, { expiresIn: '1d' });
}

export function verifyWaiterToken(token) {
  const decoded = jwt.verify(token, SECRET);
  if (decoded.type !== 'waiter') throw new Error('Not a waiter token');
  return decoded;
}
