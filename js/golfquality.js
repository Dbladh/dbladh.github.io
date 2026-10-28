// How much detail the mini-golf and the pinball table are drawn with: 'high' (larger textures, physically based materials, roughness and normal maps, the extra small props) or 'low' (the lighter look:
// small textures, plain lit materials, no normal maps). The default follows the page's own low-end check; the windmill menu can override it (remembered in this browser).
let low = false;
const KEY = 'golf.quality';

/** Decide the tier at start-up: the saved choice if there is one, else `lowEnd`. */
export function initQuality(lowEnd) {
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (err) { /* (no storage: use the default) */ }
  low = saved === 'low' ? true : saved === 'high' ? false : !!lowEnd;
}
export const isLow = () => low;
export const quality = () => (low ? 'low' : 'high');
/** Remember a choice for next time ('low', 'high', or null to follow the device again). */
export function saveQuality(q) { try { if (q) localStorage.setItem(KEY, q); else localStorage.removeItem(KEY); } catch (err) { /* (ignore) */ } }
