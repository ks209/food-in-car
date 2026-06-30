import jwt from 'jsonwebtoken';

// Guards super-admin (support portal) routes. Verifies the adminToken JWT cookie.
const supportAuth = (req, res, next) => {
  const token = req.cookies?.adminToken;
  if (!token) return res.status(403).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 's3cret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
    req.admin = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export default supportAuth;
