// Session cookie options, shared by every login (restaurant, super-admin,
// customer). They were all `secure: false`, which in production means a
// session cookie is allowed to travel over plain HTTP.
//
// `secure` follows NODE_ENV so local http development keeps working, and
// COOKIE_SECURE overrides it either way (e.g. a staging box on http, or a
// production process that doesn't set NODE_ENV).
//
// sameSite stays 'lax': the apps and the API are on sibling subdomains of the
// same site (app./dash./api.carkhanaa.in), so the cookie is sent on their
// requests, while a POST from an unrelated site still can't carry it.

const envFlag = process.env.COOKIE_SECURE?.trim().toLowerCase();

export const SECURE_COOKIES = envFlag === 'true' ? true
  : envFlag === 'false' ? false
  : process.env.NODE_ENV === 'production';

export function sessionCookie({ maxAge }) {
  return {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: 'lax',
    maxAge,
  };
}

// Must match the attributes the cookie was set with, or the browser keeps it.
export const clearCookieOptions = { httpOnly: true, secure: SECURE_COOKIES, sameSite: 'lax' };

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = { day: DAY, week: 7 * DAY };
