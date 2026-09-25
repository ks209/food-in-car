import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/secrets.js';

const userAuth = (req, res, next) => {
  const token = req.cookies?.userToken;
  if (!token) return res.status(403).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export default userAuth;
