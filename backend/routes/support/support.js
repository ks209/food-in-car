import express from 'express';
import jwt from 'jsonwebtoken';
import supportAuth from '../../middlewares/support.auth.js';

const supportRouter = express.Router();

// Single super-admin, credentials from env (defaults for local dev).
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

supportRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ code: 400, message: 'Missing fields' });

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', username }, process.env.JWT_SECRET || 's3cret', { expiresIn: '24h' });
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return res.json({ code: 200, message: 'loggedIn' });
  }
  return res.status(401).json({ code: 401, message: 'Invalid credentials' });
});

supportRouter.get('/me', supportAuth, (req, res) => {
  res.json({ username: req.admin.username, role: 'admin' });
});

supportRouter.post('/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ message: 'Logged out' });
});

export default supportRouter;
