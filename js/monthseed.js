// The month's course, for both hidden games: everyone gets the same one for a whole calendar month (the month is read in UTC, so the whole world changes over at the same moment).
// For testing, ?month=2026-10 picks another month (?golfmonth= works too).
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** { year, month } (month 1 to 12) of the course in play. */
export function courseMonth() {
  const m = /[?&](?:golf)?month=(\d{4})-(\d{1,2})/.exec(typeof location !== 'undefined' ? location.search : ''), now = new Date();
  const year = m ? +m[1] : now.getUTCFullYear(), month = m ? Math.min(12, Math.max(1, +m[2])) : now.getUTCMonth() + 1;
  return { year, month };
}
export const monthLabel = ({ year, month }) => `${MONTH_NAMES[month - 1]} ${year}`;
/** A key for remembering things per month, such as '2026-10'. */
export const monthKey = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`;

/** A seed for the month, mixed with `salt` so each game gets its own (a whole number from 1 to 999983, like the random seeds the dirt-bike game used before). */
export function monthSeed({ year, month }, salt = 0) {
  let h = Math.imul(((year * 12 + month) ^ salt) | 0, 0x9e3779b1) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h = (h ^ (h >>> 16)) >>> 0;
  return (h % 999983) + 1;
}
