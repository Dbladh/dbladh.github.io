// The calendar of seasons and holidays: which are on right now, and how strongly. No THREE here. Each season has a window around its real dates; `k` (0..1) rises over a few days at the start and falls at the end,
// so nothing switches on at midnight, and `peak` (0..1) is how close it is to the day itself (the busiest fireworks, the most Santa fly-bys). A season can be chosen by hand (the weather menu) or with
// `?season=christmas` in the address, for trying it out.
export const SEASONS = [
  { id: 'christmas', name: 'Christmas' }, { id: 'newyear', name: 'New Year' }, { id: 'valentine', name: 'Valentine’s' }, { id: 'stpatrick', name: 'St Patrick’s' }, { id: 'easter', name: 'Easter' },
  { id: 'spring', name: 'Spring blossoms' }, { id: 'summer', name: 'Summer evenings' }, { id: 'july4', name: 'July 4th' }, { id: 'halloween', name: 'Halloween' }, { id: 'harvest', name: 'Harvest' },
];
const DAY = 86400000, smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/** Easter Sunday of a year (the usual computus). */
export function easterOf(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, da);
}
/** Thanksgiving (the fourth Thursday of November). */
export function thanksgivingOf(y) { const first = new Date(y, 10, 1).getDay(); return new Date(y, 10, 1 + ((4 - first + 7) % 7) + 21); }

/** A window that starts on (m1, d1) and ends at the end of (m2, d2), in the year `y` (or running over the new year): how far inside it `t` is, 0 to 1, easing in over `fi` days and out over `fo` days. */
function inWindow(t, y, m1, d1, m2, d2, fi = 3, fo = 2) {
  const s = new Date(y, m1 - 1, d1).getTime(); let e = new Date(y, m2 - 1, d2 + 1).getTime(); if (e <= s) e = new Date(y + 1, m2 - 1, d2 + 1).getTime();
  if (t < s || t > e) return 0; return Math.min(smooth((t - s) / (fi * DAY)), smooth((e - t) / (fo * DAY)));
}
const nearDay = (t, y, m, d, r) => smooth(1 - Math.abs(t - new Date(y, m - 1, d, 12).getTime()) / (r * DAY));
const best = (f, y) => Math.max(f(y - 1), f(y), f(y + 1));

/** What is on at `date`: [{ id, k, peak }] for every season with a little strength. */
export function seasonAt(date = new Date()) {
  const t = date.getTime(), y = date.getFullYear(), out = [], add = (id, k, peak = k) => { if (k > 0.005) out.push({ id, k, peak: Math.min(1, peak) }); };
  add('christmas', best((yy) => inWindow(t, yy, 12, 1, 1, 1, 4, 2), y), best((yy) => nearDay(t, yy, 12, 23, 6), y));
  add('newyear', best((yy) => inWindow(t, yy, 12, 28, 1, 3, 2, 2), y), best((yy) => nearDay(t, yy, 12, 31, 3) + nearDay(t, yy + 1, 1, 1, 2), y));
  add('valentine', best((yy) => inWindow(t, yy, 2, 7, 2, 15, 3, 2), y), best((yy) => nearDay(t, yy, 2, 14, 3), y));
  add('stpatrick', best((yy) => inWindow(t, yy, 3, 10, 3, 18, 3, 2), y), best((yy) => nearDay(t, yy, 3, 17, 3), y));
  add('easter', best((yy) => { const e = easterOf(yy), s = new Date(e.getTime() - 12 * DAY), en = new Date(e.getTime() + 1 * DAY); return inWindow(t, s.getFullYear(), s.getMonth() + 1, s.getDate(), en.getMonth() + 1, en.getDate(), 3, 2); }, y), best((yy) => { const e = easterOf(yy); return smooth(1 - Math.abs(t - e.getTime()) / (5 * DAY)); }, y));
  add('spring', best((yy) => inWindow(t, yy, 4, 1, 5, 20, 7, 7), y));
  add('summer', best((yy) => inWindow(t, yy, 6, 15, 8, 31, 7, 7), y));
  add('july4', best((yy) => inWindow(t, yy, 7, 1, 7, 5, 1, 1), y), best((yy) => nearDay(t, yy, 7, 4, 2), y));
  add('halloween', best((yy) => inWindow(t, yy, 10, 15, 11, 1, 4, 1), y), best((yy) => nearDay(t, yy, 10, 31, 6), y));
  add('harvest', best((yy) => inWindow(t, yy, 9, 15, 11, 30, 14, 5), y), best((yy) => { const th = thanksgivingOf(yy); return Math.max(smooth(1 - Math.abs(t - th.getTime()) / (6 * DAY)), nearDay(t, yy, 10, 20, 20)); }, y));
  return out;
}

/** The seasons that are on, with a hand-picked one overriding the calendar. `mode`: 'auto', 'none' or a season id. */
export function createSeasons() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('season') : null;
  let mode = q && (q === 'none' || SEASONS.some((s) => s.id === q)) ? q : 'auto', list = [], t = 0; const subs = new Set();
  const DERIVED = [['autumn', ['harvest', 'halloween']], ['bloom', ['spring', 'easter', 'stpatrick']]];     // (a layer that every season of its family brings with it: the autumn land, the spring flowers and blossom)
  const withDerived = (l) => { let out = l; for (const [id, from] of DERIVED) { const a = l.filter((x) => from.includes(x.id)); if (a.length) out = [...out, { id, k: Math.max(...a.map((x) => x.k)), peak: Math.max(...a.map((x) => x.peak)) }]; } return out; };
  const compute = () => { list = mode === 'none' ? [] : withDerived(mode === 'auto' ? seasonAt(new Date()) : [{ id: mode, k: 1, peak: 0.7 }]); };
  compute();
  return {
    get mode() { return mode; }, get active() { return list; },
    has(id) { return list.some((s) => s.id === id); },
    set(m) { mode = m; compute(); for (const f of subs) f(this); },
    onChange(f) { subs.add(f); },
    tick(dt) { t -= dt; if (t <= 0) { t = 30; if (mode === 'auto') compute(); } },
  };
}
