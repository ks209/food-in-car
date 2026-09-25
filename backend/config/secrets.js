// One source for the signing secret behind every session in the system:
// restaurant logins, the super-admin, customer sessions and waiter scan links.
//
// It used to be `process.env.JWT_SECRET || 's3cret'`, repeated in eleven
// places. A deployment that forgot the variable therefore signed real tokens
// with a value published in this repository — anyone could mint a restaurant
// or admin session. So production now refuses to start without it, rather
// than starting insecurely and looking fine.

const MIN_LENGTH = 24;

function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (fromEnv && fromEnv.length >= MIN_LENGTH && fromEnv !== 's3cret' && fromEnv !== 'supersecretjwtkey') {
    return fromEnv;
  }

  if (isProduction) {
    console.error(
      '[config] JWT_SECRET is missing, too short, or a known example value.\n' +
      `          Set it to a long random string (${MIN_LENGTH}+ chars), e.g.\n` +
      '            node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
      '          Refusing to start: every login token would be forgeable.'
    );
    process.exit(1);
  }

  // Development: keep working, but say so, and use a value that changes on
  // each boot so a dev token can never be valid anywhere else.
  console.warn('[config] JWT_SECRET not set — using a random development secret. Sessions end when this process restarts.');
  return `dev-only-${Math.random().toString(36).slice(2)}${Date.now()}`;
}

export const JWT_SECRET = resolveJwtSecret();
