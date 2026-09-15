// Restaurant opening hours and the "business day" they define.
//
// Times are "HH:MM" (24h) in IST — the platform is India-only, same assumption
// as utils/dailyOrderNumber.js. Both null means no hours configured: always
// open (subject to the manual isOpen switch) and a plain midnight-to-midnight day.
//
// Closing may be after midnight (open 18:00, close 02:00). The business day
// then ends at closing time rather than at midnight, so a 1 AM order still
// belongs to the evening's shift — same order-number sequence, same "Today".
// When closing is before midnight the day simply ends at midnight.

export const IST_OFFSET_MIN = 330;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTime(value) {
  const m = TIME_RE.exec(value || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Validates an opening/closing pair from a request body. Both blank clears the
// hours; otherwise both must be valid and different.
export function validateHours(openingTime, closingTime) {
  const openBlank = openingTime === '' || openingTime === null;
  const closeBlank = closingTime === '' || closingTime === null;
  if (openBlank && closeBlank) return { ok: true, data: { openingTime: null, closingTime: null } };
  if (openBlank || closeBlank) return { ok: false, message: 'Set both opening and closing time, or leave both blank' };
  const open = parseTime(openingTime);
  const close = parseTime(closingTime);
  if (open === null || close === null) return { ok: false, message: 'Times must be in HH:MM (24-hour) format' };
  if (open === close) return { ok: false, message: 'Opening and closing time must be different' };
  return { ok: true, data: { openingTime, closingTime } };
}

export function hasHours(restaurant) {
  return parseTime(restaurant?.openingTime) !== null && parseTime(restaurant?.closingTime) !== null;
}

// Minutes after midnight at which the business day starts (0 unless closing is
// after midnight).
export function dayStartMinutes(restaurant) {
  if (!hasHours(restaurant)) return 0;
  const open = parseTime(restaurant.openingTime);
  const close = parseTime(restaurant.closingTime);
  return close < open ? close : 0;
}

function istMinutesOfDay(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MIN * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

// Whether `date` falls inside the opening hours. No hours = always inside.
export function isWithinHours(restaurant, date = new Date()) {
  if (!hasHours(restaurant)) return true;
  const open = parseTime(restaurant.openingTime);
  const close = parseTime(restaurant.closingTime);
  const now = istMinutesOfDay(date);
  return open < close ? now >= open && now < close : now >= open || now < close;
}

// YYYY-MM-DD of the business day `date` belongs to.
export function businessDateKey(restaurant, date = new Date()) {
  const shiftMin = IST_OFFSET_MIN - dayStartMinutes(restaurant);
  return new Date(date.getTime() + shiftMin * 60000).toISOString().slice(0, 10);
}

// [start, end) of the business day `date` belongs to, as real instants.
export function businessDayRange(restaurant, date = new Date()) {
  const key = businessDateKey(restaurant, date);
  const start = new Date(Date.parse(`${key}T00:00:00Z`) + (dayStartMinutes(restaurant) - IST_OFFSET_MIN) * 60000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60000) };
}

export function formatTime12(value) {
  const mins = parseTime(value);
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// What customers see: open only when the manual switch is on AND it's within
// hours. `closedReason` lets the app say "Opens at 10:00 AM" instead of a bare
// "closed" when it's the hours (not the owner) keeping the restaurant shut.
export function customerOpenState(restaurant, date = new Date()) {
  if (!restaurant.isOpen) return { isOpen: false, closedReason: 'manual', opensAt: null };
  if (!isWithinHours(restaurant, date)) {
    return { isOpen: false, closedReason: 'hours', opensAt: formatTime12(restaurant.openingTime) };
  }
  return { isOpen: true, closedReason: null, opensAt: null };
}
