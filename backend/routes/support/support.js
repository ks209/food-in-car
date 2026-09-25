import express from 'express';
import { sessionCookie, clearCookieOptions, SESSION_MAX_AGE } from '../../config/cookies.js';
import { JWT_SECRET } from '../../config/secrets.js';
import jwt from 'jsonwebtoken';
import supportAuth from '../../middlewares/support.auth.js';
import { createLoginLimiter } from '../../middlewares/loginLimiter.js';

// Super-admin: tighter, since it's one account with full access
const adminLoginLimiter = createLoginLimiter({ limit: 5 });

const supportRouter = express.Router();

// Single super-admin, credentials from env (defaults for local dev).
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

supportRouter.post('/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ code: 400, message: 'Missing fields' });

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('adminToken', token, sessionCookie({ maxAge: SESSION_MAX_AGE.day }));
    return res.json({ code: 200, message: 'loggedIn' });
  }
  return res.status(401).json({ code: 401, message: 'Invalid credentials' });
});

supportRouter.get('/me', supportAuth, (req, res) => {
  res.json({ username: req.admin.username, role: 'admin' });
});

supportRouter.post('/logout', (req, res) => {
  res.clearCookie('adminToken', clearCookieOptions);
  res.json({ message: 'Logged out' });
});

export default supportRouter;
