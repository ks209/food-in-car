import jwt from 'jsonwebtoken';

const userAuth = (req, res, next) => {
  const token = req.cookies?.userToken;
  if (!token) return res.status(403).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 's3cret');
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

export default userAuth;
