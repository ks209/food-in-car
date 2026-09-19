import rateLimit from 'express-rate-limit';

// Brute-force guard for login endpoints. Only FAILED attempts count
// (skipSuccessfulRequests), so a campus or mall full of customers sharing one
// public IP isn't locked out by each other's normal logins — only by a run of
// wrong passwords / rejected tokens.
// Each route gets its own instance so the counters don't bleed across routes.
export const createLoginLimiter = ({ limit = 10, windowMinutes = 15 } = {}) => rateLimit({
  windowMs: windowMinutes * 60 * 1000,
  limit,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: `Too many failed attempts. Please try again in ${windowMinutes} minutes.` },
});

// Customer OTP login (token check; the SMS itself is rate-limited by Firebase)
export default createLoginLimiter({ limit: 20 });
