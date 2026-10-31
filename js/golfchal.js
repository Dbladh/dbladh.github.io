// Scoring and the per-hole challenges of the mini-golf. Pure data and rules (no THREE): which challenge a hole has (from its seed), how it is tracked, and how a hole and a round are scored.
import { mulberry32 } from './golfhero.js?v=20261030215605';

export const CHALLENGES = {
  ace: 'Hole in one', nowall: 'No wall bounces', nohazard: 'Stay out of sand and water', par: 'Finish at or under par', orbs: 'Collect every orb',
  power: 'Sink it with a power-up active', jump: 'Jump the canyon', fast: 'Finish within 25 seconds', secret: 'Find the secret coin', table: 'Light the lamps to open the cup',
};
export const CHAL_POINTS = 100;
/** The most the pinball table's own points (its bumpers, lamps, skill shot) add to hole 9: a great table is worth about one extra hole in one. */
export const TABLE_BONUS_MAX = 500;
export const tableBonus = (tablePts) => Math.min(TABLE_BONUS_MAX, Math.floor(tablePts / 5));

/** The challenge of a hole: { id, text }. Only things the hole really has are offered. */
export function makeChallenge(h, index, seed) {
  const r = mulberry32((seed ^ 0xc4a11e) >>> 0), o = ['nowall', 'par', 'fast'];
  if (h.pickups.some((p) => p.type !== 'coin')) o.push('orbs', 'power');
  if ((h.feats || []).some((f) => f.t === 'gap')) o.push('jump', 'jump', 'jump');
  if (h.sands.length || h.ponds.length || h.rivers.length) o.push('nohazard', 'nohazard');
  if (h.pickups.some((p) => p.type === 'coin')) o.push('secret', 'secret', 'secret');
  if (index >= 1) o.push('ace');
  const id = o[(r() * o.length) | 0];
  return { id, text: CHALLENGES[id] };
}
export const newChalState = () => ({ wall: 0, hazard: false, orbs: 0, secret: 0, power: false, jumped: false, overGap: false, clock: 0, lit: false });

/** 'done' (met, once the hole is holed), 'failed' (can no longer be met) or 'pending'. */
export function chalStatus(ch, cs, h, strokes, holed, midStroke) {
  switch (ch.id) {
    case 'ace': return strokes > 1 || (strokes === 1 && !holed && !midStroke) ? 'failed' : holed ? 'done' : 'pending';
    case 'nowall': return cs.wall > 0 ? 'failed' : holed ? 'done' : 'pending';
    case 'nohazard': return cs.hazard ? 'failed' : holed ? 'done' : 'pending';
    case 'par': return strokes > h.par ? 'failed' : holed ? 'done' : 'pending';
    case 'orbs': return holed ? (cs.orbs >= h.pickups.filter((p) => p.type !== 'coin').length ? 'done' : 'failed') : 'pending';
    case 'secret': return cs.secret > 0 ? 'done' : holed ? 'failed' : 'pending';
    case 'power': return holed ? (cs.power ? 'done' : 'failed') : 'pending';
    case 'jump': return holed ? (cs.jumped ? 'done' : 'failed') : cs.jumped ? 'done' : 'pending';
    case 'table': return cs.lit ? 'done' : holed ? 'failed' : 'pending';
    case 'fast': return cs.clock > 25 ? 'failed' : holed ? 'done' : 'pending';
    default: return 'pending';
  }
}

/** Points for a hole's strokes against par. */
export function holePoints(strokes, par) {
  if (strokes === 1) return 500;
  const d = strokes - par; return d <= -2 ? 300 : d === -1 ? 200 : d === 0 ? 100 : d === 1 ? 50 : 0;
}
/** The bonus for a quick round (seconds of play, not counting the camera trips between holes). */
export const speedBonus = (secs) => (secs <= 240 ? 300 : secs <= 360 ? 200 : secs <= 540 ? 100 : 0);
/** One to three stars from the round's points. */
export const starsFor = (pts) => (pts >= 1800 ? 3 : pts >= 1200 ? 2 : 1);
